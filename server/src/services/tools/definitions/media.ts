
import { tool } from "ai";
import { z } from "zod";
import {
  DedupeFunction,
  ToolServices,
} from "../tool-definitions";

export function createMediaAITools(
  userId: string,
  services: ToolServices,
  dedupe: DedupeFunction
) {
  const { mediaService } = services;

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
  };
}
