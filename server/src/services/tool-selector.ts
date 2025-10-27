export function getRelevantToolGroup(
  userId: string,
  primaryToolName: string,
  getAISDKTools: (userId: string, context?: any) => any,
  context?: {
    originalMessage?: string;
    timezone?: string;
  },
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
    "archiveList",
    "duplicateList",
    "getLists",
    "addItemToList",
    "removeItemFromList",
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
      context.originalMessage,
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
      context.originalMessage,
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
  _text?: string,
): any {
  const allTools = getAISDKTools(userId);
  const text = (_text || "").toLowerCase().trim();
  if (!text) return allTools;
  const selected: any = {};
  const add = (name: string) => {
    const tool = (allTools as any)[name];
    if (tool) (selected as any)[name] = tool;
  };
  if (
    /(remember this\b|\bremember\b|take a note\b|make a note\b|\bnote this\b|\bnote:\b|save this\b|store this\b|create (a )?note\b)/.test(
      text,
    )
  ) {
    add("createNote");
  }
  if (
    /(remind me\b|set (a )?reminder\b|schedule (a )?(reminder|alarm)\b|wake me\b)/.test(
      text,
    )
  ) {
    add("createReminder");
  }
  if (/\b(show|what are|list)\s+(my\s+)?lists\b/.test(text)) {
    add("getLists");
  }
  if (/(add|put|include)\s+.+\s+(to|into|onto)\s+.+\s+list\b/.test(text)) {
    add("addItemToList");
  }
  if (/(remove|delete|take off)\s+.+\s+from\s+.+\s+list\b/.test(text)) {
    add("removeItemFromList");
  }
  if (/^(search|find)\s+(note|notes|memory|memories)\b/.test(text)) {
    add("searchNotes");
  }
  if (/\b(show|list)\s+(notes|memories)\b/.test(text)) {
    add("listNotes");
  }
  if (Object.keys(selected).length > 0) {
    if ((allTools as any).__stats) {
      (selected as any).__stats = (allTools as any).__stats;
    }
    return selected;
  }
  return allTools;
}
