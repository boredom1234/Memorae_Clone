import * as chrono from "chrono-node";
import { validate, detectIntentSchema } from "../../utils/validators";
import { handleServiceError, ValidationError } from "../../utils/errors";
import { logError, logPerformance, logWarn } from "../../utils/logger";
export function parseListItemsFromText(text: string): {
  items: string[];
} {
  try {
    if (!text) return { items: [] };
    const lines = text
      .split(/\r?\n|,/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.replace(/^[-*•\d\.\)\(\s]+/, "").trim())
      .filter((l) => l.length > 0 && l.length <= 200);
    const items = Array.from(new Set(lines.map((l) => l.replace(/\s+/g, " "))));
    return { items };
  } catch (error) {
    logError("Failed to parse items from text", error, {
      textLen: text?.length,
    });
    return { items: [] };
  }
}
export function extractTasksFromText(text: string): {
  tasks: string[];
} {
  try {
    if (!text) return { tasks: [] };
    const lines = text.split(/\r?\n/).map((l) => l.trim());
    const candidates = lines
      .map((l) => l.replace(/^[-*•\d\.\)\(\s]+/, "").trim())
      .filter((l) => l.length > 0)
      .filter((l) =>
        /\b(todo\b|task\b|remember\b|buy\b|call\b|email\b|schedule\b|follow up\b|follow-up\b|pay\b|send\b|draft\b|prepare\b|review\b|finish\b|complete\b|book\b)/i.test(
          l,
        ),
      );
    const tasks = Array.from(
      new Set(candidates.map((t) => t.replace(/\s+/g, " "))),
    );
    return { tasks };
  } catch (error) {
    logError("Failed to extract tasks from text", error, {
      textLen: text?.length,
    });
    return { tasks: [] };
  }
}
export function detectIntent(params: {
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
