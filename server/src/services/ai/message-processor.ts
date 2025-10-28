import { ConversationMessage } from "../../types/conversation";
export function enrichMessageWithContext(
  message: string,
  conversationHistory: ConversationMessage[] = [],
): string {
  const text = message.trim().toLowerCase();
  const timeframeMap: Record<string, "today" | "tomorrow" | "week" | "month"> =
    {
      today: "today",
      "today's": "today",
      tomorrow: "tomorrow",
      "tomorrow's": "tomorrow",
      week: "week",
      "this week": "week",
      month: "month",
      "this month": "month",
    };
  const timeframeOnly = Object.keys(timeframeMap).find((k) =>
    new RegExp(`^${k}$`).test(text),
  );
  if (timeframeOnly) {
    const prev = [...conversationHistory]
      .reverse()
      .find((m) => m.role === "user" || m.role === "assistant");
    const prevText = prev?.content?.toLowerCase() || "";
    if (
      /reminder|upcoming|what.*reminders|show.*reminders|list.*reminders/.test(
        prevText,
      )
    ) {
      return `reminders for ${timeframeMap[timeframeOnly]}`;
    }
  }
  try {
    const prev = [...conversationHistory]
      .reverse()
      .find((m) => m.role === "user" || m.role === "assistant");
    const prevText = prev?.content?.toLowerCase() || "";
    const wasAboutReminders =
      /\b(reminder|reminders|upcoming|next\s+reminder)\b/.test(prevText);
    const referentialNext =
      /\b(any|anything|what|which)\b.*\b(else|other|more)\b.*\b(after|next)\b/.test(
        text,
      ) || /^(and\s+)?(what\s+else|anything\s+else|any\s+other)\b/.test(text);
    if (wasAboutReminders && referentialNext) {
      return "upcoming reminders";
    }
  } catch {}
  return message;
}
export function isCommandLike(message: string): boolean {
  const original = message.toLowerCase().trim();
  const text = original.replace(
    /^(?:lmao|lol|haha|hey|hi|hello|ok|okay|pls|please|uh|um|hmm)[,!.\s]+/i,
    "",
  );
  if (
    /^(yes|yup|yeah|correct|right|that's right|exactly|sure|ok|okay|y)$/i.test(
      text,
    )
  ) {
    return true;
  }
  if (/\d+[:.]\d+\s*(am|pm|sorry|correction|actually)/i.test(text)) {
    return true;
  }
  if (
    /\b(remember(?: (?:this|that))?|take a note|make (?:a )?note|note:|note this|note that|save (?:this|that)|store (?:this|that)|keep track)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  if (text.endsWith("?")) {
    if (
      /^(can you|could you|please|will you|would you)\s+(add|create|set|schedule|remind|remove|delete|list|show|update|change|move|mark|complete|snooze|search|find|get)\b/.test(
        text,
      )
    ) {
      return true;
    }
    if (
      /^(what|which|show|list|display|tell)\b.*(list|reminder|note|item|task|memory)/.test(
        text,
      )
    ) {
      return true;
    }
    if (
      /^(my|upcoming|today'?s?|tomorrow'?s?).*(reminder|list|note|task)/.test(
        text,
      )
    ) {
      return true;
    }
  }
  if (
    /^(add|create|set|schedule|remind|remove|delete|list|show|make|note|remember|update|change|edit|move|complete|finish|done|mark|snooze|postpone|delay|search|find|get|display|view|check)\b/.test(
      text,
    )
  ) {
    return true;
  }
  if (
    /^(can you|could you|please|will you|would you|i want to|i need to|i'd like to)\s+(add|create|set|schedule|remind|remove|delete|list|show|update|change|mark)\b/.test(
      text,
    )
  ) {
    return true;
  }
  return false;
}
export function heuristicToolSelection(message: string): string {
  const text = message.toLowerCase().trim();
  if (
    /^(yes|yup|yeah|correct|right|that's right|exactly|sure|y)$/i.test(text)
  ) {
    return "conversational_with_context";
  }
  if (/\d+[:.]\d+\s*(am|pm|sorry|correction|actually)/i.test(text)) {
    return "updateReminder";
  }
  if (
    /^(remind (me|us)\b|remind me to\b|set (a )?reminder\b|set (a )?timer\b|set (a|an )?alarm\b|schedule (a )?(reminder|alarm)\b|wake me\b|alert me\b|notify me\b|timer for\b)/.test(
      text,
    )
  ) {
    return "createReminder";
  }
  if (
    /^(show|list|view|display|get)\s+(my\s+)?(all\s+)?reminders?\b(?!.*\b(today|tomorrow|week|month|upcoming)\b)/.test(
      text,
    ) ||
    /^my\s+reminders?\b(?!.*\b(today|tomorrow|week|month|upcoming|for)\b)/i.test(
      text,
    )
  ) {
    return "listReminders";
  }
  if (
    /\b(any|anything|what|which)\b.*\b(else|other|more)\b.*\b(after|next)\b/.test(
      text,
    ) ||
    /^(and\s+)?(what\s+else|anything\s+else|any\s+other)\b/.test(text)
  ) {
    return "getUpcomingReminders";
  }
  if (
    /(what\s+reminders?.*(today|tomorrow|this\s+week|this\s+month)|reminders?\s+(for\s+)?(today|tomorrow|this\s+week|this\s+month)|(today|tomorrow|this\s+week|this\s+month).*reminders?|upcoming\s+reminders?|my\s+upcoming\s+reminders?|today'?s?\s+reminders?)/.test(
      text,
    )
  ) {
    return "getUpcomingReminders";
  }
  if (/^(snooze|postpone|delay|push back)\b/.test(text)) {
    return "snoozeReminder";
  }
  if (/^(delete|remove|cancel|clear)\s+(the\s+)?reminder\b/.test(text)) {
    return "deleteReminder";
  }
  if (
    /^(change|update|edit|modify|reschedule|move)\s+(the\s+)?reminder\b/.test(
      text,
    )
  ) {
    return "updateReminder";
  }
  if (/^(show|what are|list|display|get)\s+(my\s+)?lists\b/.test(text)) {
    return "getLists";
  }
  if (/^(create|make|start|new)\s+(a\s+)?list\b/.test(text)) {
    return "createList";
  }
  if (
    /^(add|put|include|insert)\s+.+\s+(to|into|onto|in)\s+.+\s+list\b/.test(
      text,
    )
  ) {
    return "addItemToList";
  }
  if (/^(remove|delete|take off|clear)\s+.+\s+from\s+.+\s+list\b/.test(text)) {
    return "removeItemFromList";
  }
  if (
    /^(what('| i)?s|show|list|display|view|get)\s+(on|in)\s+(my\s+)?.+\s+list\b/.test(
      text,
    )
  ) {
    return "getListItems";
  }
  if (
    /\b(remember(?: (?:this|that))?|take a note|make (?:a )?note|note:|note this|note that|save (?:this|that)|store (?:this|that)|keep track)\b/i.test(
      text,
    )
  ) {
    return "createNote";
  }
  if (
    /^(search|find|look for|what did i)\s+(note|notes|memory|memories|save)\b/.test(
      text,
    )
  ) {
    return "searchNotes";
  }
  if (
    /^(show|list|display|get)\s+(my\s+)?(all\s+)?(notes|memories)\b/.test(text)
  ) {
    return "listNotes";
  }
  if (/\b(stats|statistics|completion rate|how many lists)\b/.test(text)) {
    return "getListStats";
  }
  return "no_tool_needed";
}
