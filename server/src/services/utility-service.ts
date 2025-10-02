import * as chrono from "chrono-node";
import { wallClockToUTCFromZone } from "../utils/time-utils";
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

      // Reminder creation patterns
      if (
        message.includes("remind me") ||
        message.includes("reminder") ||
        message.includes("set a reminder") ||
        message.includes("schedule")
      ) {
        intent = "createReminder";
        confidence = 0.9;
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
      }
      // Completion patterns
      else if (
        message.includes("done") ||
        message.includes("complete") ||
        message.includes("finished")
      ) {
        intent = "completeReminder";
        confidence = 0.75;
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
      });

      return {
        intent,
        confidence,
        entities,
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
}
