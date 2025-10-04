import * as chrono from "chrono-node";
import { wallClockToUTCFromZone, formatInZone } from "../utils/time-utils";
import {
  validate,
  parseNaturalLanguageDateSchema,
  detectIntentSchema,
  suggestReminderTimeSchema,
} from "../utils/validators";
import { handleServiceError, ValidationError } from "../utils/errors";
import { logError, logPerformance, logWarn } from "../utils/logger";

export class UtilityService {
  parseNaturalLanguageDate(params: {
    text: string;
    timezone: string;
    referenceDate?: string;
  }): {
    success: boolean;
    extractedDates: Array<{
      originalText: string;
      parsedDate: string;
      confidence: number;
      type: "absolute" | "relative";
    }>;
  } {
    const startTime = Date.now();

    try {
      // Validate input
      const validatedParams = validate(parseNaturalLanguageDateSchema, params);

      if (!validatedParams.text || validatedParams.text.trim().length === 0) {
        throw new ValidationError("Text cannot be empty");
      }

      const referenceDate = validatedParams.referenceDate
        ? new Date(validatedParams.referenceDate)
        : new Date();

      // Validate reference date
      if (isNaN(referenceDate.getTime())) {
        throw new ValidationError("Invalid reference date");
      }

      const results = chrono.parse(validatedParams.text, referenceDate);

      const extractedDates = results
        .map((result) => {
          try {
            const date = result.start.date();
            // Interpret the parsed wall-clock time in the user's timezone and convert to UTC
            const utcISO = wallClockToUTCFromZone(
              date,
              validatedParams.timezone,
            );
            return {
              originalText: result.text,
              parsedDate: utcISO,
              confidence: result.start.isCertain("hour") ? 0.9 : 0.7,
              type: result.start.isCertain("day")
                ? ("absolute" as const)
                : ("relative" as const),
            };
          } catch (error) {
            logWarn("Failed to parse date result", {
              text: result.text,
              error,
            });
            return null;
          }
        })
        .filter((d): d is NonNullable<typeof d> => d !== null);

      logPerformance("parseNaturalLanguageDate", Date.now() - startTime, {
        count: extractedDates.length,
      });

      return {
        success: extractedDates.length > 0,
        extractedDates,
      };
    } catch (error) {
      logError("Failed to parse natural language date", error, {
        text: params.text,
      });
      throw handleServiceError(error, "parseNaturalLanguageDate");
    }
  }

  detectIntent(params: { message: string; conversationContext?: string[] }): {
    intent: string;
    confidence: number;
    entities: {
      dates?: string[];
      times?: string[];
      priorities?: string[];
      names?: string[];
    };
    isActionIntent: boolean;
  } {
    const startTime = Date.now();

    try {
      // Validate input
      const validatedParams = validate(detectIntentSchema, params);

      if (
        !validatedParams.message ||
        validatedParams.message.trim().length === 0
      ) {
        throw new ValidationError("Message cannot be empty");
      }

      const message = validatedParams.message.toLowerCase();
      let intent = "unknown";
      let confidence = 0.5;
      const entities: any = {};
      let isActionIntent = false;

      // Reminder creation patterns
      if (
        message.includes("remind me") ||
        message.includes("reminder") ||
        message.includes("set a reminder") ||
        message.includes("schedule")
      ) {
        intent = "createReminder";
        confidence = 0.9;
        isActionIntent = true;
      }
      // Update/modify patterns
      else if (
        message.includes("update") ||
        message.includes("change") ||
        message.includes("modify") ||
        message.includes("reschedule")
      ) {
        intent = "updateReminder";
        confidence = 0.85;
        isActionIntent = true;
      }
      // Delete/remove patterns
      else if (
        message.includes("delete") ||
        message.includes("remove") ||
        message.includes("cancel")
      ) {
        if (message.includes("reminder")) {
          intent = "deleteReminder";
          confidence = 0.9;
        } else if (message.includes("list")) {
          intent = "deleteList";
          confidence = 0.85;
        } else {
          intent = "deleteReminder";
          confidence = 0.7;
        }
        isActionIntent = true;
      }
      // Snooze patterns
      else if (
        message.includes("snooze") ||
        message.includes("postpone") ||
        message.includes("delay")
      ) {
        intent = "snoozeReminder";
        confidence = 0.9;
        isActionIntent = true;
      }
      // List management patterns
      else if (
        message.includes("add to list") ||
        message.includes("add to my list") ||
        message.includes("shopping list") ||
        message.includes("todo list")
      ) {
        intent = "addItemToList";
        confidence = 0.85;
        isActionIntent = true;
      }
      // Personal info/settings queries
      else if (
        message.includes("my name") ||
        message.includes("who am i") ||
        message.includes("my phone") ||
        message.includes("my timezone") ||
        message.includes("my language") ||
        message.includes("my settings") ||
        message.includes("quiet hours")
      ) {
        intent = "getUserSettings";
        confidence = 0.9;
        isActionIntent = false; // Query, not action
      }
      // Query patterns
      else if (
        message.includes("show me") ||
        message.includes("what") ||
        message.includes("list my") ||
        message.includes("upcoming")
      ) {
        if (message.includes("reminder")) {
          intent = "listReminders";
          confidence = 0.8;
        } else if (message.includes("list")) {
          intent = "getLists";
          confidence = 0.8;
        }
        isActionIntent = false; // Query, not action
      }
      // Completion patterns
      else if (
        message.includes("done") ||
        message.includes("complete") ||
        message.includes("finished")
      ) {
        intent = "completeReminder";
        confidence = 0.75;
        isActionIntent = true;
      }

      // Extract dates with error handling
      try {
        const dateResults = chrono.parse(message);
        if (dateResults.length > 0) {
          entities.dates = dateResults
            .map((r) => {
              try {
                return r.start.date().toISOString();
              } catch (error) {
                logWarn("Failed to parse date in intent detection", {
                  text: r.text,
                });
                return null;
              }
            })
            .filter((d): d is string => d !== null);
        }
      } catch (error) {
        logWarn("Failed to extract dates from message", { message });
      }

      // Extract priorities
      if (
        message.includes("high priority") ||
        message.includes("urgent") ||
        message.includes("important")
      ) {
        entities.priorities = ["high"];
      } else if (message.includes("low priority")) {
        entities.priorities = ["low"];
      }

      logPerformance("detectIntent", Date.now() - startTime, {
        intent,
        confidence,
        isActionIntent,
      });

      return {
        intent,
        confidence,
        entities,
        isActionIntent,
      };
    } catch (error) {
      logError("Failed to detect intent", error, { message: params.message });
      throw handleServiceError(error, "detectIntent");
    }
  }

