import { UserService } from './user-service';
import { ReminderService } from './reminder-service';
import { ListService } from './list-service';
import { UtilityService } from './utility-service';

export class ToolsRegistry {
  private userService: UserService;
  private reminderService: ReminderService;
  private listService: ListService;
  private utilityService: UtilityService;

  constructor() {
    this.userService = new UserService();
    this.reminderService = new ReminderService();
    this.listService = new ListService();
    this.utilityService = new UtilityService();
  }

  // Get all available tools with their schemas
  getTools() {
    return {
      // Reminder Management
      createReminder: {
        description: 'Create a new reminder',
        parameters: {
          title: 'string',
          reminderTime: 'string (ISO 8601)',
          timezone: 'string',
          isRecurring: 'boolean',
          recurrenceRule: 'string (optional)',
          notes: 'string (optional)',
          priority: "'low' | 'medium' | 'high' (optional)",
        },
        handler: this.reminderService.createReminder.bind(this.reminderService),
      },
      updateReminder: {
        description: 'Update an existing reminder',
        parameters: {
          reminderId: 'string',
          title: 'string (optional)',
          reminderTime: 'string (optional)',
          isRecurring: 'boolean (optional)',
          recurrenceRule: 'string (optional)',
          notes: 'string (optional)',
          priority: "'low' | 'medium' | 'high' (optional)",
        },
        handler: this.reminderService.updateReminder.bind(this.reminderService),
      },
      deleteReminder: {
        description: 'Delete a reminder',
        parameters: {
          reminderId: 'string (optional)',
          searchQuery: 'string (optional)',
        },
        handler: this.reminderService.deleteReminder.bind(this.reminderService),
      },
      listReminders: {
        description: 'List reminders with filters',
        parameters: {
          status: "'pending' | 'completed' | 'all' (optional)",
          startDate: 'string (optional)',
          endDate: 'string (optional)',
          limit: 'number (optional)',
          offset: 'number (optional)',
          sortBy: "'time' | 'priority' | 'created' (optional)",
        },
        handler: this.reminderService.listReminders.bind(this.reminderService),
      },
      snoozeReminder: {
        description: 'Snooze a reminder',
        parameters: {
          reminderId: 'string',
          snoozeUntil: 'string (ISO 8601)',
          snoozeDuration: 'number (optional)',
        },
        handler: this.reminderService.snoozeReminder.bind(this.reminderService),
      },
      completeReminder: {
        description: 'Mark a reminder as completed',
        parameters: {
          reminderId: 'string',
        },
        handler: this.reminderService.completeReminder.bind(this.reminderService),
      },
      getUpcomingReminders: {
        description: 'Get upcoming reminders',
        parameters: {
          timeframe: "'today' | 'tomorrow' | 'week' | 'month'",
          limit: 'number (optional)',
        },
        handler: this.reminderService.getUpcomingReminders.bind(this.reminderService),
      },
      searchReminders: {
        description: 'Search reminders',
        parameters: {
          query: 'string',
          filters: 'object (optional)',
          limit: 'number (optional)',
        },
        handler: this.reminderService.searchReminders.bind(this.reminderService),
      },
      batchCreateReminders: {
        description: 'Create multiple reminders at once',
        parameters: {
          reminders: 'Array<{ title, reminderTime, isRecurring?, recurrenceRule? }>',
        },
        handler: this.reminderService.batchCreateReminders.bind(this.reminderService),
      },

      // List Management
      createList: {
        description: 'Create a new list',
        parameters: {
          name: 'string',
          description: 'string (optional)',
          items: 'string[] (optional)',
        },
        handler: this.listService.createList.bind(this.listService),
      },
      addItemToList: {
        description: 'Add items to a list',
        parameters: {
          listId: 'string (optional)',
          listName: 'string (optional)',
          items: 'string[]',
        },
        handler: this.listService.addItemToList.bind(this.listService),
      },
      removeItemFromList: {
        description: 'Remove items from a list',
        parameters: {
          listId: 'string (optional)',
          listName: 'string (optional)',
          itemIds: 'string[] (optional)',
          itemText: 'string (optional)',
        },
        handler: this.listService.removeItemFromList.bind(this.listService),
      },
      updateListItem: {
        description: 'Update a list item',
        parameters: {
          itemId: 'string',
          newContent: 'string (optional)',
          isCompleted: 'boolean (optional)',
          position: 'number (optional)',
        },
        handler: this.listService.updateListItem.bind(this.listService),
      },
      getLists: {
        description: 'Get all lists',
        parameters: {
          includeItems: 'boolean (optional)',
          limit: 'number (optional)',
        },
        handler: this.listService.getLists.bind(this.listService),
      },
      getListItems: {
        description: 'Get items from a list',
        parameters: {
          listId: 'string (optional)',
          listName: 'string (optional)',
          includeCompleted: 'boolean (optional)',
        },
        handler: this.listService.getListItems.bind(this.listService),
      },
      deleteList: {
        description: 'Delete a list',
        parameters: {
          listId: 'string (optional)',
          listName: 'string (optional)',
        },
        handler: this.listService.deleteList.bind(this.listService),
      },
      searchLists: {
        description: 'Search lists and items',
        parameters: {
          query: 'string',
          searchIn: "'list-names' | 'items' | 'both' (optional)",
          limit: 'number (optional)',
        },
        handler: this.listService.searchLists.bind(this.listService),
      },

      // User Settings
      updateUserSettings: {
        description: 'Update user settings',
        parameters: {
          timezone: 'string (optional)',
          language: 'string (optional)',
          defaultReminderTime: 'string (optional)',
          notificationPreferences: 'object (optional)',
        },
        handler: this.userService.updateUserSettings.bind(this.userService),
      },
      getUserSettings: {
        description: 'Get user settings',
        parameters: {},
        handler: this.userService.getUserSettings.bind(this.userService),
      },
      setQuietHours: {
        description: 'Set quiet hours',
        parameters: {
          enabled: 'boolean',
          startTime: 'string',
          endTime: 'string',
          days: 'string[] (optional)',
        },
        handler: this.userService.setQuietHours.bind(this.userService),
      },

      // Utility
      parseNaturalLanguageDate: {
        description: 'Parse natural language dates',
        parameters: {
          text: 'string',
          timezone: 'string',
          referenceDate: 'string (optional)',
        },
        handler: this.utilityService.parseNaturalLanguageDate.bind(this.utilityService),
      },
      detectIntent: {
        description: 'Detect user intent from message',
        parameters: {
          message: 'string',
          conversationContext: 'string[] (optional)',
        },
        handler: this.utilityService.detectIntent.bind(this.utilityService),
      },
      suggestReminderTime: {
        description: 'Suggest reminder times',
        parameters: {
          taskDescription: 'string',
          userSchedule: 'Array<{ startTime, endTime }> (optional)',
        },
        handler: this.utilityService.suggestReminderTime.bind(this.utilityService),
      },
    };
  }

  // Execute a tool by name
  async executeTool(toolName: string, params: any): Promise<any> {
    const tools = this.getTools();
    const tool = tools[toolName as keyof typeof tools];

    if (!tool) {
      throw new Error(`Tool "${toolName}" not found`);
    }

    return tool.handler(params);
  }

  // Get user service for direct access
  getUserService() {
    return this.userService;
  }

  // Get reminder service for direct access
  getReminderService() {
    return this.reminderService;
  }

  // Get list service for direct access
  getListService() {
    return this.listService;
  }

  // Get utility service for direct access
  getUtilityService() {
    return this.utilityService;
  }
}
