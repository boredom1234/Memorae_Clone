
import { tool } from "ai";
import { z } from "zod";
import {
  DedupeFunction,
  ToolServices,
} from "../tool-definitions";

export function createActivityAITools(
  userId: string,
  services: ToolServices,
  dedupe: DedupeFunction
) {
  const { activityService } = services;

  return {
    getActivityFeed: tool({
      description:
        "Get recent activity across reminders, lists, and notes. Triggers: activity, recent changes, what happened, history.",
      inputSchema: z.object({
        limit: z
          .number()
          .optional()
          .describe("Maximum number of activities to return (default 20)"),
        types: z
          .array(z.enum(["reminder", "list", "note", "all"]))
          .optional()
          .describe("Filter by activity types (default: all)"),
      }),
      execute: dedupe("getActivityFeed", async (params) => {
        return await activityService.getActivityFeed({
          userId,
          limit: params.limit || 20,
          types: params.types || ["all"],
        });
      }),
    }),
  };
}
