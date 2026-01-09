import { ConversationMessage } from "../../types/conversation";
export function enrichMessageWithContext(
  message: string,
  conversationHistory: ConversationMessage[] = []
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
  try {
    const prev = [...conversationHistory]
      .reverse()
      .find((m) => m.role === "user" || m.role === "assistant");
    const prevText = prev?.content?.toLowerCase() || "";
    const wasAboutReminders =
      /\b(reminder|reminders|upcoming|next\s+reminder)\b/.test(prevText);
    const referentialNext =
      /\b(any|anything|what|which)\b.*\b(else|other|more)\b.*\b(after|next)\b/.test(
        text
      ) || /^(and\s+)?(what\s+else|anything\s+else|any\s+other)\b/.test(text);
    if (wasAboutReminders && referentialNext) {
      return "upcoming reminders";
    }
  } catch {}
  return message;
}
export function heuristicToolSelection(_message: string): string {
  // Deprecated: We now rely on the AI model to select tools
  return "no_tool_needed";
}

export function isCommandLike(message: string): boolean {
  // Deprecated: We now treat all messages as potential commands if they have intent
  // This is kept for backward compatibility if any other service calls it,
  // but it now basically returns true for anything non-empty to let AI decide.
  return message.trim().length > 0;
}
