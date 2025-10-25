import { tool } from "ai";
import { z } from "zod";
import { DedupeFunction, ToolServices } from "../tool-definitions";
export function createUtilityAITools(
  userId: string,
  services: ToolServices,
  dedupe: DedupeFunction,
) {
  const { utilityService, userService } = services;
  return {
    getCurrentTime: tool({
      description:
        "Get current time/date in user timezone. Use when: (1) User explicitly asks for time/date (2) You need to calculate relative times like 'in 2 hours from now' or 'timer for X minutes' (3) Context requires knowing current time to process time-based requests. Examples: 'what time is it', 'set timer for 30 minutes', 'remind me in 2 hours'.",
      inputSchema: z.object({}),
      execute: dedupe("getCurrentTime", async () => {
        const settings = await userService.getUserSettings(userId);
        const tz = settings?.timezone || "UTC";
        return await utilityService.getCurrentTime({
          timezone: tz,
        });
      }),
    }),
  };
}
