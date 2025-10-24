import { tool } from "ai";
import { z } from "zod";
import { DedupeFunction, ToolServices } from "../tool-definitions";
export function createNotificationAITools(
  userId: string,
  services: ToolServices,
  dedupe: DedupeFunction,
) {
  const { notificationService, utilityService, userService } = services;
  return {
    sendReminderToContact: tool({
      description:
        "Send reminder to contact at specific time. Trigger: remind [number] to [task].",
      inputSchema: z.object({
        recipientNumber: z
          .string()
          .regex(/^\+?[1-9]\d{1,14}$/)
          .describe('E.164 phone number, e.g. "+15551234567"'),
        recipientName: z
          .string()
          .optional()
          .describe("Optional display name for recipient"),
        reminderText: z
          .string()
          .min(1)
          .max(1000)
          .describe("Reminder text to send"),
        reminderTime: z
          .string()
          .min(1)
          .describe(
            "ISO 8601 datetime or natural language time (e.g., 'tomorrow 10am')",
          ),
        fromUserName: z
          .string()
          .optional()
          .describe("Optional sender name to include"),
      }),
      execute: dedupe("sendReminderToContact", async (params) => {
        const settings = await userService.getUserSettings(userId);
        const ctx = (params as any)._context || {};
        const tz = ctx.timezone || settings?.timezone || "UTC";
        let iso = params.reminderTime;
        const asDate = new Date(iso);
        if (isNaN(asDate.getTime())) {
          const textToParse =
            params.reminderTime || (ctx.originalMessage as string) || "";
          if (textToParse.trim().length === 0) {
            throw new Error(
              "Could not determine reminder time. Please specify a date/time.",
            );
          }
          const parsed = await utilityService.parseNaturalLanguageDate({
            text: textToParse,
            timezone: tz,
          });
          if (!parsed.success || parsed.extractedDates.length === 0) {
            throw new Error(
              `Could not parse reminder time from \"${textToParse.substring(0, 50)}\". Please specify a clear date/time.`,
            );
          }
          iso = parsed.extractedDates[0].parsedDate;
        }
        let whenMs = new Date(iso).getTime();
        const nowMs = Date.now();
        if (whenMs <= nowMs && nowMs - whenMs < 24 * 60 * 60 * 1000) {
          whenMs += 24 * 60 * 60 * 1000;
          iso = new Date(whenMs).toISOString();
        }
        if (whenMs <= nowMs) {
          throw new Error("Reminder time must be in the future");
        }
        return await notificationService.sendReminderToContact({
          senderUserId: userId,
          recipientNumber: params.recipientNumber,
          recipientName: params.recipientName,
          reminderText: params.reminderText,
          reminderTime: iso,
          fromUserName: params.fromUserName,
        });
      }),
    }),
    getNotificationHistory: tool({
      description:
        "Get notification history. Trigger: show notification history.",
      inputSchema: z.object({
        limit: z
          .number()
          .optional()
          .describe("Max results (default 20, max 100)"),
        offset: z.number().optional().describe("Offset for pagination"),
        type: z
          .enum(["reminder", "shared", "all"])
          .optional()
          .describe("Filter by type"),
      }),
      execute: dedupe("getNotificationHistory", async (params) => {
        const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
        const offset = Math.max(params.offset ?? 0, 0);
        return await notificationService.getNotificationHistory({
          userId,
          limit,
          offset,
          type: params.type,
        });
      }),
    }),
    sendCustomMessage: tool({
      description: "Send custom formatted WhatsApp message to user.",
      inputSchema: z.object({
        message: z.string().describe("Message text"),
        formatting: z.enum(["plain", "markdown"]).optional(),
        buttons: z
          .array(z.object({ id: z.string(), label: z.string() }))
          .optional(),
      }),
      execute: dedupe("sendCustomMessage", async (params) => {
        return await notificationService.sendCustomMessage(userId, {
          message: params.message,
          formatting: params.formatting,
          buttons: params.buttons,
        });
      }),
    }),
  };
}
