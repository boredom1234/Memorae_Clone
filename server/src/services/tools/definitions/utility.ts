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
    parseNaturalLanguageDate: tool({
      description:
        "Parse natural language time expressions to ISO date(s). Use to convert phrases like 'in 1 hour 30 minutes', 'tomorrow at 2pm', or 'next Friday 9am' into exact timestamps.",
      inputSchema: z.object({
        text: z.string().describe("Natural language time text to parse"),
        timezone: z
          .string()
          .optional()
          .describe("User timezone; if omitted, inferred from settings"),
        referenceDate: z
          .string()
          .optional()
          .describe("Reference ISO time to interpret relative expressions"),
      }),
      execute: dedupe("parseNaturalLanguageDate", async (params) => {
        const settings = await userService.getUserSettings(userId);
        const tz = params.timezone || settings?.timezone || "UTC";
        return utilityService.parseNaturalLanguageDate({
          text: params.text,
          timezone: tz,
          referenceDate: params.referenceDate,
        });
      }),
    }),
    suggestReminderTime: tool({
      description:
        "Suggest reasonable reminder times (e.g., tomorrow morning) from a task description. Use when user asks 'when should I...' or provides a task without a time.",
      inputSchema: z.object({
        taskDescription: z
          .string()
          .describe("Short description of the task to schedule"),
        timezone: z
          .string()
          .optional()
          .describe("User timezone; if omitted, inferred from settings"),
      }),
      execute: dedupe("suggestReminderTime", async (params) => {
        const settings = await userService.getUserSettings(userId);
        const tz = params.timezone || settings?.timezone || "UTC";
        return utilityService.suggestReminderTime({
          taskDescription: params.taskDescription,
          timezone: tz,
        });
      }),
    }),
    calculateTimeDifference: tool({
      description:
        "Calculate the human-friendly time difference between two ISO datetimes (use fromTime=now if omitted). Use to answer 'time left' or 'how long until' questions after retrieving the target time.",
      inputSchema: z.object({
        toTime: z
          .string()
          .describe("The target ISO 8601 datetime to compare against"),
        fromTime: z
          .string()
          .optional()
          .describe("The starting ISO time. If omitted, uses current time."),
        includeSeconds: z
          .boolean()
          .optional()
          .describe("Include seconds in the formatted output (default true when under 1 hour)"),
      }),
      execute: dedupe("calculateTimeDifference", async (params) => {
        return utilityService.calculateTimeDifference({
          toTime: params.toTime,
          fromTime: params.fromTime,
          includeSeconds: params.includeSeconds,
        });
      }),
    }),
  };
}
