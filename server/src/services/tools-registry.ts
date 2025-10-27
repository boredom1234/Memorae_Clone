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
import { AppError } from "../utils/errors";
import { logError, logInfo } from "../utils/logger";
import { createAISDKTools, ToolServices } from "./tools/tool-definitions";
import { createDeduplicationWrapper } from "./tools/tool-deduplication";
export class ToolsRegistry {
  private userService: UserService;
  private reminderService: ReminderService;
  private reminderActionsService: ReminderActionsService;
  private reminderQueryService: ReminderQueryService;
  private listService: ListService;
  private listItemService: ListItemService;
  private listQueryService: ListQueryService;
  private utilityService: UtilityService;
  private notesService: NotesService;
  private notesQueryService: NotesQueryService;
  private notificationService: NotificationService;
  private mediaService: MediaAttachmentService;
  private activityService: ActivityService;
  constructor() {
    this.userService = new UserService();
    this.reminderService = new ReminderService();
    this.reminderActionsService = new ReminderActionsService();
    this.reminderQueryService = new ReminderQueryService();
    this.listService = new ListService();
    this.listItemService = new ListItemService();
    this.listQueryService = new ListQueryService();
    this.utilityService = new UtilityService();
    this.notesService = new NotesService();
    this.notesQueryService = new NotesQueryService();
    this.notificationService = new NotificationService();
    this.mediaService = new MediaAttachmentService();
    this.activityService = new ActivityService();
  }
  getTools() {
    return {
      createReminder: {
        description: "Create a new reminder",
        parameters: {
          title: "string",
          reminderTime: "string (ISO 8601)",
          timezone: "string",
          isRecurring: "boolean",
          recurrenceRule: "string (optional)",
          notes: "string (optional)",
          priority: "'low' | 'medium' | 'high' (optional)",
        },
        handler: this.reminderService.createReminder.bind(this.reminderService),
      },
      updateReminder: {
        description: "Update an existing reminder",
        parameters: {
          reminderId: "string",
          title: "string (optional)",
          reminderTime: "string (optional)",
          isRecurring: "boolean (optional)",
          recurrenceRule: "string (optional)",
          notes: "string (optional)",
          priority: "'low' | 'medium' | 'high' (optional)",
        },
        handler: this.reminderService.updateReminder.bind(this.reminderService),
      },
      deleteReminder: {
        description: "Delete a reminder",
        parameters: {
          reminderId: "string (optional)",
          searchQuery: "string (optional)",
        },
        handler: this.reminderService.deleteReminder.bind(this.reminderService),
      },
      listReminders: {
        description: "List reminders with filters",
        parameters: {
          status: "'pending' | 'completed' | 'all' (optional)",
          startDate: "string (optional)",
          endDate: "string (optional)",
          limit: "number (optional)",
          offset: "number (optional)",
          sortBy: "'time' | 'priority' | 'created' (optional)",
        },
        handler: this.reminderQueryService.listReminders.bind(
          this.reminderQueryService,
        ),
      },
      snoozeReminder: {
        description: "Snooze a reminder",
        parameters: {
          reminderId: "string",
          snoozeUntil: "string (ISO 8601)",
          snoozeDuration: "number (optional)",
        },
        handler: this.reminderActionsService.snoozeReminder.bind(
          this.reminderActionsService,
        ),
      },
      completeReminder: {
        description: "Mark a reminder as completed",
        parameters: {
          reminderId: "string",
        },
        handler: this.reminderActionsService.completeReminder.bind(
          this.reminderActionsService,
        ),
      },
      getUpcomingReminders: {
        description: "Get upcoming reminders",
        parameters: {
          timeframe: "'today' | 'tomorrow' | 'week' | 'month'",
          limit: "number (optional)",
        },
        handler: this.reminderQueryService.getUpcomingReminders.bind(
          this.reminderQueryService,
        ),
      },
      searchReminders: {
        description: "Search reminders",
        parameters: {
          query: "string",
          filters: "object (optional)",
          limit: "number (optional)",
        },
        handler: this.reminderQueryService.searchReminders.bind(
          this.reminderQueryService,
        ),
      },
      batchCreateReminders: {
        description: "Create multiple reminders at once",
        parameters: {
          reminders:
            "Array<{ title, reminderTime, isRecurring?, recurrenceRule? }>",
        },
        handler: this.reminderService.batchCreateReminders.bind(
          this.reminderService,
        ),
      },
      createList: {
        description: "Create a new list",
        parameters: {
          name: "string",
          description: "string (optional)",
          items: "string[] (optional)",
        },
        handler: this.listService.createList.bind(this.listService),
      },
      addItemToList: {
        description: "Add items to a list",
        parameters: {
          listId: "string (optional)",
          listName: "string (optional)",
          items: "string[]",
        },
        handler: this.listItemService.addItemToList.bind(this.listItemService),
      },
      removeItemFromList: {
        description: "Remove items from a list",
        parameters: {
          listId: "string (optional)",
          listName: "string (optional)",
          itemIds: "string[] (optional)",
          itemText: "string (optional)",
        },
        handler: this.listItemService.removeItemFromList.bind(
          this.listItemService,
        ),
      },
      updateListItem: {
        description: "Update a list item",
        parameters: {
          itemId: "string",
          newContent: "string (optional)",
          isCompleted: "boolean (optional)",
          position: "number (optional)",
        },
        handler: this.listItemService.updateListItem.bind(this.listItemService),
      },
      getLists: {
        description: "Get all lists",
        parameters: {
          includeItems: "boolean (optional)",
          includeArchived:
            "boolean (optional) - set to true to include archived lists",
          limit: "number (optional)",
        },
        handler: this.listQueryService.getLists.bind(this.listQueryService),
      },
      getListItems: {
        description: "Get items from a list",
        parameters: {
          listId: "string (optional)",
          listName: "string (optional)",
          includeCompleted: "boolean (optional)",
        },
        handler: this.listQueryService.getListItems.bind(this.listQueryService),
      },
      deleteList: {
        description: "Delete a list",
        parameters: {
          listId: "string (optional)",
          listName: "string (optional)",
        },
        handler: this.listService.deleteList.bind(this.listService),
      },
      searchLists: {
        description: "Search lists and items",
        parameters: {
          query: "string",
          searchIn: "'list-names' | 'items' | 'both' (optional)",
          limit: "number (optional)",
        },
        handler: this.listQueryService.searchLists.bind(this.listQueryService),
      },
      archiveList: {
        description: "Archive a list (soft delete)",
        parameters: {
          listId: "string (optional)",
          listName: "string (optional)",
        },
        handler: this.listService.archiveList.bind(this.listService),
      },
      bulkCompleteItems: {
        description: "Mark multiple list items as completed",
        parameters: {
          listId: "string (optional)",
          listName: "string (optional)",
          itemIds: "string[]",
        },
        handler: this.listItemService.bulkCompleteItems.bind(
          this.listItemService,
        ),
      },
      clearCompletedItems: {
        description: "Remove all completed items from a list",
        parameters: {
          listId: "string (optional)",
          listName: "string (optional)",
        },
        handler: this.listItemService.clearCompletedItems.bind(
          this.listItemService,
        ),
      },
      duplicateList: {
        description: "Duplicate a list with all its items",
        parameters: {
          listId: "string (optional)",
          listName: "string (optional)",
          newName: "string (optional)",
        },
        handler: this.listService.duplicateList.bind(this.listService),
      },
      getListStats: {
        description: "Get statistics about user's lists",
        parameters: {},
        handler: this.listQueryService.getListStats.bind(this.listQueryService),
      },
      archiveReminder: {
        description: "Archive a reminder (soft delete)",
        parameters: {
          reminderId: "string",
        },
        handler: this.reminderService.archiveReminder.bind(
          this.reminderService,
        ),
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
        handler: this.notesService.createNote.bind(this.notesService),
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
        handler: this.notesService.updateNote.bind(this.notesService),
      },
      deleteNote: {
        description: "Delete a note",
        parameters: {
          noteId: "string",
        },
        handler: this.notesService.deleteNote.bind(this.notesService),
      },
      searchNotes: {
        description: "Search notes",
        parameters: {
          query: "string",
          category: "string (optional)",
          tags: "string[] (optional)",
          limit: "number (optional)",
        },
        handler: this.notesQueryService.searchNotes.bind(
          this.notesQueryService,
        ),
      },
      listNotes: {
        description: "List all notes",
        parameters: {
          category: "string (optional)",
          tags: "string[] (optional)",
          onlyPinned: "boolean (optional)",
          limit: "number (optional)",
        },
        handler: this.notesQueryService.listNotes.bind(this.notesQueryService),
      },
      duplicateNote: {
        description: "Duplicate a note",
        parameters: {
          noteId: "string",
          newTitle: "string (optional)",
        },
        handler: this.notesService.duplicateNote.bind(this.notesService),
      },
      getActivityFeed: {
        description: "Get recent activity across reminders, lists, and notes",
        parameters: {
          limit: "number (optional)",
          offset: "number (optional)",
          types: "Array<'reminder' | 'list' | 'note' | 'all'> (optional)",
        },
        handler: this.activityService.getActivityFeed.bind(
          this.activityService,
        ),
      },
      updateUserSettings: {
        description: "Update user settings",
        parameters: {
          timezone: "string (optional)",
          language: "string (optional)",
          defaultReminderTime: "string (optional)",
          notificationPreferences: "object (optional)",
        },
        handler: this.userService.updateUserSettings.bind(this.userService),
      },
      getUserSettings: {
        description: "Get user settings",
        parameters: {},
        handler: this.userService.getUserSettings.bind(this.userService),
      },
      setQuietHours: {
        description: "Set quiet hours",
        parameters: {
          enabled: "boolean",
          startTime: "string",
          endTime: "string",
          days: "string[] (optional)",
        },
        handler: this.userService.setQuietHours.bind(this.userService),
      },
      parseNaturalLanguageDate: {
        description: "Parse natural language dates",
        parameters: {
          text: "string",
          timezone: "string",
          referenceDate: "string (optional)",
        },
        handler: this.utilityService.parseNaturalLanguageDate.bind(
          this.utilityService,
        ),
      },
      detectIntent: {
        description: "Detect user intent from message",
        parameters: {
          message: "string",
          conversationContext: "string[] (optional)",
        },
        handler: this.utilityService.detectIntent.bind(this.utilityService),
      },
      suggestReminderTime: {
        description: "Suggest reminder times",
        parameters: {
          taskDescription: "string",
          userSchedule: "Array<{ startTime, endTime }> (optional)",
        },
        handler: this.utilityService.suggestReminderTime.bind(
          this.utilityService,
        ),
      },
      getCurrentTime: {
        description: "Get the current time in the user's timezone",
        parameters: {
          timezone: "string",
        },
        handler: this.utilityService.getCurrentTime.bind(this.utilityService),
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
        handler: this.notificationService.sendReminderToContact.bind(
          this.notificationService,
        ),
      },
      getNotificationHistory: {
        description: "Get notification history",
        parameters: {
          limit: "number (optional)",
          offset: "number (optional)",
          type: "'reminder' | 'shared' | 'all' (optional)",
        },
        handler: this.notificationService.getNotificationHistory.bind(
          this.notificationService,
        ),
      },
      sendCustomMessage: {
        description: "Send custom formatted message",
        parameters: {
          message: "string",
          formatting: "'plain' | 'markdown' (optional)",
          buttons: "Array<{id: string, label: string}> (optional)",
        },
        handler: this.notificationService.sendCustomMessage.bind(
          this.notificationService,
        ),
      },
      getMediaHistory: {
        description: "Get user's media attachments history",
        parameters: {
          mediaType: "'image' | 'audio' | 'video' | 'document' (optional)",
          limit: "number (optional)",
        },
        handler: this.mediaService.getUserAttachments.bind(this.mediaService),
      },
      searchMediaByText: {
        description: "Search media by extracted text",
        parameters: {
          query: "string",
          limit: "number (optional)",
        },
        handler: this.mediaService.searchByText.bind(this.mediaService),
      },
      getMediaStats: {
        description: "Get media attachment statistics",
        parameters: {},
        handler: this.mediaService.getAttachmentStats.bind(this.mediaService),
      },
      cancelReminder: {
        description: "Cancel a reminder (status = cancelled)",
        parameters: {
          reminderId: "string",
        },
        handler: this.reminderService.cancelReminder.bind(this.reminderService),
      },
      rescheduleReminder: {
        description: "Change reminder_time safely",
        parameters: {
          reminderId: "string",
          newReminderTime: "string (ISO 8601)",
        },
        handler: this.reminderService.rescheduleReminder.bind(
          this.reminderService,
        ),
      },
      listOverdueReminders: {
        description: "Get pending reminders with reminder_time < now",
        parameters: {
          limit: "number (optional)",
          offset: "number (optional)",
        },
        handler: this.reminderQueryService.listOverdueReminders.bind(
          this.reminderQueryService,
        ),
      },
      snoozeReminderByText: {
        description: "Snooze using natural language like 'tomorrow morning'",
        parameters: {
          reminderId: "string",
          text: "string",
          timezone: "string",
        },
        handler: this.reminderActionsService.snoozeReminderByText.bind(
          this.reminderActionsService,
        ),
      },
      bulkUpdateReminderStatus: {
        description: "Update status for multiple reminders",
        parameters: {
          reminderIds: "string[]",
          status: "'completed' | 'cancelled' | 'pending'",
        },
        handler: this.reminderActionsService.bulkUpdateStatus.bind(
          this.reminderActionsService,
        ),
      },
      retryNotification: {
        description:
          "Retry a failed notification (reset fields, increment retry)",
        parameters: {
          notificationId: "string",
        },
        handler: this.notificationService.retryNotification.bind(
          this.notificationService,
        ),
      },
      getFailedNotifications: {
        description: "Fetch failed notification entries for remediation",
        parameters: {
          limit: "number (optional)",
        },
        handler: this.notificationService.getFailedNotifications.bind(
          this.notificationService,
        ),
      },
      bulkRetryFailedNotifications: {
        description: "Retry multiple failed by IDs",
        parameters: {
          notificationIds: "string[]",
        },
        handler: this.notificationService.bulkRetryFailed.bind(
          this.notificationService,
        ),
      },
      linkMediaAttachment: {
        description: "Link attachment to an entity via FK",
        parameters: {
          attachmentId: "string",
          reminderId: "string (optional)",
          listItemId: "string (optional)",
          noteId: "string (optional)",
        },
        handler: this.mediaService.linkToItem.bind(this.mediaService),
      },
      unlinkMediaAttachment: {
        description: "Unlink attachment from all entities",
        parameters: {
          attachmentId: "string",
        },
        handler: this.mediaService.unlinkAttachment.bind(this.mediaService),
      },
      transcribeMediaAttachment: {
        description: "Transcribe audio attachment",
        parameters: {
          attachmentId: "string",
        },
        handler: this.mediaService.transcribeAttachment.bind(this.mediaService),
      },
      ocrMediaAttachment: {
        description: "OCR image/PDF attachment",
        parameters: {
          attachmentId: "string",
        },
        handler: this.mediaService.ocrAttachment.bind(this.mediaService),
      },
      extractMediaEntities: {
        description: "Extract entities from attachment",
        parameters: {
          attachmentId: "string",
        },
        handler: this.mediaService.extractEntities.bind(this.mediaService),
      },
      moveItemToList: {
        description: "Move an item across lists",
        parameters: {
          itemId: "string",
          targetListId: "string",
        },
        handler: this.listItemService.moveItemToList.bind(this.listItemService),
      },
      reorderListItems: {
        description: "Reorder a list's items via positions",
        parameters: {
          listId: "string",
          orderedItemIds: "string[]",
        },
        handler: this.listItemService.reorderListItems.bind(
          this.listItemService,
        ),
      },
      pinNote: {
        description: "Toggle note is_pinned",
        parameters: {
          noteId: "string",
          isPinned: "boolean",
        },
        handler: this.notesService.pinNote.bind(this.notesService),
      },
      archiveNote: {
        description: "Toggle note is_archived",
        parameters: {
          noteId: "string",
          isArchived: "boolean",
        },
        handler: this.notesService.archiveNote.bind(this.notesService),
      },
      validateRecurrenceRule: {
        description: "Validate an iCalendar RRULE",
        parameters: {
          recurrenceRule: "string",
        },
        handler: this.utilityService.validateRecurrenceRule.bind(
          this.utilityService,
        ),
      },
      globalSearch: {
        description:
          "Unified search across reminders, user_notes, lists, list_items, media_attachments",
        parameters: {
          query: "string",
          limit: "number (optional)",
        },
        handler: this.utilityService.globalSearch.bind(this.utilityService),
      },
    };
  }
  async executeTool(toolName: string, params: any): Promise<any> {
    try {
      logInfo(`Executing tool: ${toolName}`, { toolName, hasParams: !!params });
      const tools = this.getTools();
      const tool = tools[toolName as keyof typeof tools];
      if (!tool) {
        throw new AppError(
          `Tool "${toolName}" not found`,
          404,
          "TOOL_NOT_FOUND",
        );
      }
      const result = await tool.handler(params);
      logInfo(`Tool executed successfully: ${toolName}`, { toolName });
      return result;
    } catch (error) {
      logError(`Failed to execute tool: ${toolName}`, error, {
        toolName,
        params,
      });
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        `Tool execution failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        500,
        "TOOL_EXECUTION_ERROR",
        { toolName, originalError: error },
      );
    }
  }
  getUserService() {
    return this.userService;
  }
  getReminderService() {
    return this.reminderService;
  }
  getReminderActionsService() {
    return this.reminderActionsService;
  }
  getReminderQueryService() {
    return this.reminderQueryService;
  }
  getListService() {
    return this.listService;
  }
  getListItemService() {
    return this.listItemService;
  }
  getListQueryService() {
    return this.listQueryService;
  }
  getUtilityService() {
    return this.utilityService;
  }
  getNotesService() {
    return this.notesService;
  }
  getNotesQueryService() {
    return this.notesQueryService;
  }
  getAISDKTools(
    userId: string,
    context?: {
      originalMessage?: string;
      timezone?: string;
    },
  ) {
    const { dedupe, stats } = createDeduplicationWrapper(context);
    const services: ToolServices = {
      userService: this.userService,
      reminderService: this.reminderService,
      reminderActionsService: this.reminderActionsService,
      reminderQueryService: this.reminderQueryService,
      listService: this.listService,
      listItemService: this.listItemService,
      listQueryService: this.listQueryService,
      utilityService: this.utilityService,
      notesService: this.notesService,
      notesQueryService: this.notesQueryService,
      notificationService: this.notificationService,
      mediaService: this.mediaService,
      activityService: this.activityService,
    };
    const toolsObj = createAISDKTools(userId, services, dedupe);
    (toolsObj as any).__stats = stats;
    return toolsObj;
  }
  getToolDefinitions(userId: string): Array<{
    name: string;
    description: string;
  }> {
    const allTools = this.getAISDKTools(userId);
    const definitions = [];
    for (const toolName in allTools) {
      if (toolName === "__stats") continue;
      const tool = allTools[toolName];
      if (tool && tool.description) {
        definitions.push({
          name: toolName,
          description: tool.description,
        });
      }
    }
    return definitions;
  }
  getSingleAISDKTool(
    userId: string,
    toolName: string,
    context?: {
      originalMessage?: string;
      timezone?: string;
    },
  ): any {
    const allTools = this.getAISDKTools(userId, context);
    const selectedTool = allTools[toolName];
    if (!selectedTool) {
      return null;
    }
    const toolSet = {
      [toolName]: selectedTool,
    };
    if ((allTools as any).__stats) {
      (toolSet as any).__stats = (allTools as any).__stats;
    }
    return toolSet;
  }
  getRelevantToolGroup(
    userId: string,
    primaryToolName: string,
    context?: {
      originalMessage?: string;
      timezone?: string;
    },
  ): any {
    const allTools = this.getAISDKTools(userId, context);
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
    ];
    const notificationTools = [
      "sendReminderToContact",
      "getNotificationHistory",
      "retryNotification",
      "getFailedNotifications",
      "bulkRetryFailedNotifications",
      "sendCustomMessage",
    ];
    const userTools = [
      "getUserSettings",
      "updateUserSettings",
      "setQuietHours",
    ];
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
    }
    if (reminderQueryTools.includes(primaryToolName)) {
      if (allTools.getCurrentTime)
        selectedTools.getCurrentTime = allTools.getCurrentTime;
      if (allTools.calculateTimeDifference)
        selectedTools.calculateTimeDifference =
          allTools.calculateTimeDifference;
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
        selectedTools.calculateTimeDifference =
          allTools.calculateTimeDifference;
      }
      if (
        !selectedTools.listReminders &&
        !selectedTools.getUpcomingReminders &&
        allTools.listReminders
      ) {
        selectedTools.listReminders = allTools.listReminders;
      }
      if (
        !selectedTools.getUpcomingReminders &&
        allTools.getUpcomingReminders
      ) {
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
      if (
        primaryToolName === "updateUserSettings" &&
        allTools.getUserSettings
      ) {
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
        selectedTools.calculateTimeDifference =
          allTools.calculateTimeDifference;
      }
    }
    if ((allTools as any).__stats) {
      (selectedTools as any).__stats = (allTools as any).__stats;
    }
    return selectedTools;
  }
  getRelevantTools(userId: string, _text?: string): any {
    const allTools = this.getAISDKTools(userId);
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
}
