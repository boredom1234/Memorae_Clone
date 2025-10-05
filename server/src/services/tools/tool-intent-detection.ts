export function detectIntent(message: string): string[] {
  const lower = message.toLowerCase().trim();
  const intents: string[] = [];
  if (
    /\b(remind|reminder|alert|notify|schedule|set a reminder|don't forget|don't let me forget)\b/.test(
      lower,
    )
  ) {
    intents.push("reminder");
  }
  if (
    /\b(list|shopping|groceries|todo|task|add to|put on|check off|mark as done)\b/.test(
      lower,
    )
  ) {
    intents.push("list");
  }
  if (
    /\b(note|remember|save|store|keep track|write down|take a note|what did I|do you remember|where did I)\b/.test(
      lower,
    )
  ) {
    intents.push("note");
  }
  if (
    /\b(setting|settings|timezone|language|quiet hours|notification|preference|configure|my name|who am i|my phone)\b/.test(
      lower,
    )
  ) {
    intents.push("settings");
  }
  if (
    /\b(what time|current time|what date|time now|today's date)\b/.test(lower)
  ) {
    intents.push("time");
  }
  if (
    /\b(update|change|modify|edit|reschedule|move|shift)\b/.test(lower) &&
    !intents.includes("settings")
  ) {
    if (intents.includes("reminder")) {
      intents.push("update");
    }
  }
  if (/\b(delete|remove|cancel|clear|get rid of|forget)\b/.test(lower)) {
    intents.push("delete");
  }
  if (
    /\b(find|search|look for|where is|show|display|what's on)\b/.test(lower)
  ) {
    intents.push("search");
  }
  if (/\b(snooze|postpone|delay|push back|later)\b/.test(lower)) {
    intents.push("snooze");
  }
  if (
    /\b(complete|done|finished|mark as done|mark as complete)\b/.test(lower)
  ) {
    intents.push("complete");
  }
  if (
    /\b(notification|history|send reminder to|share reminder|notify someone)\b/.test(
      lower,
    )
  ) {
    intents.push("notification");
  }
  if (
    /\b(image|images|photo|photos|picture|pictures|media|show my images|my images|find image|search image)\b/.test(
      lower,
    )
  ) {
    intents.push("media");
  }
  if (intents.length === 0) {
    intents.push("general");
  }
  return intents;
}
export function getToolCategories(): Record<string, string[]> {
  return {
    core: ["getCurrentTime", "getUserSettings"],
    reminder_create: ["createReminder", "batchCreateReminders"],
    reminder_read: ["listReminders", "searchReminders", "getUpcomingReminders"],
    reminder_update: ["updateReminder", "snoozeReminder"],
    reminder_delete: ["deleteReminder"],
    reminder_complete: ["completeReminder"],
    list_create: ["createList", "addItemToList"],
    list_read: ["getLists", "getListItems", "searchLists"],
    list_update: ["updateListItem"],
    list_delete: ["deleteList", "removeItemFromList"],
    note_create: ["createNote"],
    note_read: ["searchNotes", "listNotes"],
    note_update: ["updateNote"],
    note_delete: ["deleteNote"],
    settings: ["updateUserSettings", "setQuietHours"],
    notification: [
      "sendReminderToContact",
      "getNotificationHistory",
      "sendCustomMessage",
    ],
    media: ["getMediaHistory", "searchMediaByText", "getMediaStats"],
  };
}
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
