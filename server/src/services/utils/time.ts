import * as chrono from "chrono-node";
import { DateTime } from "luxon";
import {
  wallClockToUTCFromZone,
  formatInZone,
  createFutureDateInZone,
  ensureFutureInZone,
} from "../../utils/time-utils";
import {
  validate,
  parseNaturalLanguageDateSchema,
  suggestReminderTimeSchema,
} from "../../utils/validators";
import { handleServiceError, ValidationError } from "../../utils/errors";
import { logError, logPerformance, logWarn } from "../../utils/logger";
function normalizeTimeText(text: string): string {
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
export function buildRecurrenceRule(params: {
  natural: string;
  timezone: string;
  startTime?: string;
}): {
  rrule: string;
  message?: string;
} {
  try {
    if (
      !params.natural ||
      typeof params.natural !== "string" ||
      params.natural.trim().length === 0
    ) {
      throw new ValidationError("Recurrence rule text cannot be empty.");
    }
    if (!params.timezone || typeof params.timezone !== "string") {
      throw new ValidationError("Timezone is required for recurrence rules.");
    }
    const text = params.natural.toLowerCase().trim();
    const byTime = (() => {
      try {
        const base = params.startTime
          ? DateTime.fromISO(params.startTime, { setZone: true }).setZone(
              params.timezone,
            )
          : DateTime.now().setZone(params.timezone);
        return `;BYHOUR=${base.hour};BYMINUTE=${base.minute}`;
      } catch {
        return "";
      }
    })();
    const dayMap: Record<string, string> = {
      sunday: "SU",
      monday: "MO",
      tuesday: "TU",
      wednesday: "WE",
      thursday: "TH",
      friday: "FR",
      saturday: "SA",
      sun: "SU",
      mon: "MO",
      tue: "TU",
      wed: "WE",
      thu: "TH",
      fri: "FR",
      sat: "SA",
    };
    const weekdays = ["MO", "TU", "WE", "TH", "FR"];
    const everyXDays = text.match(/every\s+(\d+)\s+days?/i);
    if (/\b(daily|every day)\b/.test(text)) {
      return { rrule: `FREQ=DAILY${byTime}` };
    }
    if (everyXDays) {
      const interval = Math.max(1, parseInt(everyXDays[1], 10));
      return { rrule: `FREQ=DAILY;INTERVAL=${interval}${byTime}` };
    }
    if (/\b(weekdays|every weekday)\b/.test(text)) {
      return { rrule: `FREQ=WEEKLY;BYDAY=${weekdays.join(",")}${byTime}` };
    }
    if (
      /\bevery\b.*\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)(?:\s*(,|and)\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun))*\b/.test(
        text,
      )
    ) {
      const found = Array.from(
        text.matchAll(
          /(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)/g,
        ),
      ).map((m) => dayMap[m[1]]);
      const unique = Array.from(new Set(found)).filter(Boolean);
      if (unique.length > 0)
        return { rrule: `FREQ=WEEKLY;BYDAY=${unique.join(",")}${byTime}` };
    }
    const everyXWeeks = text.match(/every\s+(\d+)\s+weeks?/i);
    if (everyXWeeks) {
      const interval = Math.max(1, parseInt(everyXWeeks[1], 10));
      const days = Array.from(
        text.matchAll(/(mon|tue|wed|thu|fri|sat|sun)/g),
      ).map((m) => dayMap[m[1]]);
      const byday =
        days.length > 0 ? `;BYDAY=${Array.from(new Set(days)).join(",")}` : "";
      return { rrule: `FREQ=WEEKLY;INTERVAL=${interval}${byday}${byTime}` };
    }
    const dom = text.match(/on the (\d{1,2})(st|nd|rd|th)/i);
    if (/\bmonthly\b/.test(text) && dom) {
      const day = Math.min(31, Math.max(1, parseInt(dom[1], 10)));
      return { rrule: `FREQ=MONTHLY;BYMONTHDAY=${day}${byTime}` };
    }
    if (/\bevery month\b/.test(text) && dom) {
      const day = Math.min(31, Math.max(1, parseInt(dom[1], 10)));
      return { rrule: `FREQ=MONTHLY;BYMONTHDAY=${day}${byTime}` };
    }
    const posMatch = text.match(
      /(1st|first|2nd|second|3rd|third|4th|fourth)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)/i,
    );
    if (/\bmonthly\b/.test(text) && posMatch) {
      const posMap: Record<string, number> = {
        "1st": 1,
        first: 1,
        "2nd": 2,
        second: 2,
        "3rd": 3,
        third: 3,
        "4th": 4,
        fourth: 4,
      };
      const pos = posMap[posMatch[1].toLowerCase()];
      const byday = dayMap[posMatch[2].toLowerCase()];
      if (pos && byday)
        return {
          rrule: `FREQ=MONTHLY;BYDAY=${byday};BYSETPOS=${pos}${byTime}`,
        };
    }
    return {
      rrule: `FREQ=WEEKLY${byTime}`,
      message: "Defaulted to weekly recurrence",
    };
  } catch (error) {
    logError("Failed to build RRULE", error, params);
    return {
      rrule: "FREQ=WEEKLY",
      message: "Failed to parse natural recurrence; defaulted to weekly",
    };
  }
}
export function explainRecurrenceRule(rrule: string): {
  natural: string;
} {
  try {
    const rule = (rrule || "").toUpperCase();
    const parts = Object.fromEntries(
      rule
        .split(";")
        .map((kv) => kv.split("=") as [string, string])
        .filter((kv) => kv.length === 2),
    ) as Record<string, string>;
    const freq = parts["FREQ"] || "WEEKLY";
    const interval = parts["INTERVAL"] ? parseInt(parts["INTERVAL"], 10) : 1;
    const byday = parts["BYDAY"];
    const bymonthday = parts["BYMONTHDAY"];
    const bysetpos = parts["BYSETPOS"];
    const dayName: Record<string, string> = {
      SU: "Sunday",
      MO: "Monday",
      TU: "Tuesday",
      WE: "Wednesday",
      TH: "Thursday",
      FR: "Friday",
      SA: "Saturday",
    };
    let natural = "";
    if (freq === "DAILY") {
      natural = interval > 1 ? `Every ${interval} days` : "Daily";
    } else if (freq === "WEEKLY") {
      if (byday) {
        const days = byday.split(",").map((d) => dayName[d] || d);
        natural =
          interval > 1
            ? `Every ${interval} weeks on ${days.join(", ")}`
            : `Every week on ${days.join(", ")}`;
      } else {
        natural = interval > 1 ? `Every ${interval} weeks` : "Weekly";
      }
    } else if (freq === "MONTHLY") {
      if (bymonthday) {
        natural =
          interval > 1
            ? `Every ${interval} months on day ${bymonthday}`
            : `Every month on day ${bymonthday}`;
      } else if (byday && bysetpos) {
        const days = byday.split(",").map((d) => dayName[d] || d);
        const posMap: Record<string, string> = {
          "1": "1st",
          "2": "2nd",
          "3": "3rd",
          "4": "4th",
        };
        natural =
          interval > 1
            ? `Every ${interval} months on the ${posMap[bysetpos] || bysetpos} ${days.join(", ")}`
            : `Every month on the ${posMap[bysetpos] || bysetpos} ${days.join(", ")}`;
      } else {
        natural = interval > 1 ? `Every ${interval} months` : "Monthly";
      }
    } else {
      natural = `Repeats (${freq.toLowerCase()})`;
    }
    return { natural };
  } catch (error) {
    logError("Failed to explain RRULE", error, { rrule });
    return { natural: "Repeats" };
  }
}
export async function getNextOccurrences(params: {
  rrule?: string;
  reminderId?: string;
  count?: number;
  timezone: string;
  startTime?: string;
}): Promise<{
  occurrences: string[];
}> {
  try {
    let rule = params.rrule?.toUpperCase();
    let startISO = params.startTime;
    if (!rule && params.reminderId) {
      const { getSupabaseClient } = await import("../../lib/supabase");
      const supabase = getSupabaseClient();
      const { data: r, error } = await supabase
        .from("reminders")
        .select("reminder_time, recurrence_rule")
        .eq("id", params.reminderId)
        .single();
      if (error || !r) throw error || new Error("Reminder not found");
      rule = (r.recurrence_rule || "").toUpperCase();
      startISO = r.reminder_time;
    }
    if (!rule) return { occurrences: [] };
    const parts = Object.fromEntries(
      rule
        .split(";")
        .map((kv) => kv.split("=") as [string, string])
        .filter((kv) => kv.length === 2),
    ) as Record<string, string>;
    const freq = parts["FREQ"] || "WEEKLY";
    const interval = parts["INTERVAL"]
      ? Math.max(1, parseInt(parts["INTERVAL"], 10))
      : 1;
    const byday = parts["BYDAY"];
    const bymonthday = parts["BYMONTHDAY"]
      ? parseInt(parts["BYMONTHDAY"], 10)
      : undefined;
    const bysetpos = parts["BYSETPOS"]
      ? parseInt(parts["BYSETPOS"], 10)
      : undefined;
    const max = Math.min(Math.max(params.count ?? 5, 1), 50);
    const start = startISO
      ? DateTime.fromISO(startISO, { setZone: true }).setZone(params.timezone)
      : DateTime.now().setZone(params.timezone);
    const results: string[] = [];
    let cursor = start;
    const byhour = parts["BYHOUR"]
      ? Math.min(23, Math.max(0, parseInt(parts["BYHOUR"], 10)))
      : undefined;
    const byminute = parts["BYMINUTE"]
      ? Math.min(59, Math.max(0, parseInt(parts["BYMINUTE"], 10)))
      : undefined;
    const bysecondRule = parts["BYSECOND"]
      ? Math.min(59, Math.max(0, parseInt(parts["BYSECOND"], 10)))
      : undefined;
    const dowIndex: Record<string, number> = {
      SU: 7,
      MO: 1,
      TU: 2,
      WE: 3,
      TH: 4,
      FR: 5,
      SA: 6,
    };
    const safeSecond: number =
      typeof start.second === "number" ? start.second : 0;
    const baseHour = start.hour;
    const baseMinute = start.minute;
    const normalizeToTime = (dt: DateTime) =>
      dt.set({
        hour: byhour ?? baseHour,
        minute: byminute ?? baseMinute,
        second: bysecondRule ?? safeSecond,
        millisecond: 0,
      });
    const pushIfFuture = (dt: DateTime) => {
      if (dt.toMillis() >= DateTime.now().toMillis()) {
        const iso =
          dt.toUTC().toISO() || new Date(dt.toUTC().toMillis()).toISOString();
        results.push(iso);
      }
    };
    while (results.length < max) {
      if (freq === "DAILY") {
        if (results.length === 0) pushIfFuture(normalizeToTime(cursor));
        cursor = cursor.plus({ days: interval });
        pushIfFuture(normalizeToTime(cursor));
      } else if (freq === "WEEKLY") {
        const days = byday
          ? byday.split(",")
          : [cursor.toFormat("ccc").slice(0, 2).toUpperCase()];
        for (const d of days) {
          const targetDow = dowIndex[d] || 1;
          const currentDow = cursor.weekday;
          let delta = targetDow - currentDow;
          if (delta < 0) delta += 7;
          const occ = normalizeToTime(cursor.plus({ days: delta }));
          pushIfFuture(occ);
          if (results.length >= max) break;
        }
        cursor = cursor.plus({ weeks: interval });
      } else if (freq === "MONTHLY") {
        if (bymonthday !== undefined) {
          const bm: number = bymonthday as number;
          const maxDaysInMonth: number = cursor.daysInMonth || 31;
          const targetDay = Math.min(bm, maxDaysInMonth);
          const occ = normalizeToTime(cursor.set({ day: targetDay }));
          pushIfFuture(occ);
          cursor = cursor.plus({ months: interval });
        } else if (byday && bysetpos) {
          const dayCodes = byday.split(",");
          const targetCode = dayCodes[0];
          const targetDow = dowIndex[targetCode] || 1;
          const monthStart = cursor.startOf("month");
          const firstDow = monthStart.weekday;
          const add = (targetDow - firstDow + 7) % 7;
          const pos: number = bysetpos as number;
          const candidate = monthStart.plus({ days: add + (pos - 1) * 7 });
          if (candidate.month === monthStart.month) {
            const occ = normalizeToTime(candidate);
            pushIfFuture(occ);
          }
          cursor = cursor.plus({ months: interval });
        } else {
          const occ = normalizeToTime(cursor);
          pushIfFuture(occ);
          cursor = cursor.plus({ months: interval });
        }
      } else {
        const occ = normalizeToTime(cursor);
        pushIfFuture(occ);
        cursor = cursor.plus({ weeks: interval });
      }
      if (results.length >= max) break;
      if (
        results.length === 0 &&
        results.length < max &&
        cursor.diff(start, "years").years > 10
      )
        break;
    }
    const uniqueSorted = Array.from(new Set(results)).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime(),
    );
    return { occurrences: uniqueSorted.slice(0, max) };
  } catch (error) {
    logError("Failed to compute next occurrences", error, params);
    return { occurrences: [] };
  }
}
export function parseNaturalLanguageDate(params: {
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
    const normalizedText = normalizeTimeText(validatedParams.text);
    logWarn("Attempting to parse date", {
      originalText: validatedParams.text,
      normalizedText,
      timezone: validatedParams.timezone,
    });
    if (normalizedText.length < 2) {
      throw new ValidationError(
        "Time expression is too short to parse meaningfully.",
      );
    }
    const lc = normalizedText.toLowerCase();
    const looksRelative =
      /(in|from now|after|within|later|following|timer|alarm)\b/.test(lc) ||
      /^\s*\d+\s*(years?|yrs?|y|months?|mos?|mo|mths?|mth|weeks?|wks?|wk|w|days?|d|hours?|hrs?|hr|h|minutes?|mins?|min|m)\b/.test(
        lc,
      );
    const hasExplicitClock =
      /\b(\d{1,2}[:.]\d{2}\s*(am|pm)?)\b/i.test(lc) ||
      /\b(\d{1,2}\s*(am|pm))\b/i.test(lc);
    if (looksRelative && !hasExplicitClock) {
      const durRegex =
        /(\d+(?:\.\d+)?)\s*(years?|yrs?|y|months?|mos?|mo|mths?|mth|weeks?|wks?|wk|w|days?|d|hours?|hrs?|hr|h|minutes?|mins?|min|m)\b/gi;
      let match: RegExpExecArray | null;
      let years = 0,
        months = 0,
        weeks = 0,
        days = 0,
        hours = 0,
        minutes = 0;
      while ((match = durRegex.exec(lc)) !== null) {
        const val = parseFloat(match[1]);
        const unitLower = match[2].toLowerCase();
        if (/^y(ears?)?$|yrs?$/.test(unitLower)) years += val;
        else if (/^mo(nths?)?$|mos?$|mths?$|mth$/.test(unitLower))
          months += val;
        else if (/^w(eeks?)?$|wks?$|wk$/.test(unitLower)) weeks += val;
        else if (/^d(ays?)?$/.test(unitLower)) days += val;
        else if (/^h(ours?)?$|hrs?$|hr$/.test(unitLower)) hours += val;
        else if (/^m(in(utes?)?)?$|mins?$/.test(unitLower)) minutes += val;
      }
      if (years + months + weeks + days + hours + minutes === 0) {
        const combo =
          lc.match(
            /(\d+)\s*(hrs?|hours?)\s*(?:and\s*)?(\d+)\s*(mins?|minutes?)/i,
          ) || lc.match(/(\d+)\s*hour\s*(\d+)\s*minutes?/i);
        if (combo) {
          hours = parseFloat(combo[1]);
          minutes = parseFloat(combo[3] || combo[2]);
        }
      }
      const extractedDatesRel: Array<{
        originalText: string;
        parsedDate: string;
        confidence: number;
        type: "absolute" | "relative";
      }> = [];
      if (years + months + weeks + days + hours + minutes > 0) {
        const futureDate = DateTime.fromJSDate(referenceDate, {
          zone: validatedParams.timezone,
        })
          .plus({ years, months, weeks, days, hours, minutes })
          .toUTC()
          .toISO();
        if (futureDate) {
          extractedDatesRel.push({
            originalText: validatedParams.text,
            parsedDate: futureDate,
            confidence: 0.9,
            type: "relative",
          });
        }
      }
      if (extractedDatesRel.length > 0) {
        logPerformance("parseNaturalLanguageDate", Date.now() - startTime, {
          count: extractedDatesRel.length,
        });
        return { success: true, extractedDates: extractedDatesRel };
      }
    }
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
          const hasTimeOnly =
            result.start.isCertain("hour") && !result.start.isCertain("day");
          let finalDate = date;
          if (hasTimeOnly) {
            const today = DateTime.now().setZone(validatedParams.timezone);
            finalDate = today
              .set({
                hour: date.getHours(),
                minute: date.getMinutes(),
                second: 0,
                millisecond: 0,
              })
              .toJSDate();
          } else if (isAbsolute) {
            const raw = normalizedText.toLowerCase();
            if (/\b(today|tomorrow|yesterday|tonight)\b/.test(raw)) {
              const base = DateTime.fromJSDate(referenceDate, {
                zone: validatedParams.timezone,
              });
              let targetDay = base;
              if (/\btomorrow\b/.test(raw)) targetDay = base.plus({ days: 1 });
              else if (/\byesterday\b/.test(raw))
                targetDay = base.minus({ days: 1 });
              const hour = date.getHours();
              const minute = date.getMinutes();
              const second = date.getSeconds();
              finalDate = targetDay
                .set({
                  hour: isNaN(hour) ? 0 : hour,
                  minute: isNaN(minute) ? 0 : minute,
                  second: isNaN(second) ? 0 : second,
                  millisecond: 0,
                })
                .toJSDate();
            }
          }
          const utcISO =
            isAbsolute || hasTimeOnly
              ? wallClockToUTCFromZone(finalDate, validatedParams.timezone)
              : finalDate.toISOString();
          return {
            originalText: result.text,
            parsedDate: utcISO,
            confidence: result.start.isCertain("hour") ? 0.9 : 0.7,
            type: result.start.isCertain("day")
              ? ("absolute" as const)
              : ("relative" as const),
          };
        } catch (error) {
          logWarn("Failed to parse date result", { text: result.text, error });
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
              /in\s*(\d+)\s*(hrs?|hours?)\s*(?:and\s*)?(\d+)\s*(mins?|minutes?)/i,
            unit: "complex_hours_minutes_in",
          },
          {
            pattern: /(\d+)\s*hour\s*(\d+)\s*minutes?\s*from\s*now/i,
            unit: "hour_minutes_from_now",
          },
          {
            pattern:
              /(\d+)\s*(hrs?|hours?)\s*(?:and\s*)?(\d+)\s*(mins?|minutes?)/i,
            unit: "complex_hours_minutes",
          },
          {
            pattern: /^(\d{1,2}):(\d{2})\s*(am|pm)$/i,
            unit: "time_only_colon",
          },
          {
            pattern: /^(\d{1,2})\.(\d{2})\s*(am|pm)$/i,
            unit: "time_only_dot",
          },
          {
            pattern: /^(\d{1,2})\s*(am|pm)$/i,
            unit: "time_only_hour",
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
            if (
              unit === "complex_hours_minutes" ||
              unit === "complex_hours_minutes_in"
            ) {
              const hours = parseFloat(match[1]);
              const minutes = parseFloat(match[3]);
              duration = { hours, minutes };
            } else if (unit === "hour_minutes_from_now") {
              const hours = parseFloat(match[1]);
              const minutes = parseFloat(match[2]);
              duration = { hours, minutes };
            } else if (unit === "time_only_colon" || unit === "time_only_dot") {
              const hour = parseInt(match[1]);
              const minute = parseInt(match[2]);
              const isPM = match[3].toLowerCase() === "pm";
              const hour24 =
                isPM && hour !== 12
                  ? hour + 12
                  : !isPM && hour === 12
                    ? 0
                    : hour;
              const today = DateTime.fromJSDate(referenceDate, {
                zone: validatedParams.timezone,
              });
              let targetTime = today.set({
                hour: hour24,
                minute,
                second: 0,
                millisecond: 0,
              });
              if (targetTime.toJSDate().getTime() <= referenceDate.getTime()) {
                targetTime = targetTime.plus({ days: 1 });
              }
              const futureDate = targetTime.toUTC().toISO();
              if (futureDate) {
                extractedDates.push({
                  originalText: validatedParams.text,
                  parsedDate: futureDate,
                  confidence: 0.95,
                  type: "absolute",
                });
                logWarn("Generated time-only date", {
                  futureDate,
                  hour24,
                  minute,
                  isPM,
                });
                break;
              }
              continue;
            } else if (unit === "time_only_hour") {
              const hour = parseInt(match[1]);
              const isPM = match[2].toLowerCase() === "pm";
              const hour24 =
                isPM && hour !== 12
                  ? hour + 12
                  : !isPM && hour === 12
                    ? 0
                    : hour;
              const today = DateTime.fromJSDate(referenceDate, {
                zone: validatedParams.timezone,
              });
              let targetTime = today.set({
                hour: hour24,
                minute: 0,
                second: 0,
                millisecond: 0,
              });
              if (targetTime.toJSDate().getTime() <= referenceDate.getTime()) {
                targetTime = targetTime.plus({ days: 1 });
              }
              const futureDate = targetTime.toUTC().toISO();
              if (futureDate) {
                extractedDates.push({
                  originalText: validatedParams.text,
                  parsedDate: futureDate,
                  confidence: 0.95,
                  type: "absolute",
                });
                logWarn("Generated hour-only date", {
                  futureDate,
                  hour24,
                  isPM,
                });
                break;
              }
              continue;
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
export function suggestReminderTime(params: {
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
    const nextWeek = createFutureDateInZone(validatedParams.timezone, 7, 9, 0);
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
export function getCurrentTime(params: { timezone: string }): {
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
export function calculateTimeDifference(params: {
  toTime: string;
  fromTime?: string;
  includeSeconds?: boolean;
}): {
  diffMs: number;
  isFuture: boolean;
  parts: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  };
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
    const includeSeconds = params.includeSeconds ?? (days === 0 && hours === 0);
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
export function pickBestDate(
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
  const sorted = extractedDates
    .filter((date) => {
      try {
        const parsed = new Date(date.parsedDate);
        return !isNaN(parsed.getTime());
      } catch {
        return false;
      }
    })
    .sort((a, b) => b.confidence - a.confidence);
  return sorted[0]?.parsedDate || null;
}
export function ensureFuture(dateISO: string, timezone: string): string {
  return ensureFutureInZone(dateISO, timezone);
}
export function validateRecurrenceRule(recurrenceRule: string): {
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
