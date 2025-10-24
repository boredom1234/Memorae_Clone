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
        "Get current time/date in user timezone. ONLY use when user explicitly asks 'what time is it', 'what's the date', 'current time'. Do NOT use for vague questions like 'which day?', 'when?', 'what?'",
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