  suggestReminderTime(params: {
    taskDescription: string;
    userSchedule?: Array<{ startTime: string; endTime: string }>;
  }): {
    suggestedTimes: Array<{
      time: string;
      reason: string;
      confidence: number;
    }>;
  } {
    const startTime = Date.now();

    try {
      // Validate input
      const validatedParams = validate(suggestReminderTimeSchema, params);

      if (
        !validatedParams.taskDescription ||
        validatedParams.taskDescription.trim().length === 0
      ) {
        throw new ValidationError("Task description cannot be empty");
      }

      const now = new Date();
      const suggestedTimes: Array<{
        time: string;
        reason: string;
        confidence: number;
      }> = [];

      // Default suggestions
      const tomorrow9am = new Date(now);
      tomorrow9am.setDate(tomorrow9am.getDate() + 1);
      tomorrow9am.setHours(9, 0, 0, 0);

      suggestedTimes.push({
        time: tomorrow9am.toISOString(),
        reason: "Tomorrow morning at 9 AM",
        confidence: 0.8,
      });

      const todayEvening = new Date(now);
      todayEvening.setHours(18, 0, 0, 0);

      if (todayEvening > now) {
        suggestedTimes.push({
          time: todayEvening.toISOString(),
          reason: "Today evening at 6 PM",
          confidence: 0.7,
        });
      }

      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      nextWeek.setHours(9, 0, 0, 0);

      suggestedTimes.push({
        time: nextWeek.toISOString(),
        reason: "Next week at 9 AM",
        confidence: 0.6,
      });

      // TODO: Implement smart scheduling based on userSchedule
      if (
        validatedParams.userSchedule &&
        validatedParams.userSchedule.length > 0
      ) {
        logWarn(
          "User schedule provided but smart scheduling not yet implemented",
        );
      }

      logPerformance("suggestReminderTime", Date.now() - startTime, {
        count: suggestedTimes.length,
      });

      return { suggestedTimes };
    } catch (error) {
      logError("Failed to suggest reminder time", error, {
        taskDescription: params.taskDescription,
      });
      throw handleServiceError(error, "suggestReminderTime");
    }
  }

  getCurrentTime(params: { timezone: string }): {
    currentTime: string;
    formattedTime: string;
    timezone: string;
  } {
    try {
      const now = new Date();
      const utcISO = now.toISOString();

      // Format the current time in the user's timezone
      const formattedTime = formatInZone(
        utcISO,
        params.timezone,
        "DATETIME_MED_WITH_SECONDS",
      );

      return {
        currentTime: utcISO,
        formattedTime,
        timezone: params.timezone,
      };
    } catch (error) {
      logError("Failed to get current time", error, {
        timezone: params.timezone,
      });
      throw handleServiceError(error, "getCurrentTime");
    }
  }

  /**
   * Pick the best date from multiple extracted dates
   * Prioritizes: highest confidence, soonest future date
   */
  pickBestDate(
    extractedDates: Array<{
      originalText: string;
      parsedDate: string;
      confidence: number;
      type: "absolute" | "relative";
    }>,
  ): string | null {
    if (!extractedDates || extractedDates.length === 0) {
      return null;
    }

    const now = Date.now();
    // Filter to future dates only
    const futureDates = extractedDates.filter(
      (d) => new Date(d.parsedDate).getTime() > now,
    );

    if (futureDates.length === 0) {
      return null;
    }

    // Sort by confidence (desc), then by time (asc - soonest first)
    futureDates.sort((a, b) => {
      const confDiff = b.confidence - a.confidence;
      if (Math.abs(confDiff) > 0.1) return confDiff;
      return (
        new Date(a.parsedDate).getTime() - new Date(b.parsedDate).getTime()
      );
    });

    return futureDates[0].parsedDate;
  }

  /**
   * Ensure a date is in the future; if not, roll forward intelligently
   */
  ensureFuture(dateISO: string): string {
    const parsed = new Date(dateISO);
    const now = new Date();

    if (parsed.getTime() > now.getTime()) {
      return dateISO; // Already future
    }

    // If the time has passed today, assume user meant tomorrow
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(
      parsed.getHours(),
      parsed.getMinutes(),
      parsed.getSeconds(),
      0,
    );

    return tomorrow.toISOString();
  }
}
