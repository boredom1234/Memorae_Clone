import { UserService } from "./user-service";
import { ReminderService } from "./reminder-service";
import { ListService } from "./list-service";
import { UtilityService } from "./utility-service";
import { NotesService } from "./notes-service";
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
  private listService: ListService;
  private utilityService: UtilityService;
  private notesService: NotesService;
  private notificationService: NotificationService;
  private mediaService: MediaAttachmentService;
  private activityService: ActivityService;

  constructor() {
    this.userService = new UserService();
    this.reminderService = new ReminderService();
    this.listService = new ListService();
    this.utilityService = new UtilityService();
    this.notesService = new NotesService();
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
        handler: this.reminderService.listReminders.bind(this.reminderService),
      },
      snoozeReminder: {
        description: "Snooze a reminder",
        parameters: {
          reminderId: "string",
          snoozeUntil: "string (ISO 8601)",
          snoozeDuration: "number (optional)",
        },
        handler: this.reminderService.snoozeReminder.bind(this.reminderService),
      },
      completeReminder: {
        description: "Mark a reminder as completed",
        parameters: {
          reminderId: "string",
        },
        handler: this.reminderService.completeReminder.bind(
          this.reminderService,
        ),
      },
      getUpcomingReminders: {
        description: "Get upcoming reminders",
        parameters: {
          timeframe: "'today' | 'tomorrow' | 'week' | 'month'",
          limit: "number (optional)",
        },
        handler: this.reminderService.getUpcomingReminders.bind(
          this.reminderService,
        ),
      },
      searchReminders: {
        description: "Search reminders",
        parameters: {
          query: "string",
          filters: "object (optional)",
          limit: "number (optional)",
        },
        handler: this.reminderService.searchReminders.bind(
          this.reminderService,
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
        handler: this.listService.addItemToList.bind(this.listService),
      },
      removeItemFromList: {
        description: "Remove items from a list",
        parameters: {
          listId: "string (optional)",
          listName: "string (optional)",
          itemIds: "string[] (optional)",
          itemText: "string (optional)",
        },
        handler: this.listService.removeItemFromList.bind(this.listService),
      },
      updateListItem: {
        description: "Update a list item",
        parameters: {
          itemId: "string",
          newContent: "string (optional)",
          isCompleted: "boolean (optional)",
          position: "number (optional)",
        },
        handler: this.listService.updateListItem.bind(this.listService),
      },
      getLists: {
        description: "Get all lists",
        parameters: {
          includeItems: "boolean (optional)",
          includeArchived:
            "boolean (optional) - set to true to include archived lists",
          limit: "number (optional)",
        },
        handler: this.listService.getLists.bind(this.listService),
      },
      getListItems: {
        description: "Get items from a list",
        parameters: {
          listId: "string (optional)",
          listName: "string (optional)",
          includeCompleted: "boolean (optional)",
        },
        handler: this.listService.getListItems.bind(this.listService),
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
        handler: this.listService.searchLists.bind(this.listService),
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
        handler: this.listService.bulkCompleteItems.bind(this.listService),
      },
      clearCompletedItems: {
        description: "Remove all completed items from a list",
        parameters: {
          listId: "string (optional)",
          listName: "string (optional)",
        },
        handler: this.listService.clearCompletedItems.bind(this.listService),
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
        handler: this.listService.getListStats.bind(this.listService),
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
        handler: this.notesService.searchNotes.bind(this.notesService),
      },
      listNotes: {
        description: "List all notes",
        parameters: {
          category: "string (optional)",
          tags: "string[] (optional)",
          onlyPinned: "boolean (optional)",
          limit: "number (optional)",
        },
        handler: this.notesService.listNotes.bind(this.notesService),
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

  getListService() {
    return this.listService;
  }

  getUtilityService() {
    return this.utilityService;
  }

  getNotesService() {
    return this.notesService;
  }

  getAISDKTools(userId: string) {
    const { dedupe, stats } = createDeduplicationWrapper();
    const services: ToolServices = {
      userService: this.userService,
      reminderService: this.reminderService,
      listService: this.listService,
      utilityService: this.utilityService,
      notesService: this.notesService,
      notificationService: this.notificationService,
      mediaService: this.mediaService,
      activityService: this.activityService,
    };
    const toolsObj = createAISDKTools(userId, services, dedupe);
    (toolsObj as any).__stats = stats;
    return toolsObj;
  }
  
  /**
   * NEW: Returns a simplified list of tool definitions for the router.
   */
  getToolDefinitions(userId: string): Array<{ name: string; description: string }> {
    const allTools = this.getAISDKTools(userId);
    const definitions = [];
    for (const toolName in allTools) {
      // Filter out the internal __stats property
      if (toolName === '__stats') continue;
      
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

  /**
   * NEW: Gets the definition for a single, specific tool.
   */
  getSingleAISDKTool(userId: string, toolName: string): any {
    const allTools = this.getAISDKTools(userId);
    const selectedTool = allTools[toolName];

    if (!selectedTool) {
      return null;
    }

    const toolSet = {
        [toolName]: selectedTool
    };
    
    // Preserve the stats object if it exists
    if ((allTools as any).__stats) {
      (toolSet as any).__stats = (allTools as any).__stats;
    }
    
    return toolSet;
  }
}

