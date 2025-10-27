import {
  buildRecurrenceRule,
  calculateTimeDifference,
  ensureFuture,
  explainRecurrenceRule,
  getCurrentTime,
  getNextOccurrences,
  parseNaturalLanguageDate,
  pickBestDate,
  suggestReminderTime,
  validateRecurrenceRule,
} from "./utils/time";
import {
  detectIntent,
  extractTasksFromText,
  parseListItemsFromText,
} from "./utils/text";
import { globalSearch } from "./utils/search";
export class UtilityService {
  buildRecurrenceRule(params: {
    natural: string;
    timezone: string;
    startTime?: string;
  }) {
    return buildRecurrenceRule(params);
  }
  explainRecurrenceRule(rrule: string) {
    return explainRecurrenceRule(rrule);
  }
  async getNextOccurrences(params: {
    rrule?: string;
    reminderId?: string;
    count?: number;
    timezone: string;
    startTime?: string;
  }) {
    return await getNextOccurrences(params);
  }
  parseListItemsFromText(text: string) {
    return parseListItemsFromText(text);
  }
  extractTasksFromText(text: string) {
    return extractTasksFromText(text);
  }
  parseNaturalLanguageDate(params: {
    text: string;
    timezone: string;
    referenceDate?: string;
  }) {
    return parseNaturalLanguageDate(params);
  }
  detectIntent(params: { message: string; conversationContext?: string[] }) {
    return detectIntent(params);
  }
  suggestReminderTime(params: {
    taskDescription: string;
    timezone: string;
    userSchedule?: Array<{
      startTime: string;
      endTime: string;
    }>;
  }) {
    return suggestReminderTime(params);
  }
  getCurrentTime(params: { timezone: string }) {
    return getCurrentTime(params);
  }
  calculateTimeDifference(params: {
    toTime: string;
    fromTime?: string;
    includeSeconds?: boolean;
  }) {
    return calculateTimeDifference(params);
  }
  pickBestDate(
    extractedDates: Array<{
      originalText: string;
      parsedDate: string;
      confidence: number;
      type: "absolute" | "relative";
    }>,
  ) {
    return pickBestDate(extractedDates);
  }
  ensureFuture(dateISO: string, timezone: string) {
    return ensureFuture(dateISO, timezone);
  }
  validateRecurrenceRule(recurrenceRule: string) {
    return validateRecurrenceRule(recurrenceRule);
  }
  async globalSearch(params: {
    userId: string;
    query: string;
    limit?: number;
  }) {
    return await globalSearch(params);
  }
}
