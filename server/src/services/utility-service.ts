import * as chrono from "chrono-node";
import { DateTime } from "luxon";
import {
  wallClockToUTCFromZone,
  formatInZone,
  createFutureDateInZone,
  ensureFutureInZone,
} from "../utils/time-utils";
import {
  validate,
  parseNaturalLanguageDateSchema,
  detectIntentSchema,
  suggestReminderTimeSchema,
} from "../utils/validators";
import { handleServiceError, ValidationError } from "../utils/errors";
import { logError, logPerformance, logWarn } from "../utils/logger";
export class UtilityService {
  private normalizeTimeText(text: string): string {
    try {
      let t = text || "";
      t = t.replace(/(\d)([a-zA-Z])/g, "$1 $2");
      t = t
        .replace(/\bhrs?\b/gi, "hours")
        .replace(/\bmins?\b/gi, "minutes")
        .replace(/\bsecs?\b/gi, "seconds")
        .replace(/\bwks?\b/gi, "weeks")
        .replace(/\bdays?\b/gi, "days")
        .replace(/\byrs?\b/gi, "years");
      t = t.replace(/(\d+\s*\w+)\s+(\d+\s*\w+)/g, "$1 and $2");
      t = t.replace(/\s+/g, " ").trim();
      return t;
    } catch {
      return text;
    }
  }
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
      const validatedParams = validate(parseNaturalLanguageDateSchema, params);
      if (!validatedParams.text || validatedParams.text.trim().length === 0) {
        throw new ValidationError("Text cannot be empty");
      }
      const referenceDate = validatedParams.referenceDate
        ? new Date(validatedParams.referenceDate)
        : new Date();
      if (isNaN(referenceDate.getTime())) {
        throw new ValidationError("Invalid reference date");
      }
      const normalizedText = this.normalizeTimeText(validatedParams.text);
      logWarn("Attempting to parse date", {
        originalText: validatedParams.text,
        normalizedText,
        timezone: validatedParams.timezone,
      });
      const results = chrono.parse(normalizedText, referenceDate);
      logWarn("Chrono parse results", {
        resultsCount: results.length,
        results: results.map((r) => ({
          text: r.text,
          start: r.start.date(),
          isCertainDay: r.start.isCertain("day"),
          isCertainHour: r.start.isCertain("hour"),
        })),
      });
      let extractedDates = results
        .map((result) => {
          try {
            const date = result.start.date();
            const isAbsolute = result.start.isCertain("day");
            const utcISO = isAbsolute
              ? wallClockToUTCFromZone(date, validatedParams.timezone)
              : date.toISOString();
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
      if (extractedDates.length === 0) {
        const text = normalizedText.toLowerCase();
        const hasRelativeCue =
          /(in|from now|after|within|later|following|timer|alarm)\b/.test(text);
        const hasMultipleUnits = /\d+\s*\w+\s*and\s*\d+\s*\w+/.test(text);
        const hasAbsoluteIndicators =
          /\b(at|on|january|february|march|april|may|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|tonight|yesterday)\b/.test(
            text,
          );
        logWarn("Chrono parsing failed, trying fallback regex", {
          originalText: validatedParams.text,
          normalizedText,
          hasRelativeCue,
          hasMultipleUnits,
          hasAbsoluteIndicators,
        });
        const durRegex =
          /(\d+(?:\.\d+)?)\s*(years?|yrs?|y|months?|mos?|mo|mths?|mth|weeks?|wks?|wk|w|days?|d|hours?|hrs?|hr|h|minutes?|mins?|min|m)\b/gi;
        let match: RegExpExecArray | null;
        let years = 0,
          months = 0,
          weeks = 0,
          days = 0,
          hours = 0,
          minutes = 0;
        while ((match = durRegex.exec(text)) !== null) {
          const val = parseFloat(match[1]);
          const unit = match[2];
          const unitLower = unit.toLowerCase();
          logWarn("Regex match found", {
            val,
            unit,
            unitLower,
            fullMatch: match[0],
          });
          if (/^y(ears?)?$|yrs?$/.test(unitLower)) years += val;
          else if (/^mo(nths?)?$|mos?$|mths?$|mth$/.test(unitLower))
            months += val;
          else if (/^w(eeks?)?$|wks?$|wk$/.test(unitLower)) weeks += val;
          else if (/^d(ays?)?$/.test(unitLower)) days += val;
          else if (/^h(ours?)?$|hrs?$|hr$/.test(unitLower)) hours += val;
          else if (/^m(in(utes?)?)?$|mins?$/.test(unitLower)) minutes += val;
        }
        const totalDuration = years + months + weeks + days + hours + minutes;
        logWarn("Fallback regex parsing results", {
          hasRelativeCue,
          hasMultipleUnits,
          hasAbsoluteIndicators,
          years,
          months,
          weeks,
          days,
          hours,
          minutes,
          totalDuration,
        });
        if (
          totalDuration > 0 &&
          (hasRelativeCue || hasMultipleUnits || !hasAbsoluteIndicators)
        ) {
          const futureDate = DateTime.fromJSDate(referenceDate, {
            zone: validatedParams.timezone,
          })
            .plus({ years, months, weeks, days, hours, minutes })
            .toUTC()
            .toISO();
          logWarn("Generated future date from fallback", { futureDate });
          if (futureDate) {
            extractedDates.push({
              originalText: validatedParams.text,
              parsedDate: futureDate,
              confidence: 0.8,
              type: "relative",
            });
          }
        }
        if (extractedDates.length === 0) {
          const commonPatterns = [
            { pattern: /(\d+)\s*hours?\s*from\s*now/i, unit: "hours" },
            { pattern: /(\d+)\s*minutes?\s*from\s*now/i, unit: "minutes" },
            { pattern: /(\d+)\s*days?\s*from\s*now/i, unit: "days" },
            { pattern: /in\s*(\d+)\s*hours?/i, unit: "hours" },
            { pattern: /in\s*(\d+)\s*minutes?/i, unit: "minutes" },
            { pattern: /in\s*(\d+)\s*days?/i, unit: "days" },
            {
              pattern:
                /(\d+)\s*(hrs?|hours?)\s*(?:and\s*)?(\d+)\s*(mins?|minutes?)\s*from\s*now/i,
              unit: "complex_hours_minutes",
            },
            {
              pattern:
                /(\d+)\s*(hrs?|hours?)\s*(?:and\s*)?(\d+)\s*(mins?|minutes?)/i,
              unit: "complex_hours_minutes",
            },
          ];
          for (const { pattern, unit } of commonPatterns) {
            const match = normalizedText.match(pattern);
            if (match) {
              logWarn("Common pattern matched", {
                pattern: pattern.source,
                match: match,
                unit,
              });
              let duration = {};
              if (unit === "complex_hours_minutes") {
                const hours = parseFloat(match[1]);
                const minutes = parseFloat(match[3]);
                duration = { hours, minutes };
              } else {
                const val = parseFloat(match[1]);
                duration =
                  unit === "hours"
                    ? { hours: val }
                    : unit === "minutes"
                      ? { minutes: val }
                      : unit === "days"
                        ? { days: val }
                        : {};
              }
              const futureDate = DateTime.fromJSDate(referenceDate, {
                zone: validatedParams.timezone,
              })
                .plus(duration)
                .toUTC()
                .toISO();
              if (futureDate) {
                extractedDates.push({
                  originalText: validatedParams.text,
                  parsedDate: futureDate,
                  confidence: 0.9,
                  type: "relative",
                });
                logWarn("Generated date from common pattern", {
                  futureDate,
                  duration,
                });
                break;
              }
            }
          }
        }
      }
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
      if (
        message.includes("remind me") ||
        message.includes("reminder") ||
        message.includes("set a reminder") ||
        message.includes("schedule")
      ) {
        intent = "createReminder";
        confidence = 0.9;
        isActionIntent = true;
      } else if (
        message.includes("update") ||
        message.includes("change") ||
        message.includes("modify") ||
        message.includes("reschedule")
      ) {
        intent = "updateReminder";
        confidence = 0.85;
        isActionIntent = true;
      } else if (
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
      } else if (
        message.includes("snooze") ||
        message.includes("postpone") ||
        message.includes("delay")
      ) {
        intent = "snoozeReminder";
        confidence = 0.9;
        isActionIntent = true;
      } else if (
        message.includes("add to list") ||
        message.includes("add to my list") ||
        message.includes("shopping list") ||
        message.includes("todo list")
      ) {
        intent = "addItemToList";
        confidence = 0.85;
        isActionIntent = true;
      } else if (
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
        isActionIntent = false;
      } else if (
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
        isActionIntent = false;
      } else if (
        message.includes("done") ||
        message.includes("complete") ||
        message.includes("finished")
      ) {
        intent = "completeReminder";
        confidence = 0.75;
        isActionIntent = true;
      }
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
    timezone: string;
    userSchedule?: Array<{
      startTime: string;
      endTime: string;
    }>;
  }): {
    suggestedTimes: Array<{
      time: string;
      reason: string;
      confidence: number;
    }>;
  } {
    const startTime = Date.now();
    try {
      const validatedParams = validate(suggestReminderTimeSchema, params);
      if (
        !validatedParams.taskDescription ||
        validatedParams.taskDescription.trim().length === 0
      ) {
        throw new ValidationError("Task description cannot be empty");
      }
      if (!validatedParams.timezone) {
        throw new ValidationError("Timezone is required");
      }
      const suggestedTimes: Array<{
        time: string;
        reason: string;
        confidence: number;
      }> = [];
      const tomorrow9am = createFutureDateInZone(
        validatedParams.timezone,
        1,
        9,
        0,
      );
      suggestedTimes.push({
        time: tomorrow9am,
        reason: "Tomorrow morning at 9 AM",
        confidence: 0.8,
      });
      const todayEvening = createFutureDateInZone(
        validatedParams.timezone,
        0,
        18,
        0,
      );
      try {
        const eveningDate = new Date(todayEvening);
        if (eveningDate > new Date()) {
          suggestedTimes.push({
            time: todayEvening,
            reason: "Today evening at 6 PM",
            confidence: 0.7,
          });
        }
      } catch {}
      const nextWeek = createFutureDateInZone(
        validatedParams.timezone,
        7,
        9,
        0,
      );
      suggestedTimes.push({
        time: nextWeek,
        reason: "Next week at 9 AM",
        confidence: 0.6,
      });
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
      const formattedTime = formatInZone(
        utcISO,
        params.timezone,
        DateTime.DATETIME_MED_WITH_SECONDS,
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
  calculateTimeDifference(params: {
    toTime: string;
    fromTime?: string;
    includeSeconds?: boolean;
  }): {
    diffMs: number;
    isFuture: boolean;
    parts: { days: number; hours: number; minutes: number; seconds: number };
    formatted: string;
  } {
    try {
      const to = new Date(params.toTime);
      const from = params.fromTime ? new Date(params.fromTime) : new Date();
      if (isNaN(to.getTime())) {
        throw new ValidationError("Invalid toTime ISO datetime");
      }
      if (isNaN(from.getTime())) {
        throw new ValidationError("Invalid fromTime ISO datetime");
      }
      const diffMs = to.getTime() - from.getTime();
      const absMs = Math.abs(diffMs);
      let remaining = Math.floor(absMs / 1000);
      const days = Math.floor(remaining / (24 * 60 * 60));
      remaining -= days * 24 * 60 * 60;
      const hours = Math.floor(remaining / (60 * 60));
      remaining -= hours * 60 * 60;
      const minutes = Math.floor(remaining / 60);
      remaining -= minutes * 60;
      const seconds = Math.max(0, remaining);
      const parts: string[] = [];
      if (days > 0) parts.push(`${days} day${days !== 1 ? "s" : ""}`);
      if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
      if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? "s" : ""}`);
      const includeSeconds =
        params.includeSeconds ?? (days === 0 && hours === 0);
      if (includeSeconds || parts.length === 0) {
        parts.push(`${seconds} second${seconds !== 1 ? "s" : ""}`);
      }
      const formatted = parts.join(", ").replace(/, (?=[^,]*$)/, ", and ");
      return {
        diffMs,
        isFuture: diffMs >= 0,
        parts: { days, hours, minutes, seconds },
        formatted,
      };
    } catch (error) {
      logError("Failed to calculate time difference", error, params);
      throw handleServiceError(error, "calculateTimeDifference");
    }
  }
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
    const futureDates = extractedDates.filter(
      (d) => new Date(d.parsedDate).getTime() > now,
    );
    if (futureDates.length === 0) {
      return null;
    }
    futureDates.sort((a, b) => {
      const confDiff = b.confidence - a.confidence;
      if (Math.abs(confDiff) > 0.1) return confDiff;
      return (
        new Date(a.parsedDate).getTime() - new Date(b.parsedDate).getTime()
      );
    });
    return futureDates[0].parsedDate;
  }
  ensureFuture(dateISO: string, timezone: string): string {
    return ensureFutureInZone(dateISO, timezone);
  }
  validateRecurrenceRule(recurrenceRule: string): {
    valid: boolean;
    message?: string;
  } {
    try {
      if (!recurrenceRule || recurrenceRule.trim().length === 0) {
        return { valid: false, message: "Recurrence rule cannot be empty" };
      }
      const rule = recurrenceRule.trim().toUpperCase();
      if (rule.startsWith("FREQ=")) {
        const validFreqs = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];
        const hasValidFreq = validFreqs.some((f) => rule.includes(`FREQ=${f}`));
        if (!hasValidFreq) {
          return { valid: false, message: "Invalid FREQ value in RRULE" };
        }
        return { valid: true };
      }
      return { valid: true };
    } catch (error) {
      logError("Failed to validate recurrence rule", error, { recurrenceRule });
      return { valid: false, message: "Invalid recurrence rule format" };
    }
  }
  async globalSearch(params: {
    userId: string;
    query: string;
    limit?: number;
  }): Promise<{
    reminders: any[];
    notes: any[];
    lists: any[];
    listItems: any[];
    media: any[];
    total: number;
  }> {
    try {
      const { getSupabaseClient } = await import("../lib/supabase");
      const supabase = getSupabaseClient();
      const q = `%${params.query}%`;
      const limit = params.limit || 10;
      const [reminders, notes, lists, listItems, media] = await Promise.all([
        supabase
          .from("reminders")
          .select("id, title, notes, reminder_time, status")
          .eq("user_id", params.userId)
          .or(`title.ilike.${q},notes.ilike.${q}`)
          .limit(limit),
        supabase
          .from("user_notes")
          .select("id, title, content, category, tags")
          .eq("user_id", params.userId)
          .or(`title.ilike.${q},content.ilike.${q}`)
          .limit(limit),
        supabase
          .from("lists")
          .select("id, name, description")
          .eq("user_id", params.userId)
          .or(`name.ilike.${q},description.ilike.${q}`)
          .limit(limit),
        supabase
          .from("list_items")
          .select("id, list_id, content, notes")
          .or(`content.ilike.${q},notes.ilike.${q}`)
          .limit(limit),
        supabase
          .from("media_attachments")
          .select("id, media_type, file_url, extracted_text, transcription")
          .eq("user_id", params.userId)
          .or(
            `extracted_text.ilike.${q},transcription.ilike.${q},file_url.ilike.${q}`,
          )
          .limit(limit),
      ]);
      const results = {
        reminders: reminders.data || [],
        notes: notes.data || [],
        lists: lists.data || [],
        listItems: listItems.data || [],
        media: media.data || [],
        total:
          (reminders.data?.length || 0) +
          (notes.data?.length || 0) +
          (lists.data?.length || 0) +
          (listItems.data?.length || 0) +
          (media.data?.length || 0),
      };
      return results;
    } catch (error) {
      logError("Failed to perform global search", error, {
        userId: params.userId,
        query: params.query,
      });
      throw handleServiceError(error, "globalSearch");
    }
  }
}
