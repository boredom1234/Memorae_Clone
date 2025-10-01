import * as chrono from 'chrono-node';

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
      type: 'absolute' | 'relative';
    }>;
  } {
    const referenceDate = params.referenceDate ? new Date(params.referenceDate) : new Date();
    const results = chrono.parse(params.text, referenceDate);

    const extractedDates = results.map((result) => ({
      originalText: result.text,
      parsedDate: result.start.date().toISOString(),
      confidence: result.start.isCertain('hour') ? 0.9 : 0.7,
      type: result.start.isCertain('day') ? ('absolute' as const) : ('relative' as const),
    }));

    return {
      success: extractedDates.length > 0,
      extractedDates,
    };
  }

  detectIntent(params: {
    message: string;
    conversationContext?: string[];
  }): {
    intent: string;
    confidence: number;
    entities: {
      dates?: string[];
      times?: string[];
      priorities?: string[];
      names?: string[];
    };
  } {
    const message = params.message.toLowerCase();
    let intent = 'unknown';
    let confidence = 0.5;
    const entities: any = {};

    // Reminder creation patterns
    if (
      message.includes('remind me') ||
      message.includes('reminder') ||
      message.includes('set a reminder') ||
      message.includes('schedule')
    ) {
      intent = 'createReminder';
      confidence = 0.9;
    }
    // List management patterns
    else if (
      message.includes('add to list') ||
      message.includes('add to my list') ||
      message.includes('shopping list') ||
      message.includes('todo list')
    ) {
      intent = 'addItemToList';
      confidence = 0.85;
    }
    // Query patterns
    else if (
      message.includes('show me') ||
      message.includes('what') ||
      message.includes('list my') ||
      message.includes('upcoming')
    ) {
      if (message.includes('reminder')) {
        intent = 'listReminders';
        confidence = 0.8;
      } else if (message.includes('list')) {
        intent = 'getLists';
        confidence = 0.8;
      }
    }
    // Completion patterns
    else if (message.includes('done') || message.includes('complete') || message.includes('finished')) {
      intent = 'completeReminder';
      confidence = 0.75;
    }

    // Extract dates
    const dateResults = chrono.parse(message);
    if (dateResults.length > 0) {
      entities.dates = dateResults.map((r) => r.start.date().toISOString());
    }

    // Extract priorities
    if (message.includes('high priority') || message.includes('urgent') || message.includes('important')) {
      entities.priorities = ['high'];
    } else if (message.includes('low priority')) {
      entities.priorities = ['low'];
    }

    return {
      intent,
      confidence,
      entities,
    };
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
    const now = new Date();
    const suggestedTimes: Array<{ time: string; reason: string; confidence: number }> = [];

    // Default suggestions
    const tomorrow9am = new Date(now);
    tomorrow9am.setDate(tomorrow9am.getDate() + 1);
    tomorrow9am.setHours(9, 0, 0, 0);

    suggestedTimes.push({
      time: tomorrow9am.toISOString(),
      reason: 'Tomorrow morning at 9 AM',
      confidence: 0.8,
    });

    const todayEvening = new Date(now);
    todayEvening.setHours(18, 0, 0, 0);

    if (todayEvening > now) {
      suggestedTimes.push({
        time: todayEvening.toISOString(),
        reason: 'Today evening at 6 PM',
        confidence: 0.7,
      });
    }

    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(9, 0, 0, 0);

    suggestedTimes.push({
      time: nextWeek.toISOString(),
      reason: 'Next week at 9 AM',
      confidence: 0.6,
    });

    return { suggestedTimes };
  }
}
