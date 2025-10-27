import { tool } from "ai";
import { z } from "zod";
import { DedupeFunction, ToolServices } from "../tool-definitions";
export function createMediaAITools(
  userId: string,
  services: ToolServices,
  dedupe: DedupeFunction,
) {
  const {
    mediaService,
    userService,
    utilityService,
    reminderService,
    listItemService,
    listService,
  } = services;
  return {
    getMediaHistory: tool({
      description:
        "Get user's image/media history with OCR text. Triggers: show images, my images, media history.",
      inputSchema: z.object({
        mediaType: z
          .enum(["image", "audio", "video", "document"])
          .optional()
          .describe("Filter by media type"),
        limit: z
          .number()
          .optional()
          .describe("Max results (default 10, max 50)"),
      }),
      execute: dedupe("getMediaHistory", async (params) => {
        const result = await mediaService.getUserAttachments(userId, {
          mediaType: params.mediaType,
          limit: Math.min(params.limit || 10, 50),
        });
        return {
          success: true,
          attachments: result.attachments.map((a) => ({
            id: a.id,
            type: a.mediaType,
            fileUrl: a.fileUrl,
            extractedText: a.extractedText?.substring(0, 200),
            createdAt: a.createdAt,
            hasReminder: !!a.reminderId,
            hasList: !!a.listItemId,
          })),
          total: result.total,
          message: `Found ${result.total} media attachment(s). You can view them at the URLs provided.`,
        };
      }),
    }),
    searchMediaByText: tool({
      description:
        "Search through extracted text from images. Triggers: find in images, search images, what image.",
      inputSchema: z.object({
        query: z.string().describe("Text to search for in OCR results"),
        limit: z.number().optional().describe("Max results (default 5)"),
      }),
      execute: dedupe("searchMediaByText", async (params) => {
        const results = await mediaService.searchByText(userId, params.query, {
          limit: params.limit || 5,
        });
        if (results.length === 0) {
          return {
            success: true,
            results: [],
            message: `No images found containing "${params.query}"`,
          };
        }
        return {
          success: true,
          results: results.map((r) => ({
            id: r.id,
            fileUrl: r.fileUrl,
            extractedText: r.extractedText,
            createdAt: r.createdAt,
            linkedToReminder: !!r.reminderId,
            linkedToList: !!r.listItemId,
          })),
          message: `Found ${results.length} image(s) containing "${params.query}". You can view them at the URLs provided.`,
        };
      }),
    }),
    getMediaStats: tool({
      description:
        "Get statistics about user's media attachments. Triggers: media stats, how many images.",
      inputSchema: z.object({}),
      execute: dedupe("getMediaStats", async () => {
        const stats = await mediaService.getAttachmentStats(userId);
        return {
          success: true,
          ...stats,
          message: `You have ${stats.total} media attachment(s): ${stats.withOCR} with OCR, ${stats.linked} linked to items`,
        };
      }),
    }),
    createRemindersFromImage: tool({
      description:
        "Create reminders from an image's extracted text (OCR). If OCR wasn't run, ask to run ocrMediaAttachment first.",
      inputSchema: z.object({
        attachmentId: z.string().describe("Media attachment ID"),
        maxReminders: z.number().optional().describe("Max reminders to create (default 5)"),
      }),
      execute: dedupe("createRemindersFromImage", async (params) => {
        const attach = await mediaService.getAttachment(params.attachmentId);
        if (!attach || !attach.extractedText) {
          return {
            success: false,
            created: 0,
            message:
              "No OCR text available for this image. Please run ocrMediaAttachment first, then retry.",
          };
        }
        const settings = await userService.getUserSettings(userId);
        const tz = settings?.timezone || "UTC";
        // Extract candidate tasks from OCR text
        const { tasks } = utilityService.extractTasksFromText(attach.extractedText || "");
        const candidates = tasks.length > 0 ? tasks : (attach.extractedText || "").split(/\r?\n/).slice(0, 20);
        const limit = Math.min(params.maxReminders || 5, 20);
        let created = 0;
        const errors: string[] = [];
        for (const line of candidates.slice(0, limit)) {
          const text = (line || "").trim();
          if (!text) continue;
          // Try parse date/time from line; if none, suggest a time
          const parsed = utilityService.parseNaturalLanguageDate({ text, timezone: tz });
          let reminderTime: string | null = null;
          if (parsed.success && parsed.extractedDates.length > 0) {
            reminderTime = utilityService.pickBestDate(parsed.extractedDates);
          }
          if (!reminderTime) {
            const suggest = utilityService.suggestReminderTime({ taskDescription: text, timezone: tz });
            reminderTime = suggest.suggestedTimes[0]?.time || null;
          }
          if (!reminderTime) {
            continue;
          }
          try {
            await reminderService.createReminder({
              userId,
              title: text.length > 200 ? text.slice(0, 200) : text,
              reminderTime,
              timezone: tz,
              isRecurring: false,
              notes: `From image ${params.attachmentId}`,
            });
            created++;
          } catch (e: any) {
            errors.push(e?.message || "failed");
          }
        }
        return {
          success: created > 0,
          created,
          message:
            created > 0
              ? `Created ${created} reminder(s) from image.`
              : "No suitable tasks found to create reminders.",
          errors: errors.length ? errors : undefined,
        };
      }),
    }),
    extractListFromImage: tool({
      description:
        "Extract list items from an image and add them to a list (create if missing).",
      inputSchema: z.object({
        attachmentId: z.string().describe("Media attachment ID"),
        listName: z.string().optional().describe("Target list name; created if missing"),
      }),
      execute: dedupe("extractListFromImage", async (params) => {
        const attach = await mediaService.getAttachment(params.attachmentId);
        if (!attach || !attach.extractedText) {
          return {
            success: false,
            added: 0,
            message:
              "No OCR text available for this image. Please run ocrMediaAttachment first, then retry.",
          };
        }
        const text = attach.extractedText;
        const { items } = utilityService.parseListItemsFromText(text);
        if (items.length === 0) {
          return { success: false, added: 0, message: "No list items recognized in the image." };
        }
        const listName = params.listName || (/\b(shop|grocery|buy)\b/i.test(text) ? "Shopping" : "From Image");
        try {
          const res = await listItemService.addItemToList({ userId, listName, items: items.slice(0, 100) });
          return {
            success: true,
            added: res.addedCount,
            listName,
            message: `Added ${res.addedCount} item(s) to list "${listName}"`,
          };
        } catch (e: any) {
          // Try create the list then add
          try {
            await listService.createList({ userId, name: listName, items: items.slice(0, 100) });
            return {
              success: true,
              added: Math.min(items.length, 100),
              listName,
              message: `Created list "${listName}" with ${Math.min(items.length, 100)} item(s).`,
            };
          } catch (e2: any) {
            return { success: false, added: 0, message: e2?.message || "Failed to add items" };
          }
        }
      }),
    }),
  };
}
