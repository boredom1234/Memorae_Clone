import { tool } from "ai";
import { z } from "zod";
import { DedupeFunction, ToolServices } from "../tool-definitions";
export function createReminderAITools(
  userId: string,
  services: ToolServices,
  dedupe: DedupeFunction,
) {
  const {
    reminderService,
    reminderActionsService,
    reminderQueryService,
    userService,
    utilityService,
  } = services;
  return {
    createReminder: tool({
      description:
        "Create a new reminder for a specific date/time. Use when user wants to be reminded about something. Supports both one-time and recurring reminders (daily, weekly, monthly). Examples: 'remind me to X', 'set a reminder', 'set a timer', 'notify me about', 'alert me when', 'schedule reminder'. CRITICAL: ALWAYS extract time information from the user's message via naturalTimeText. For durations like '1 hour 43 minutes from now' or 'timer for 30 minutes', extract the FULL time expression as naturalTimeText.",
      inputSchema: z.object({
        title: z.string().describe("The reminder title/description"),
        reminderTime: z
          .string()
          .optional()
          .describe(
            "ISO 8601 datetime string when the reminder should trigger. Provide this OR naturalTimeText.",
          ),
        naturalTimeText: z
          .string()
          .optional()
          .describe(
            'Natural language time description extracted from user message (e.g., "tomorrow at 3pm", "in 30 minutes", "next Monday 9am", "now"). STRONGLY PREFERRED over reminderTime - always try to extract this from the user\'s message. For recurring reminders without explicit time, use "now" or "in 1 minute".',
          ),
        isRecurring: z
          .boolean()
          .optional()
          .default(false)
          .describe("Whether this is a recurring reminder"),
        recurrenceRule: z
          .string()
          .optional()
          .describe(
            'Recurrence rule. Accepts either plain English (e.g., "daily", "every 2 weeks", "weekdays") OR iCalendar RRULE (e.g., "FREQ=MONTHLY;BYDAY=SA;BYSETPOS=2,4" for 2nd and 4th Saturday).',
          ),
        notes: z
          .string()
          .optional()
          .describe(
            "Additional notes - ALWAYS try to extract context from the user's message to fill this field",
          ),
        priority: z
          .enum(["low", "medium", "high"])
          .optional()
          .describe(
            "Priority level - infer from urgency keywords (urgent/ASAP/important=high, later/sometime=low, default=medium)",
          ),
      }),
      execute: dedupe("createReminder", async (params) => {
        if (
          !params.title ||
          typeof params.title !== "string" ||
          params.title.trim().length === 0
        ) {
          throw new Error("Reminder title is required and cannot be empty.");
        }
        const settings = await userService.getUserSettings(userId);
        const ctx = (params as any)._context || {};
        const tz = ctx.timezone || settings?.timezone || "UTC";
        let finalTime = params.reminderTime;
        if (params.naturalTimeText || !finalTime) {
          const textToParse =
            params.naturalTimeText ||
            params.reminderTime ||
            (ctx.originalMessage as string) ||
            "";
          if (textToParse.trim().length > 0) {
            const parsed = utilityService.parseNaturalLanguageDate({
              text: textToParse,
              timezone: tz,
            });
            if (parsed.success && parsed.extractedDates.length > 0) {
              const bestDate = utilityService.pickBestDate(
                parsed.extractedDates,
              );
              if (bestDate) {
                finalTime = bestDate;
              }
            }
          }
        }
        if (!finalTime) {
          if (params.isRecurring) {
            const now = new Date();
            now.setMinutes(now.getMinutes() + 1);
            finalTime = now.toISOString();
          } else {
            throw new Error(
              "Could not determine reminder time. Please specify a valid date/time.",
            );
          }
        }
        const parsedDate = new Date(finalTime);
        if (isNaN(parsedDate.getTime())) {
          throw new Error("Invalid reminder time format.");
        }
        if (parsedDate.getTime() <= Date.now()) {
          finalTime = utilityService.ensureFuture(finalTime, tz);
        }
        const normalizedTitle = params.title.trim().replace(/\s+/g, " ");
        if (!normalizedTitle) {
          throw new Error("Reminder title cannot be empty.");
        }
        return await reminderService.createReminder({
          userId,
          title: normalizedTitle,
          reminderTime: finalTime,
          timezone: tz,
          isRecurring: params.isRecurring ?? false,
          recurrenceRule: params.recurrenceRule,
          notes: params.notes,
          priority: params.priority,
        });
      }),
    }),
    updateReminder: tool({
      description:
        "Update an existing reminder's time, title, or priority. Use when user wants to modify a reminder. Examples: 'change the X reminder to Y', 'update reminder time to Z', 'reschedule the dentist to 3pm', 'move the meeting reminder', 'edit reminder about X'. Searches for the reminder first.",
      inputSchema: z.object({
        searchQuery: z.string().describe("Text to search for the reminder"),
        title: z.string().optional().describe("New title for the reminder"),
        reminderTime: z.string().optional().describe("New ISO 8601 datetime"),
        naturalTimeText: z
          .string()
          .optional()
          .describe("Natural language time for update"),
        priority: z
          .enum(["low", "medium", "high"])
          .optional()
          .describe("New priority"),
      }),
      execute: dedupe("updateReminder", async (params) => {
        if (
          !params.searchQuery ||
          typeof params.searchQuery !== "string" ||
          params.searchQuery.trim().length === 0
        ) {
          throw new Error(
            "Search query is required to find the reminder to update.",
          );
        }
        const settings = await userService.getUserSettings(userId);
        const ctx = (params as any)._context || {};
        const tz = ctx.timezone || settings?.timezone || "UTC";
        const searchResult = await reminderQueryService.searchReminders({
          userId,
          query: params.searchQuery,
          limit: 5,
        });
        if (searchResult.results.length === 0) {
          throw new Error(
            "Could not find any reminders matching that description.",
          );
        }
        if (searchResult.results.length > 1) {
          return {
            needsSelection: true,
            message: "I found multiple reminders. Which one did you mean?",
            candidates: searchResult.results.map((r: any, idx: number) => ({
              id: r.id,
              number: idx + 1,
              title: r.title,
              time: r.reminderTime,
              type: "reminder",
            })),
          };
        }
        let finalTime = params.reminderTime;
        if (
          params.naturalTimeText ||
          (params.reminderTime &&
            isNaN(new Date(params.reminderTime).getTime()))
        ) {
          const textToParse =
            params.naturalTimeText ||
            params.reminderTime ||
            (ctx.originalMessage as string) ||
            "";
          if (textToParse.trim()) {
            const parsed = utilityService.parseNaturalLanguageDate({
              text: textToParse,
              timezone: tz,
            });
            if (parsed.success && parsed.extractedDates.length > 0) {
              const bestDate = utilityService.pickBestDate(
                parsed.extractedDates,
              );
              if (bestDate) {
                finalTime = bestDate;
              }
            }
            if (!finalTime && params.naturalTimeText) {
              throw new Error(
                `Could not parse the time "${params.naturalTimeText}". Please try a different format like "3:00 PM" or "15:30".`,
              );
            }
          }
        }
        if (finalTime) {
          const parsedDate = new Date(finalTime);
          if (isNaN(parsedDate.getTime())) {
            throw new Error(
              `Invalid time format: "${finalTime}". Please try a different format.`,
            );
          }
          if (parsedDate.getTime() <= Date.now()) {
            finalTime = utilityService.ensureFuture(finalTime, tz);
          }
        }
        const normalizedTitle = params.title
          ? params.title.trim().replace(/\s+/g, " ")
          : undefined;
        if (!normalizedTitle && !finalTime && !params.priority) {
          throw new Error(
            "Please specify what you want to update (title, time, or priority).",
          );
        }
        return await reminderService.updateReminder({
          userId,
          reminderId: searchResult.results[0].id,
          title: normalizedTitle,
          reminderTime: finalTime,
          priority: params.priority,
        });
      }),
    }),
    deleteReminder: tool({
      description:
        "Permanently delete or cancel a reminder by searching for it. Use when user wants to remove a reminder. Examples: 'delete reminder about X', 'remove the X reminder', 'cancel reminder for Y', 'clear the reminder'. Will ask for confirmation if reminder is recurring.",
      inputSchema: z.object({
        searchQuery: z
          .string()
          .describe("Text to search for the reminder to delete"),
      }),
      execute: dedupe("deleteReminder", async (params) => {
        const searchResult = await reminderQueryService.searchReminders({
          userId,
          query: params.searchQuery,
          limit: 5,
        });
        if (searchResult.results.length === 0) {
          throw new Error(
            "Could not find any reminders matching that description.",
          );
        }
        if (searchResult.results.length > 1) {
          return {
            needsSelection: true,
            message:
              "I found multiple reminders. Which one do you want to delete?",
            candidates: searchResult.results.map((r: any, idx: number) => ({
              id: r.id,
              number: idx + 1,
              title: r.title,
              time: r.reminderTime,
              type: "reminder",
            })),
          };
        }
        const reminder = searchResult.results[0];
        return await reminderService.deleteReminder({
          userId,
          reminderId: reminder.id,
        });
      }),
    }),
    listReminders: tool({
      description:
        "List all reminders with optional filters for status (pending/completed). Use when user wants to see their reminders. Examples: 'show my reminders', 'list reminders', 'what reminders do I have', 'display all reminders', 'show pending reminders'.",
      inputSchema: z.object({
        status: z
          .enum(["pending", "completed", "all"])
          .optional()
          .describe("Filter by status"),
        limit: z
          .number()
          .optional()
          .describe("Maximum number of reminders to return"),
      }),
      execute: dedupe("listReminders", async (params) => {
        return await reminderQueryService.listReminders({
          userId,
          status: params.status || "pending",
          limit: params.limit || 10,
          sortBy: "time",
        });
      }),
    }),
    completeReminder: tool({
      description:
        "Mark reminder as done (status only, not deleted). Triggers: complete, done, finished, mark as done.",
      inputSchema: z.object({
        searchQuery: z
          .string()
          .describe("Text to search for the reminder to complete"),
      }),
      execute: dedupe("completeReminder", async (params) => {
        const searchResult = await reminderQueryService.searchReminders({
          userId,
          query: params.searchQuery,
          limit: 1,
        });
        if (searchResult.results.length === 0) {
          throw new Error("Could not find that reminder");
        }
        return await reminderActionsService.completeReminder({
          userId,
          reminderId: searchResult.results[0].id,
        });
      }),
    }),
    searchReminders: tool({
      description:
        "Search reminders by keyword/title. Triggers: find, search, look for, where is.",
      inputSchema: z.object({
        query: z.string().describe("Search query"),
        limit: z.number().optional().describe("Maximum results"),
        includeCompleted: z
          .boolean()
          .optional()
          .describe("Whether to include completed reminders"),
      }),
      execute: dedupe("searchReminders", async (params) => {
        return await reminderQueryService.searchReminders({
          userId,
          query: params.query,
          limit: params.limit || 10,
        });
      }),
    }),
    snoozeReminder: tool({
      description:
        "Postpone reminder to later time. Triggers: snooze, postpone, delay, push back, later.",
      inputSchema: z.object({
        searchQuery: z
          .string()
          .describe("Text to search for the reminder to snooze"),
        snoozeUntil: z
          .string()
          .optional()
          .describe(
            "ISO 8601 datetime when the reminder should trigger after snoozing",
          ),
        naturalTimeText: z
          .string()
          .optional()
          .describe(
            'Natural language time (e.g., "in 10 minutes", "tomorrow 3pm")',
          ),
      }),
      execute: dedupe("snoozeReminder", async (params) => {
        if (
          !params.searchQuery ||
          typeof params.searchQuery !== "string" ||
          params.searchQuery.trim().length === 0
        ) {
          throw new Error(
            "Search query is required to find the reminder to snooze.",
          );
        }
        const settings = await userService.getUserSettings(userId);
        const ctx = (params as any)._context || {};
        const tz = ctx.timezone || settings?.timezone || "UTC";
        const searchResult = await reminderQueryService.searchReminders({
          userId,
          query: params.searchQuery,
          limit: 5,
        });
        if (searchResult.results.length === 0) {
          throw new Error(
            "Could not find any reminders matching that description.",
          );
        }
        if (searchResult.results.length > 1) {
          return {
            needsSelection: true,
            message:
              "I found multiple reminders. Which one do you want to snooze?",
            candidates: searchResult.results.map((r: any, idx: number) => ({
              id: r.id,
              number: idx + 1,
              title: r.title,
              time: r.reminderTime,
              type: "reminder",
            })),
          };
        }
        let finalTime = params.snoozeUntil;
        if (params.naturalTimeText || !finalTime) {
          const textToParse =
            params.naturalTimeText ||
            params.snoozeUntil ||
            (ctx.originalMessage as string) ||
            "";
          const parsed = utilityService.parseNaturalLanguageDate({
            text: textToParse,
            timezone: tz,
          });
          if (parsed.success && parsed.extractedDates.length > 0) {
            finalTime =
              utilityService.pickBestDate(parsed.extractedDates) || finalTime;
          }
        }
        if (!finalTime) {
          throw new Error(
            "Please specify when to snooze until (e.g., 'in 10 minutes', 'tomorrow 3pm').",
          );
        }
        const parsedDate = new Date(finalTime);
        if (parsedDate.getTime() <= Date.now()) {
          throw new Error("Snooze time must be in the future.");
        }
        return await reminderActionsService.snoozeReminder({
          userId,
          reminderId: searchResult.results[0].id,
          snoozeUntil: finalTime,
          snoozeDuration: 0,
        });
      }),
    }),
    getUpcomingReminders: tool({
      description:
        "Get reminders for a specific timeframe: today, tomorrow, this week, or this month. Use when user asks about reminders in a specific time period. Examples: 'what reminders do I have today?', 'show tomorrow's reminders', 'what's coming up this week', 'reminders for this month'.",
      inputSchema: z.object({
        timeframe: z
          .enum(["today", "tomorrow", "week", "month"])
          .describe("The timeframe to get reminders for"),
        limit: z
          .number()
          .optional()
          .describe("Maximum number of reminders to return"),
      }),
      execute: dedupe("getUpcomingReminders", async (params) => {
        return await reminderQueryService.getUpcomingReminders({
          userId,
          timeframe: params.timeframe,
          limit: params.limit || 10,
        });
      }),
    }),
    batchCreateReminders: tool({
      description:
        "Create multiple reminders at once. Triggers: remind me to [list], set reminders for.",
      inputSchema: z.object({
        reminders: z
          .array(
            z.object({
              title: z.string().describe("The reminder title/description"),
              reminderTime: z
                .string()
                .describe(
                  "ISO 8601 datetime string when the reminder should trigger",
                ),
              isRecurring: z
                .boolean()
                .optional()
                .describe("Whether this is a recurring reminder"),
              recurrenceRule: z
                .string()
                .optional()
                .describe(
                  'Recurrence rule in plain English or RRULE. Examples: "daily" or "FREQ=WEEKLY;BYDAY=MO,WE,FR".',
                ),
            }),
          )
          .describe("Array of reminders to create"),
      }),
      execute: dedupe("batchCreateReminders", async (params) => {
        return await reminderService.batchCreateReminders({
          userId,
          reminders: params.reminders,
        });
      }),
    }),
    archiveReminder: tool({
      description:
        "Archive reminder (soft delete, status=cancelled). Triggers: archive, hide, don't delete.",
      inputSchema: z.object({
        searchQuery: z
          .string()
          .describe("Text to search for the reminder to archive"),
      }),
      execute: dedupe("archiveReminder", async (params) => {
        const searchResult = await reminderQueryService.searchReminders({
          userId,
          query: params.searchQuery,
          limit: 1,
        });
        if (searchResult.results.length === 0) {
          throw new Error("Could not find that reminder");
        }
        return await reminderService.archiveReminder({
          userId,
          reminderId: searchResult.results[0].id,
        });
      }),
    }),
  };
}
