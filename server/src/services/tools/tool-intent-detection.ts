/**
 * Tool Intent Detection Module
 * Detects user intent from messages and maps to relevant tool categories
 */

/**
 * Detect user intent from message text
 * Returns array of intent categories
 */
export function detectIntent(message: string): string[] {
  const lower = message.toLowerCase().trim();
  const intents: string[] = [];

  // Reminder-related keywords
  if (
    /\b(remind|reminder|alert|notify|schedule|set a reminder|don't forget|don't let me forget)\b/.test(
      lower,
    )
  ) {
    intents.push("reminder");
  }

  // List-related keywords
  if (
    /\b(list|shopping|groceries|todo|task|add to|put on|check off|mark as done)\b/.test(
      lower,
    )
  ) {
    intents.push("list");
  }

  // Note/memory keywords
  if (
    /\b(note|remember|save|store|keep track|write down|take a note|what did I|do you remember|where did I)\b/.test(
      lower,
    )
  ) {
    intents.push("note");
  }

  // Settings keywords
  if (
    /\b(setting|settings|timezone|language|quiet hours|notification|preference|configure|my name|who am i|my phone)\b/.test(
      lower,
    )
  ) {
    intents.push("settings");
  }

  // Time query keywords
  if (
    /\b(what time|current time|what date|time now|today's date)\b/.test(lower)
  ) {
    intents.push("time");
  }

  // Update/modify keywords
  if (
    /\b(update|change|modify|edit|reschedule|move|shift)\b/.test(lower) &&
    !intents.includes("settings")
  ) {
    if (intents.includes("reminder")) {
      intents.push("update");
    }
  }

  // Delete/remove keywords
  if (/\b(delete|remove|cancel|clear|get rid of|forget)\b/.test(lower)) {
    intents.push("delete");
  }

  // Search/find keywords
  if (
    /\b(find|search|look for|where is|show|display|what's on)\b/.test(lower)
  ) {
    intents.push("search");
  }

  // Snooze/postpone keywords
  if (/\b(snooze|postpone|delay|push back|later)\b/.test(lower)) {
    intents.push("snooze");
  }

  // Complete/done keywords
  if (
    /\b(complete|done|finished|mark as done|mark as complete)\b/.test(lower)
  ) {
    intents.push("complete");
  }

  // Notification-related keywords
  if (
    /\b(notification|history|send reminder to|share reminder|notify someone)\b/.test(
      lower,
    )
  ) {
    intents.push("notification");
  }

  // Media-related keywords
  if (
    /\b(image|images|photo|photos|picture|pictures|media|show my images|my images|find image|search image)\b/.test(
      lower,
    )
  ) {
    intents.push("media");
  }

  // Default to general if no specific intent detected
  if (intents.length === 0) {
    intents.push("general");
  }

  return intents;
}

/**
 * Get tool category mappings
 * Organizes tools into logical categories
 */
export function getToolCategories(): Record<string, string[]> {
  return {
    // Core utility tools (always included)
    core: ["getCurrentTime", "getUserSettings"],

    // Reminder management
    reminder_create: ["createReminder", "batchCreateReminders"],
    reminder_read: ["listReminders", "searchReminders", "getUpcomingReminders"],
    reminder_update: ["updateReminder", "snoozeReminder"],
    reminder_delete: ["deleteReminder"],
    reminder_complete: ["completeReminder"],

    // List management
    list_create: ["createList", "addItemToList"],
    list_read: ["getLists", "getListItems", "searchLists"],
    list_update: ["updateListItem"],
    list_delete: ["deleteList", "removeItemFromList"],

    // Notes/Memory
    note_create: ["createNote"],
    note_read: ["searchNotes", "listNotes"],
    note_update: ["updateNote"],
    note_delete: ["deleteNote"],

    // User settings
    settings: ["updateUserSettings", "setQuietHours"],

    // Notifications
    notification: [
      "sendReminderToContact",
      "getNotificationHistory",
      "sendCustomMessage",
    ],

    // Media attachments
    media: ["getMediaHistory", "searchMediaByText", "getMediaStats"],
  };
}

/**
 * Map intents to relevant tool names
 * Returns set of tool names that should be included
 */
export function mapIntentsToTools(intents: string[]): Set<string> {
  const categories = getToolCategories();
  const selectedToolNames = new Set<string>(categories.core);

  for (const intent of intents) {
    switch (intent) {
      case "reminder":
        categories.reminder_create.forEach((t) => selectedToolNames.add(t));
        categories.reminder_read.forEach((t) => selectedToolNames.add(t));
        break;

      case "update":
        if (intents.includes("reminder")) {
          categories.reminder_update.forEach((t) => selectedToolNames.add(t));
          categories.reminder_read.forEach((t) => selectedToolNames.add(t));
        }
        if (intents.includes("list")) {
          categories.list_update.forEach((t) => selectedToolNames.add(t));
          categories.list_read.forEach((t) => selectedToolNames.add(t));
        }
        if (intents.includes("note")) {
          categories.note_update.forEach((t) => selectedToolNames.add(t));
          categories.note_read.forEach((t) => selectedToolNames.add(t));
        }
        break;

      case "delete":
        if (intents.includes("reminder")) {
          categories.reminder_delete.forEach((t) => selectedToolNames.add(t));
          categories.reminder_read.forEach((t) => selectedToolNames.add(t));
        }
        if (intents.includes("list")) {
          categories.list_delete.forEach((t) => selectedToolNames.add(t));
          categories.list_read.forEach((t) => selectedToolNames.add(t));
        }
        if (intents.includes("note")) {
          categories.note_delete.forEach((t) => selectedToolNames.add(t));
          categories.note_read.forEach((t) => selectedToolNames.add(t));
        }
        break;

      case "search":
        if (intents.includes("reminder")) {
          categories.reminder_read.forEach((t) => selectedToolNames.add(t));
        }
        if (intents.includes("list")) {
          categories.list_read.forEach((t) => selectedToolNames.add(t));
        }
        if (intents.includes("note")) {
          categories.note_read.forEach((t) => selectedToolNames.add(t));
        }
        // If no specific category, include all search tools
        if (
          !intents.includes("reminder") &&
          !intents.includes("list") &&
          !intents.includes("note")
        ) {
          categories.reminder_read.forEach((t) => selectedToolNames.add(t));
          categories.list_read.forEach((t) => selectedToolNames.add(t));
          categories.note_read.forEach((t) => selectedToolNames.add(t));
        }
        break;

      case "list":
        categories.list_create.forEach((t) => selectedToolNames.add(t));
        categories.list_read.forEach((t) => selectedToolNames.add(t));
        break;

      case "note":
        categories.note_create.forEach((t) => selectedToolNames.add(t));
        categories.note_read.forEach((t) => selectedToolNames.add(t));
        break;

      case "settings":
        categories.settings.forEach((t) => selectedToolNames.add(t));
        break;

      case "time":
        // Core already includes getCurrentTime
        break;

      case "snooze":
        categories.reminder_update.forEach((t) => selectedToolNames.add(t));
        categories.reminder_read.forEach((t) => selectedToolNames.add(t));
        break;

      case "complete":
        categories.reminder_complete.forEach((t) => selectedToolNames.add(t));
        categories.reminder_read.forEach((t) => selectedToolNames.add(t));
        if (intents.includes("list")) {
          categories.list_update.forEach((t) => selectedToolNames.add(t));
          categories.list_read.forEach((t) => selectedToolNames.add(t));
        }
        break;

      case "notification":
        categories.notification.forEach((t) => selectedToolNames.add(t));
        break;

      case "media":
        categories.media.forEach((t) => selectedToolNames.add(t));
        break;

      case "general":
      default:
        // For general/unknown intents, include most common tools
        categories.reminder_create.forEach((t) => selectedToolNames.add(t));
        categories.reminder_read.forEach((t) => selectedToolNames.add(t));
        categories.list_create.forEach((t) => selectedToolNames.add(t));
        categories.list_read.forEach((t) => selectedToolNames.add(t));
        categories.note_read.forEach((t) => selectedToolNames.add(t));
        break;
    }
  }

  return selectedToolNames;
}
