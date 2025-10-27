export function isStateChangingTool(toolName: string): boolean {
  return [
    "createReminder",
    "batchCreateReminders",
    "updateReminder",
    "deleteReminder",
    "snoozeReminder",
    "completeReminder",
    "createList",
    "addItemToList",
    "removeItemFromList",
    "updateListItem",
    "deleteList",
    "archiveList",
    "bulkCompleteItems",
    "clearCompletedItems",
    "duplicateList",
    "createNote",
    "updateNote",
    "deleteNote",
    "duplicateNote",
  ].includes(toolName);
}
