export function isStateChangingTool(toolName: string): boolean {
  return [
    // Reminders
    "createReminder",
    "batchCreateReminders",
    "updateReminder",
    "deleteReminder",
    "snoozeReminder",
    "snoozeReminderByText",
    "completeReminder",
    "archiveReminder",
    "cancelReminder",
    "rescheduleReminder",

    // Lists
    "createList",
    "addItemToList",
    "removeItemFromList",
    "updateListItem",
    "deleteList",
    "archiveList",
    "bulkCompleteItems",
    "clearCompletedItems",
    "duplicateList",
    "renameList",
    "mergeLists",
    "moveItemToList",
    "reorderListItems",
    "batchAddItemsToList",

    // Notes
    "createNote",
    "updateNote",
    "deleteNote",
    "duplicateNote",
    "pinNote",
    "archiveNote",

    // Notifications / Media (side-effectful)
    "sendReminderToContact",
    "sendCustomMessage",
    "retryNotification",
    "bulkRetryFailedNotifications",
    "linkMediaAttachment",
    "unlinkMediaAttachment",
    "transcribeMediaAttachment",
    "ocrMediaAttachment",
    "extractMediaEntities",
  ].includes(toolName);
}
