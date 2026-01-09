export function getRelevantToolGroup(
  userId: string,
  primaryToolName: string,
  getAISDKTools: (userId: string, context?: any) => any,
  context?: {
    originalMessage?: string;
    timezone?: string;
  }
): any {
  const allTools = getAISDKTools(userId, context);
  if (primaryToolName === "no_tool_needed") {
    return {};
  }
  const selectedTools: any = {};
  const primaryTool = allTools[primaryToolName];
  if (primaryTool) {
    selectedTools[primaryToolName] = primaryTool;
  }
  const reminderTools = [
    "createReminder",
    "updateReminder",
    "snoozeReminder",
    "completeReminder",
    "deleteReminder",
    "archiveReminder",
    "cancelReminder",
    "rescheduleReminder",
    "batchCreateReminders",
    "snoozeReminderByText",
    "bulkDeleteRemindersExcept",
    "bulkCompleteReminders",
    "bulkSnoozeReminders",
  ];
  const reminderQueryTools = [
    "listReminders",
    "getUpcomingReminders",
    "searchReminders",
    "listOverdueReminders",
  ];
  const listTools = [
    "createList",
    "deleteList",
    "bulkDeleteLists",
    "bulkDeleteListsExcept",
    "archiveList",
    "duplicateList",
    "getLists",
    "addItemToList",
    "removeItemFromList",
    "bulkRemoveItemsExcept",
    "updateListItem",
    "bulkCompleteItems",
    "clearCompletedItems",
    "moveItemToList",
    "reorderListItems",
    "getListItems",
    "searchLists",
    "getListStats",
  ];
  const noteTools = [
    "createNote",
    "updateNote",
    "deleteNote",
    "duplicateNote",
    "pinNote",
    "archiveNote",
    "listNotes",
    "searchNotes",
    "bulkDeleteNotesExcept",
    "bulkArchiveNotes",
  ];
  const mediaTools = [
    "getMediaHistory",
    "searchMediaByText",
    "getMediaStats",
    "linkMediaAttachment",
    "unlinkMediaAttachment",
    "transcribeMediaAttachment",
    "ocrMediaAttachment",
    "extractMediaEntities",
    "createRemindersFromImage",
    "extractListFromImage",
  ];
  const notificationTools = [
    "sendReminderToContact",
    "getNotificationHistory",
    "retryNotification",
    "getFailedNotifications",
    "bulkRetryFailedNotifications",
    "sendCustomMessage",
  ];
  const userTools = ["getUserSettings", "updateUserSettings", "setQuietHours"];
  if (reminderTools.includes(primaryToolName)) {
    if (allTools.getCurrentTime)
      selectedTools.getCurrentTime = allTools.getCurrentTime;
    if (allTools.searchReminders)
      selectedTools.searchReminders = allTools.searchReminders;
    if (allTools.listReminders)
      selectedTools.listReminders = allTools.listReminders;
    if (allTools.parseNaturalLanguageDate)
      selectedTools.parseNaturalLanguageDate =
        allTools.parseNaturalLanguageDate;
    if (allTools.suggestReminderTime)
      selectedTools.suggestReminderTime = allTools.suggestReminderTime;
    if (allTools.buildRecurrenceRule)
      selectedTools.buildRecurrenceRule = allTools.buildRecurrenceRule;
    if (allTools.explainRecurrenceRule)
      selectedTools.explainRecurrenceRule = allTools.explainRecurrenceRule;
    if (allTools.getNextOccurrences)
      selectedTools.getNextOccurrences = allTools.getNextOccurrences;
    if (allTools.resolveReminderByText)
      selectedTools.resolveReminderByText = allTools.resolveReminderByText;
  }
  if (reminderQueryTools.includes(primaryToolName)) {
    if (allTools.getCurrentTime)
      selectedTools.getCurrentTime = allTools.getCurrentTime;
    if (allTools.calculateTimeDifference)
      selectedTools.calculateTimeDifference = allTools.calculateTimeDifference;
  }
  if (
    context?.originalMessage &&
    /\b(time left|how long|how much time|when is|remaining time|time until)\b/i.test(
      context.originalMessage
    )
  ) {
    if (allTools.getCurrentTime && !selectedTools.getCurrentTime) {
      selectedTools.getCurrentTime = allTools.getCurrentTime;
    }
    if (
      allTools.calculateTimeDifference &&
      !selectedTools.calculateTimeDifference
    ) {
      selectedTools.calculateTimeDifference = allTools.calculateTimeDifference;
    }
    if (
      !selectedTools.listReminders &&
      !selectedTools.getUpcomingReminders &&
      allTools.listReminders
    ) {
      selectedTools.listReminders = allTools.listReminders;
    }
    if (!selectedTools.getUpcomingReminders && allTools.getUpcomingReminders) {
      selectedTools.getUpcomingReminders = allTools.getUpcomingReminders;
    }
    if (!selectedTools.searchReminders && allTools.searchReminders) {
      selectedTools.searchReminders = allTools.searchReminders;
    }
  }
  if (listTools.includes(primaryToolName)) {
    if (allTools.getLists) selectedTools.getLists = allTools.getLists;
    if (
      (primaryToolName === "addItemToList" ||
        primaryToolName === "removeItemFromList" ||
        primaryToolName === "updateListItem" ||
        primaryToolName === "bulkCompleteItems" ||
        primaryToolName === "clearCompletedItems" ||
        primaryToolName === "moveItemToList" ||
        primaryToolName === "reorderListItems") &&
      allTools.getListItems
    ) {
      selectedTools.getListItems = allTools.getListItems;
    }
    if (allTools.resolveListByName)
      selectedTools.resolveListByName = allTools.resolveListByName;
    if (allTools.parseItemsFromText)
      selectedTools.parseItemsFromText = allTools.parseItemsFromText;
    if (
      (primaryToolName === "deleteList" ||
        primaryToolName === "archiveList" ||
        primaryToolName === "duplicateList") &&
      allTools.getLists
    ) {
      selectedTools.getLists = allTools.getLists;
    }
  }
  if (noteTools.includes(primaryToolName)) {
    if (
      (primaryToolName === "updateNote" ||
        primaryToolName === "deleteNote" ||
        primaryToolName === "duplicateNote") &&
      allTools.searchNotes
    ) {
      selectedTools.searchNotes = allTools.searchNotes;
    }
    if (allTools.listNotes) selectedTools.listNotes = allTools.listNotes;
  }
  if (mediaTools.includes(primaryToolName)) {
    if (allTools.getMediaHistory)
      selectedTools.getMediaHistory = allTools.getMediaHistory;
    if (allTools.getMediaStats)
      selectedTools.getMediaStats = allTools.getMediaStats;
    if (
      (primaryToolName === "ocrMediaAttachment" ||
        primaryToolName === "transcribeMediaAttachment") &&
      allTools.extractMediaEntities
    ) {
      selectedTools.extractMediaEntities = allTools.extractMediaEntities;
    }
    if (allTools.createRemindersFromImage)
      selectedTools.createRemindersFromImage =
        allTools.createRemindersFromImage;
    if (allTools.extractListFromImage)
      selectedTools.extractListFromImage = allTools.extractListFromImage;
  }
  if (notificationTools.includes(primaryToolName)) {
    if (
      primaryToolName === "sendReminderToContact" &&
      allTools.getCurrentTime
    ) {
      selectedTools.getCurrentTime = allTools.getCurrentTime;
    }
    if (
      (primaryToolName === "retryNotification" ||
        primaryToolName === "bulkRetryFailedNotifications") &&
      allTools.getFailedNotifications
    ) {
      selectedTools.getFailedNotifications = allTools.getFailedNotifications;
    }
  }
  if (userTools.includes(primaryToolName)) {
    if (primaryToolName === "updateUserSettings" && allTools.getUserSettings) {
      selectedTools.getUserSettings = allTools.getUserSettings;
    }
    if (primaryToolName === "setQuietHours" && allTools.getUserSettings) {
      selectedTools.getUserSettings = allTools.getUserSettings;
    }
  }
  if (
    context?.originalMessage &&
    /\b(from now|in \d+|timer|alarm|at \d+:\d+|tomorrow|today|tonight)\b/i.test(
      context.originalMessage
    )
  ) {
    if (allTools.getCurrentTime) {
      selectedTools.getCurrentTime = allTools.getCurrentTime;
    }
    if (allTools.calculateTimeDifference) {
      selectedTools.calculateTimeDifference = allTools.calculateTimeDifference;
    }
  }
  if ((allTools as any).__stats) {
    (selectedTools as any).__stats = (allTools as any).__stats;
  }
  return selectedTools;
}
export function getRelevantTools(
  userId: string,
  getAISDKTools: (userId: string, context?: any) => any,
  _text?: string
): any {
  const allTools = getAISDKTools(userId);
  const text = (_text || "").toLowerCase().trim();

  // If no text provided, return a core set of tools (not all)
  if (!text) {
    return getCoreToolSet(allTools);
  }

  const selected: any = {};
  const add = (name: string) => {
    const tool = (allTools as any)[name];
    if (tool) (selected as any)[name] = tool;
  };

  // Note creation patterns
  if (
    /(remember this\b|\bremember\b|take a note\b|make a note\b|\bnote this\b|\bnote:\b|save this\b|store this\b|create (a )?note\b)/.test(
      text
    )
  ) {
    add("createNote");
    add("listNotes");
    add("searchNotes");
  }

  // Reminder creation patterns
  if (
    /(remind me\b|set (a )?reminder\b|schedule (a )?(reminder|alarm)\b|wake me\b|timer for\b|alarm for\b)/.test(
      text
    )
  ) {
    add("createReminder");
    add("getCurrentTime");
    add("parseNaturalLanguageDate");
  }

  // Reminder queries
  if (
    /(upcoming|today'?s?|tomorrow'?s?|my)\s*(reminder|reminders)/.test(text)
  ) {
    add("listReminders");
    add("getUpcomingReminders");
    add("searchReminders");
    add("getCurrentTime");
    add("calculateTimeDifference");
  }

  // Bulk reminder patterns - "delete all reminders except", "complete all reminders"
  if (
    /(delete|remove|clear)\s+(all|every)\s+(reminder|reminders)\s+(except|but|besides)/.test(
      text
    )
  ) {
    add("bulkDeleteRemindersExcept");
    add("listReminders");
  }
  if (
    /(complete|finish|done|mark)\s+(all|every)\s+(reminder|reminders)/.test(
      text
    )
  ) {
    add("bulkCompleteReminders");
    add("listReminders");
  }
  if (
    /(snooze|postpone|delay)\s+(all|every)\s+(reminder|reminders)/.test(text)
  ) {
    add("bulkSnoozeReminders");
    add("listReminders");
    add("parseNaturalLanguageDate");
  }

  // List queries
  if (/\b(show|what are|list)\s+(my\s+)?lists\b/.test(text)) {
    add("getLists");
  }

  // Delete list patterns - "delete my shopping list", "remove the list"
  if (/(delete|remove)\s+(the\s+)?(.+?\s+)?list\b/.test(text)) {
    add("deleteList");
    add("getLists");
  }

  // Bulk delete lists patterns - "delete these lists", "delete all lists except"
  if (/(delete|remove)\s+(all|these|multiple)\s+lists/.test(text)) {
    add("bulkDeleteLists");
    add("getLists");
  }
  if (
    /(delete|remove)\s+(all|every)\s+lists?\s+(except|but|besides)/.test(text)
  ) {
    add("bulkDeleteListsExcept");
    add("getLists");
  }

  // Add to list patterns
  if (/(add|put|include)\s+.+\s+(to|into|onto)\s+.+\s+list\b/.test(text)) {
    add("addItemToList");
    add("getLists");
    add("resolveListByName");
  }

  // Bulk removal patterns - "delete all except", "remove everything but"
  if (
    /(delete|remove|clear)\s+(all|everything)\s+(except|but|besides)/.test(text)
  ) {
    add("bulkRemoveItemsExcept");
    add("getLists");
  }

  // Remove from list patterns
  if (/(remove|delete|take off)\s+.+\s+from\s+.+\s+list\b/.test(text)) {
    add("removeItemFromList");
    add("getLists");
    add("getListItems");
  }

  // Get list items
  if (/what('?s| is) (on|in) (my\s+)?.*list/.test(text)) {
    add("getListItems");
    add("getLists");
  }

  // Note search
  if (/^(search|find)\s+(note|notes|memory|memories)\b/.test(text)) {
    add("searchNotes");
    add("listNotes");
  }

  // Note listing
  if (/\b(show|list)\s+(notes|memories)\b/.test(text)) {
    add("listNotes");
  }

  // Bulk note patterns - "delete all notes except", "archive all notes"
  if (
    /(delete|remove|clear)\s+(all|every)\s+(note|notes)\s+(except|but|besides)/.test(
      text
    )
  ) {
    add("bulkDeleteNotesExcept");
    add("listNotes");
  }
  if (/(archive)\s+(all|every)\s+(note|notes)/.test(text)) {
    add("bulkArchiveNotes");
    add("listNotes");
  }

  // Time queries
  if (/\b(time left|how long|how much time|remaining|until)\b/.test(text)) {
    add("listReminders");
    add("getUpcomingReminders");
    add("searchReminders");
    add("getCurrentTime");
    add("calculateTimeDifference");
  }

  // If we found specific tools, return them with stats
  if (Object.keys(selected).length > 0) {
    if ((allTools as any).__stats) {
      (selected as any).__stats = (allTools as any).__stats;
    }
    return selected;
  }

  // Fallback: return core tool set (not all tools!)
  return getCoreToolSet(allTools);
}

/**
 * Returns a sensible core set of tools for general queries.
 * This prevents overwhelming the LLM with 40+ tools.
 */
function getCoreToolSet(allTools: any): any {
  const coreToolNames = [
    // Reminders
    "createReminder",
    "listReminders",
    "getUpcomingReminders",
    "searchReminders",
    "updateReminder",
    "deleteReminder",
    "snoozeReminder",
    "completeReminder",
    // Lists
    "createList",
    "getLists",
    "getListItems",
    "addItemToList",
    "removeItemFromList",
    // Notes
    "createNote",
    "listNotes",
    "searchNotes",
    // Utilities
    "getCurrentTime",
    "parseNaturalLanguageDate",
    "calculateTimeDifference",
  ];

  const coreTools: any = {};
  for (const name of coreToolNames) {
    if (allTools[name]) {
      coreTools[name] = allTools[name];
    }
  }

  if ((allTools as any).__stats) {
    (coreTools as any).__stats = (allTools as any).__stats;
  }

  return coreTools;
}
