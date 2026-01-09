import { ConversationMessage } from "../../types/conversation";

export function enrichMessageWithContext(
  message: string,
  conversationHistory: ConversationMessage[] = []
): string {
  const text = message.trim().toLowerCase();

  // 1. Timeframe contextualization (e.g., "today" -> "reminders for today")
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

  // Check if message is JUST a timeframe (e.g. "Tomorrow")
  const timeframeOnly = Object.keys(timeframeMap).find((k) =>
    new RegExp(`^${k}$`).test(text)
  );

  if (timeframeOnly) {
    const prev = [...conversationHistory]
      .reverse()
      .find((m) => m.role === "user" || m.role === "assistant");
    const prevText = prev?.content?.toLowerCase() || "";

    if (
      /reminder|upcoming|what.*reminders|show.*reminders|list.*reminders/.test(
        prevText
      )
    ) {
      return `reminders for ${timeframeMap[timeframeOnly]}`;
    }
  }

  // 2. Deep Context: Look back 3 turns to find the active topic
  // If the user says "Delete it" or "Add milk", we need to know "to what?"
  try {
    const relevantHistory = [...conversationHistory]
      .reverse()
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(0, 3); // Look at last 3 interactions

    let topic: "list" | "note" | "reminder" | null = null;
    let listName: string | null = null;

    for (const msg of relevantHistory) {
      const content = msg.content.toLowerCase();

      // Detect List Topic
      if (/\b(list|shopping|todo|groceries)\b/.test(content)) {
        topic = "list";
        // Try to extract list name if possible (naive)
        const nameMatch = content.match(/\b(shopping|grocery|todo)\s+list\b/);
        if (nameMatch) listName = nameMatch[1];
        break;
      }

      // Detect Note Topic
      if (/\b(note|notes|memo|journal)\b/.test(content)) {
        topic = "note";
        break;
      }

      // Detect Reminder Topic
      if (/\b(reminder|reminders|alarm|alert)\b/.test(content)) {
        topic = "reminder";
        break;
      }
    }

    // Apply context if current message is ambiguous
    const isAmbiguousAction =
      /^(delete|remove|clear|complete|finish|done|add|create|make|show|list)\b/.test(
        text
      ) ||
      /\b(it|that|this|them)\b/.test(text) ||
      /^(yes|no|sure|please)\b/.test(text);

    // If ambiguous and we have a topic, verify we aren't overriding a new specific request
    // e.g. If context is "List", but user says "Create a reminder", don't prepend "List"
    const hasNewTopic = /\b(list|note|reminder|alarm)\b/.test(text);

    if (isAmbiguousAction && topic && !hasNewTopic) {
      if (topic === "list") {
         // "Add milk" -> "Add milk to the list"
         // "Delete it" -> "Delete from list"
         if (listName) return `${message} (Context: ${listName} list)`;
         return `${message} (Context: list)`;
      }
      if (topic === "note") {
        return `${message} (Context: notes)`;
      }
      if (topic === "reminder") {
        // "Delete it" -> "Delete reminder"
        return `${message} (Context: reminders)`;
      }
    }

  } catch (err) {
    // Fail safe - return original message
  }

  return message;
}

export function heuristicToolSelection(_message: string): string {
  // Deprecated: We now rely on the AI model to select tools
  return "no_tool_needed";
}

export function isCommandLike(message: string): boolean {
  return message.trim().length > 0;
}
