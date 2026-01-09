import { UserService } from "./user-service";
import { ReminderService } from "./reminders/reminder.service";
import { ReminderActionsService } from "./reminders/actions.service";
import { ReminderQueryService } from "./reminders/query.service";
import { ListService } from "./list/list.service";
import { ListItemService } from "./list/item.service";
import { ListQueryService } from "./list/query.service";
import { UtilityService } from "./utility-service";
import { NotesService } from "./notes/notes.service";
import { NotesQueryService } from "./notes/query.service";
import { NotificationService } from "./notification-service";
import { MediaAttachmentService } from "./media-attachment-service";
import { ActivityService } from "./activity-service";
export function getTools(
  userService: UserService,
  reminderService: ReminderService,
  reminderActionsService: ReminderActionsService,
  reminderQueryService: ReminderQueryService,
  listService: ListService,
  listItemService: ListItemService,
  listQueryService: ListQueryService,
  utilityService: UtilityService,
  notesService: NotesService,
  notesQueryService: NotesQueryService,
  notificationService: NotificationService,
  mediaService: MediaAttachmentService,
  activityService: ActivityService
) {
  return {
    createReminder: {
      description: "Create a new reminder",
      parameters: {
        title: "string",
        reminderTime: "string (ISO 8601)",
        timezone: "string",
        isRecurring: "boolean",
        recurrenceRule:
          "string (optional) - MUST be a valid iCalendar RRULE (e.g., 'FREQ=DAILY;INTERVAL=1'). DO NOT use natural language like 'every day'. Use suggestReminderTime first if unsure.",
        notes: "string (optional)",
        priority: "'low' | 'medium' | 'high' (optional)",
      },
      handler: reminderService.createReminder.bind(reminderService),
    },
    updateReminder: {
      description: "Update an existing reminder",
      parameters: {
        reminderId: "string",
        title: "string (optional)",
        reminderTime: "string (optional)",
        isRecurring: "boolean (optional)",
        recurrenceRule:
          "string (optional) - MUST be a valid iCalendar RRULE. DO NOT use natural language.",
        notes: "string (optional)",
        priority: "'low' | 'medium' | 'high' (optional)",
      },
      handler: reminderService.updateReminder.bind(reminderService),
    },
    deleteReminder: {
      description: "Delete a reminder",
      parameters: {
        reminderId: "string (optional)",
        searchQuery: "string (optional)",
      },
      handler: reminderService.deleteReminder.bind(reminderService),
    },
    listReminders: {
      description:
        "List/Filter reminders by structured criteria (date, status, priority). Use this for 'my pending reminders' or 'reminders for tomorrow'. DO NOT use for text search.",
      parameters: {
        status: "'pending' | 'completed' | 'all' (optional)",
        startDate: "string (optional)",
        endDate: "string (optional)",
        limit: "number (optional)",
        offset: "number (optional)",
        sortBy: "'time' | 'priority' | 'created' (optional)",
      },
      handler: reminderQueryService.listReminders.bind(reminderQueryService),
    },
    snoozeReminder: {
      description: "Snooze a reminder",
      parameters: {
        reminderId: "string",
        snoozeUntil: "string (ISO 8601)",
        snoozeDuration: "number (optional)",
      },
      handler: reminderActionsService.snoozeReminder.bind(
        reminderActionsService
      ),
    },
    completeReminder: {
      description: "Mark a reminder as completed",
      parameters: {
        reminderId: "string",
      },
      handler: reminderActionsService.completeReminder.bind(
        reminderActionsService
      ),
    },
    getUpcomingReminders: {
      description: "Get upcoming reminders",
      parameters: {
        timeframe: "'today' | 'tomorrow' | 'week' | 'month'",
        limit: "number (optional)",
      },
      handler:
        reminderQueryService.getUpcomingReminders.bind(reminderQueryService),
    },
    searchReminders: {
      description:
        "Search reminders by text content query. Use this for 'reminders about milk' or 'find the doctor appointment'.",
      parameters: {
        query: "string",
        filters: "object (optional)",
        limit: "number (optional)",
      },
      handler: reminderQueryService.searchReminders.bind(reminderQueryService),
    },
    batchCreateReminders: {
      description: "Create multiple reminders at once",
      parameters: {
        reminders:
          "Array<{ title, reminderTime, isRecurring?, recurrenceRule? }>",
      },
      handler: reminderService.batchCreateReminders.bind(reminderService),
    },
    createList: {
      description: "Create a new list",
      parameters: {
        name: "string",
        description: "string (optional)",
        items: "string[] (optional)",
      },
      handler: listService.createList.bind(listService),
    },
    addItemToList: {
      description: "Add items to a list",
      parameters: {
        listId: "string (optional)",
        listName: "string (optional)",
        items: "string[]",
      },
      handler: listItemService.addItemToList.bind(listItemService),
    },
    removeItemFromList: {
      description: "Remove items from a list",
      parameters: {
        listId: "string (optional)",
        listName: "string (optional)",
        itemIds: "string[] (optional)",
        itemText: "string (optional)",
      },
      handler: listItemService.removeItemFromList.bind(listItemService),
    },
    updateListItem: {
      description: "Update a list item",
      parameters: {
        itemId: "string",
        newContent: "string (optional)",
        isCompleted: "boolean (optional)",
        position: "number (optional)",
      },
      handler: listItemService.updateListItem.bind(listItemService),
    },
    getLists: {
      description: "Get all lists",
      parameters: {
        includeItems: "boolean (optional)",
        includeArchived:
          "boolean (optional) - set to true to include archived lists",
        limit: "number (optional)",
      },
      handler: listQueryService.getLists.bind(listQueryService),
    },
    getListItems: {
      description: "Get items from a list",
      parameters: {
        listId: "string (optional)",
        listName: "string (optional)",
        includeCompleted: "boolean (optional)",
      },
      handler: listQueryService.getListItems.bind(listQueryService),
    },
    deleteList: {
      description: "Delete a list",
      parameters: {
        listId: "string (optional)",
        listName: "string (optional)",
      },
      handler: listService.deleteList.bind(listService),
    },
    searchLists: {
      description: "Search lists and items",
      parameters: {
        query: "string",
        searchIn: "'list-names' | 'items' | 'both' (optional)",
        limit: "number (optional)",
      },
      handler: listQueryService.searchLists.bind(listQueryService),
    },
    archiveList: {
      description: "Archive a list (soft delete)",
      parameters: {
        listId: "string (optional)",
        listName: "string (optional)",
      },
      handler: listService.archiveList.bind(listService),
    },
    bulkCompleteItems: {
      description: "Mark multiple list items as completed",
      parameters: {
        listId: "string (optional)",
        listName: "string (optional)",
        itemIds: "string[]",
      },
      handler: listItemService.bulkCompleteItems.bind(listItemService),
    },
    clearCompletedItems: {
      description: "Remove all completed items from a list",
      parameters: {
        listId: "string (optional)",
        listName: "string (optional)",
      },
      handler: listItemService.clearCompletedItems.bind(listItemService),
    },
    duplicateList: {
      description: "Duplicate a list with all its items",
      parameters: {
        listId: "string (optional)",
        listName: "string (optional)",
        newName: "string (optional)",
      },
      handler: listService.duplicateList.bind(listService),
    },
    getListStats: {
      description: "Get statistics about user's lists",
      parameters: {},
      handler: listQueryService.getListStats.bind(listQueryService),
    },
    archiveReminder: {
      description: "Archive a reminder (soft delete)",
      parameters: {
        reminderId: "string",
      },
      handler: reminderService.archiveReminder.bind(reminderService),
    },
    createNote: {
      description: "Create a new note",
      parameters: {
        content: "string",
        title: "string (optional)",
        category: "string (optional)",
        tags: "string[] (optional)",
        isPinned: "boolean (optional)",
      },
      handler: notesService.createNote.bind(notesService),
    },
    updateNote: {
      description: "Update an existing note",
      parameters: {
        noteId: "string",
        content: "string (optional)",
        title: "string (optional)",
        category: "string (optional)",
        tags: "string[] (optional)",
        isPinned: "boolean (optional)",
      },
      handler: notesService.updateNote.bind(notesService),
    },
    deleteNote: {
      description: "Delete a note",
      parameters: {
        noteId: "string",
      },
      handler: notesService.deleteNote.bind(notesService),
    },
    searchNotes: {
      description: "Search notes",
      parameters: {
        query: "string",
        category: "string (optional)",
        tags: "string[] (optional)",
        limit: "number (optional)",
      },
      handler: notesQueryService.searchNotes.bind(notesQueryService),
    },
    listNotes: {
      description: "List all notes",
      parameters: {
        category: "string (optional)",
        tags: "string[] (optional)",
        onlyPinned: "boolean (optional)",
        limit: "number (optional)",
      },
      handler: notesQueryService.listNotes.bind(notesQueryService),
    },
    duplicateNote: {
      description: "Duplicate a note",
      parameters: {
        noteId: "string",
        newTitle: "string (optional)",
      },
      handler: notesService.duplicateNote.bind(notesService),
    },
    getActivityFeed: {
      description: "Get recent activity across reminders, lists, and notes",
      parameters: {
        limit: "number (optional)",
        offset: "number (optional)",
        types: "Array<'reminder' | 'list' | 'note' | 'all'> (optional)",
      },
      handler: activityService.getActivityFeed.bind(activityService),
    },
    updateUserSettings: {
      description: "Update user settings",
      parameters: {
        timezone: "string (optional)",
        language: "string (optional)",
        defaultReminderTime: "string (optional)",
        notificationPreferences: "object (optional)",
      },
      handler: userService.updateUserSettings.bind(userService),
    },
    getUserSettings: {
      description: "Get user settings",
      parameters: {},
      handler: userService.getUserSettings.bind(userService),
    },
    setQuietHours: {
      description: "Set quiet hours",
      parameters: {
        enabled: "boolean",
        startTime: "string",
        endTime: "string",
        days: "string[] (optional)",
      },
      handler: userService.setQuietHours.bind(userService),
    },
    parseNaturalLanguageDate: {
      description: "Parse natural language dates",
      parameters: {
        text: "string",
        timezone: "string",
        referenceDate: "string (optional)",
      },
      handler: utilityService.parseNaturalLanguageDate.bind(utilityService),
    },
    detectIntent: {
      description: "Detect user intent from message",
      parameters: {
        message: "string",
        conversationContext: "string[] (optional)",
      },
      handler: utilityService.detectIntent.bind(utilityService),
    },
    suggestReminderTime: {
      description: "Suggest reminder times",
      parameters: {
        taskDescription: "string",
        userSchedule: "Array<{ startTime, endTime }> (optional)",
      },
      handler: utilityService.suggestReminderTime.bind(utilityService),
    },
    getCurrentTime: {
      description: "Get the current time in the user's timezone",
      parameters: {
        timezone: "string",
      },
      handler: utilityService.getCurrentTime.bind(utilityService),
    },
    sendReminderToContact: {
      description: "Send reminder to another contact",
      parameters: {
        recipientNumber: "string",
        recipientName: "string (optional)",
        reminderText: "string",
        reminderTime: "string",
        fromUserName: "string (optional)",
      },
      handler:
        notificationService.sendReminderToContact.bind(notificationService),
    },
    getNotificationHistory: {
      description: "Get notification history",
      parameters: {
        limit: "number (optional)",
        offset: "number (optional)",
        type: "'reminder' | 'shared' | 'all' (optional)",
      },
      handler:
        notificationService.getNotificationHistory.bind(notificationService),
    },
    sendCustomMessage: {
      description: "Send custom formatted message",
      parameters: {
        message: "string",
        formatting: "'plain' | 'markdown' (optional)",
        buttons: "Array<{id: string, label: string}> (optional)",
      },
      handler: notificationService.sendCustomMessage.bind(notificationService),
    },
    getMediaHistory: {
      description: "Get user's media attachments history",
      parameters: {
        mediaType: "'image' | 'audio' | 'video' | 'document' (optional)",
        limit: "number (optional)",
      },
      handler: mediaService.getUserAttachments.bind(mediaService),
    },
    searchMediaByText: {
      description: "Search media by extracted text",
      parameters: {
        query: "string",
        limit: "number (optional)",
      },
      handler: mediaService.searchByText.bind(mediaService),
    },
    getMediaStats: {
      description: "Get media attachment statistics",
      parameters: {},
      handler: mediaService.getAttachmentStats.bind(mediaService),
    },
    cancelReminder: {
      description: "Cancel a reminder (status = cancelled)",
      parameters: {
        reminderId: "string",
      },
      handler: reminderService.cancelReminder.bind(reminderService),
    },
    rescheduleReminder: {
      description: "Change reminder_time safely",
      parameters: {
        reminderId: "string",
        newReminderTime: "string (ISO 8601)",
      },
      handler: reminderService.rescheduleReminder.bind(reminderService),
    },
    listOverdueReminders: {
      description: "Get pending reminders with reminder_time < now",
      parameters: {
        limit: "number (optional)",
        offset: "number (optional)",
      },
      handler:
        reminderQueryService.listOverdueReminders.bind(reminderQueryService),
    },
    snoozeReminderByText: {
      description: "Snooze using natural language like 'tomorrow morning'",
      parameters: {
        reminderId: "string",
        text: "string",
        timezone: "string",
      },
      handler: reminderActionsService.snoozeReminderByText.bind(
        reminderActionsService
      ),
    },
    bulkUpdateReminderStatus: {
      description: "Update status for multiple reminders",
      parameters: {
        reminderIds: "string[]",
        status: "'completed' | 'cancelled' | 'pending'",
      },
      handler: reminderActionsService.bulkUpdateStatus.bind(
        reminderActionsService
      ),
    },
    retryNotification: {
      description:
        "Retry a failed notification (reset fields, increment retry)",
      parameters: {
        notificationId: "string",
      },
      handler: notificationService.retryNotification.bind(notificationService),
    },
    getFailedNotifications: {
      description: "Fetch failed notification entries for remediation",
      parameters: {
        limit: "number (optional)",
      },
      handler:
        notificationService.getFailedNotifications.bind(notificationService),
    },
    bulkRetryFailedNotifications: {
      description: "Retry multiple failed by IDs",
      parameters: {
        notificationIds: "string[]",
      },
      handler: notificationService.bulkRetryFailed.bind(notificationService),
    },
    linkMediaAttachment: {
      description: "Link attachment to an entity via FK",
      parameters: {
        attachmentId: "string",
        reminderId: "string (optional)",
        listItemId: "string (optional)",
        noteId: "string (optional)",
      },
      handler: mediaService.linkToItem.bind(mediaService),
    },
    unlinkMediaAttachment: {
      description: "Unlink attachment from all entities",
      parameters: {
        attachmentId: "string",
      },
      handler: mediaService.unlinkAttachment.bind(mediaService),
    },
    transcribeMediaAttachment: {
      description: "Transcribe audio attachment",
      parameters: {
        attachmentId: "string",
      },
      handler: mediaService.transcribeAttachment.bind(mediaService),
    },
    ocrMediaAttachment: {
      description: "OCR image/PDF attachment",
      parameters: {
        attachmentId: "string",
      },
      handler: mediaService.ocrAttachment.bind(mediaService),
    },
    extractMediaEntities: {
      description: "Extract entities from attachment",
      parameters: {
        attachmentId: "string",
      },
      handler: mediaService.extractEntities.bind(mediaService),
    },
    moveItemToList: {
      description: "Move an item across lists",
      parameters: {
        itemId: "string",
        targetListId: "string",
      },
      handler: listItemService.moveItemToList.bind(listItemService),
    },
    reorderListItems: {
      description: "Reorder a list's items via positions",
      parameters: {
        listId: "string",
        orderedItemIds: "string[]",
      },
      handler: listItemService.reorderListItems.bind(listItemService),
    },
    pinNote: {
      description: "Toggle note is_pinned",
      parameters: {
        noteId: "string",
        isPinned: "boolean",
      },
      handler: notesService.pinNote.bind(notesService),
    },
    archiveNote: {
      description: "Toggle note is_archived",
      parameters: {
        noteId: "string",
        isArchived: "boolean",
      },
      handler: notesService.archiveNote.bind(notesService),
    },
    validateRecurrenceRule: {
      description: "Validate an iCalendar RRULE",
      parameters: {
        recurrenceRule: "string",
      },
      handler: utilityService.validateRecurrenceRule.bind(utilityService),
    },
    globalSearch: {
      description:
        "Unified search across reminders, user_notes, lists, list_items, media_attachments",
      parameters: {
        query: "string",
        limit: "number (optional)",
      },
      handler: utilityService.globalSearch.bind(utilityService),
    },
  };
}
