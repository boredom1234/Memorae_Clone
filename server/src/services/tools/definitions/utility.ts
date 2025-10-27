import { tool } from "ai";
import { z } from "zod";
import { DedupeFunction, ToolServices } from "../tool-definitions";
export function createUtilityAITools(
  userId: string,
  services: ToolServices,
  dedupe: DedupeFunction,
) {
  const { utilityService, userService, reminderQueryService, listService, listQueryService } = services;
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
    buildRecurrenceRule: tool({
      description:
        "Convert natural language recurrence (e.g., 'every weekday', 'every 2nd Saturday') into an RRULE. Provide startTime if available to set BYHOUR/BYMINUTE.",
      inputSchema: z.object({
        natural: z.string().describe("Natural language recurrence description"),
        startTime: z.string().optional().describe("Start ISO datetime to infer time components"),
      }),
      execute: dedupe("buildRecurrenceRule", async (params) => {
        const settings = await userService.getUserSettings(userId);
        const tz = settings?.timezone || "UTC";
        return utilityService.buildRecurrenceRule({
          natural: params.natural,
          timezone: tz,
          startTime: params.startTime,
        });
      }),
    }),
    explainRecurrenceRule: tool({
      description:
        "Explain an RRULE in friendly natural language so the user can confirm it.",
      inputSchema: z.object({
        rrule: z.string().describe("RRULE to explain"),
      }),
      execute: dedupe("explainRecurrenceRule", async (params) => {
        return utilityService.explainRecurrenceRule(params.rrule);
      }),
    }),
    getNextOccurrences: tool({
      description:
        "Compute the next N occurrence timestamps for a given RRULE or reminderId.",
      inputSchema: z.object({
        rrule: z.string().optional().describe("RRULE; provide either this or reminderId"),
        reminderId: z.string().optional().describe("Reminder ID; alternative to RRULE"),
        count: z.number().optional().describe("Number of occurrences to return (default 5)"),
        startTime: z.string().optional().describe("Start from this ISO time if provided"),
      }),
      execute: dedupe("getNextOccurrences", async (params) => {
        const settings = await userService.getUserSettings(userId);
        const tz = settings?.timezone || "UTC";
        return utilityService.getNextOccurrences({
          rrule: params.rrule,
          reminderId: params.reminderId,
          count: params.count || 5,
          timezone: tz,
          startTime: params.startTime,
        });
      }),
    }),
    resolveReminderByText: tool({
      description:
        "Resolve a reminder by fuzzy text, returning the best matching reminder id/title/time.",
      inputSchema: z.object({
        query: z.string().describe("Text describing the reminder"),
      }),
      execute: dedupe("resolveReminderByText", async (params) => {
        const res = await reminderQueryService.searchReminders({
          userId,
          query: params.query,
          limit: 5,
        });
        if (!res.results || res.results.length === 0) {
          return { success: false, message: "No matching reminders found" };
        }
        const best = res.results[0];
        return {
          success: true,
          id: best.id,
          title: best.title,
          reminderTime: best.reminderTime,
          candidates: res.results,
        };
      }),
    }),
    resolveListByName: tool({
      description:
        "Resolve a list by name, returning its listId. Uses fuzzy normalization (e.g., 'my shopping list' → 'shopping').",
      inputSchema: z.object({
        name: z.string().describe("List name provided by the user"),
      }),
      execute: dedupe("resolveListByName", async (params) => {
        const listId = await listService.findListByName(userId, params.name);
        if (!listId) return { success: false, message: "List not found" };
        return { success: true, listId };
      }),
    }),
    parseItemsFromText: tool({
      description:
        "Parse multiple list items from unstructured text or pasted lines/CSV/bullets.",
      inputSchema: z.object({
        text: z.string().describe("Raw text containing items (lines, commas, bullets)"),
      }),
      execute: dedupe("parseItemsFromText", async (params) => {
        return utilityService.parseListItemsFromText(params.text);
      }),
    }),
    extractTasksFromText: tool({
      description:
        "Extract likely task lines from a block of text (notes, OCR, transcript).",
      inputSchema: z.object({
        text: z.string().describe("Text to scan for tasks"),
      }),
      execute: dedupe("extractTasksFromText", async (params) => {
        return utilityService.extractTasksFromText(params.text);
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
