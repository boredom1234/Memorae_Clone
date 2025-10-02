import { UserService } from "./user-service";
import { ReminderService } from "./reminder-service";
import { ListService } from "./list-service";
import { UtilityService } from "./utility-service";
import { MemoryTools } from "./memory-tools";
import { AppError } from "../utils/errors";
import { logError, logInfo } from "../utils/logger";
import { tool } from "ai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

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

      // List Management
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

      // User Settings
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

      // Utility
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
    };
  }

  // Execute a tool by name
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

      // Re-throw AppError as-is, wrap other errors
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

  // Get AI SDK compatible tools for tool calling
  getAISDKTools(userId: string) {
    // Initialize memory tools
    const memoryTools = new MemoryTools(userId);
    // Define schemas separately to ensure they're properly initialized
    const createReminderSchema = z.object({
      title: z.string().describe("The reminder title/description"),
      reminderTime: z
        .string()
        .describe(
          'ISO 8601 datetime string when the reminder should trigger. For relative times like "in 30 seconds", calculate the absolute time from now.',
        ),
      isRecurring: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether this is a recurring reminder"),
      recurrenceRule: z
        .string()
        .optional()
        .describe(
          'Recurrence rule. Accepts either plain English (e.g., "daily", "every 2 weeks", "weekdays") OR iCalendar RRULE (e.g., "FREQ=MONTHLY;BYDAY=SA;BYSETPOS=2,4" for 2nd and 4th Saturday).',
        ),
      notes: z.string().optional().describe("Additional notes"),
      priority: z
        .enum(["low", "medium", "high"])
        .optional()
        .describe("Priority level"),
    });

    // Debug: Log the JSON Schema conversion
    const jsonSchema = zodToJsonSchema(
      createReminderSchema,
      "createReminderSchema",
    );
    logInfo("createReminder JSON Schema:", {
      jsonSchema: JSON.stringify(jsonSchema, null, 2),
    });

    return {
      createReminder: tool({
        description:
          'Create a new reminder for the user. For complex recurring patterns (e.g., "every 2nd and 4th Saturday at 10am"), set isRecurring=true and provide recurrenceRule as RRULE (e.g., "FREQ=MONTHLY;BYDAY=SA;BYSETPOS=2,4").',
        inputSchema: createReminderSchema,
        execute: async (params) => {
          return await this.reminderService.createReminder({
            userId,
            title: params.title,
            reminderTime: params.reminderTime,
            timezone: "UTC", // Will be overridden by user's timezone
            isRecurring: params.isRecurring ?? false,
            recurrenceRule: params.recurrenceRule,
            notes: params.notes,
            priority: params.priority,
          });
        },
      }),

      updateReminder: tool({
        description:
          'Update an existing reminder. Use this when the user wants to change the time, title, or priority of a reminder. Examples: "change my dentist reminder to 4pm", "update the meeting reminder to tomorrow", "make the call reminder high priority".',
        inputSchema: z.object({
          searchQuery: z.string().describe("Text to search for the reminder"),
          title: z.string().optional().describe("New title for the reminder"),
          reminderTime: z.string().optional().describe("New ISO 8601 datetime"),
          priority: z
            .enum(["low", "medium", "high"])
            .optional()
            .describe("New priority"),
        }),
        execute: async (params) => {
          // Search for the reminder first
          const searchResult = await this.reminderService.searchReminders({
            userId,
            query: params.searchQuery,
            limit: 1,
          });

          if (searchResult.results.length === 0) {
            throw new Error("Could not find that reminder");
          }

          // Update the reminder
          return await this.reminderService.updateReminder({
            reminderId: searchResult.results[0].id,
            title: params.title,
            reminderTime: params.reminderTime,
            priority: params.priority,
          });
        },
      }),

      deleteReminder: tool({
        description:
          'Delete a reminder. Use this when the user wants to remove or cancel a reminder. Examples: "delete my dentist reminder", "cancel the meeting reminder", "remove the reminder about calling John".',
        inputSchema: z.object({
          searchQuery: z
            .string()
            .describe("Text to search for the reminder to delete"),
        }),
        execute: async (params) => {
          const searchResult = await this.reminderService.searchReminders({
            userId,
            query: params.searchQuery,
            limit: 1,
          });

          if (searchResult.results.length === 0) {
            throw new Error("Could not find that reminder");
          }

          return await this.reminderService.deleteReminder({
            userId,
            reminderId: searchResult.results[0].id,
          });
        },
      }),

      listReminders: tool({
        description:
          'List all reminders for the user with optional filters. Use this when the user wants to see their reminders. Examples: "show me my reminders", "list all my pending reminders", "what reminders do I have?".',
        inputSchema: z.object({
          status: z
            .enum(["pending", "completed", "all"])
            .optional()
            .describe("Filter by status"),
          limit: z
            .number()
            .optional()
            .describe("Maximum number of reminders to return"),
        }),
        execute: async (params) => {
          return await this.reminderService.listReminders({
            userId,
            status: params.status || "pending",
            limit: params.limit || 10,
            sortBy: "time",
          });
        },
      }),

      completeReminder: tool({
        description:
          'Mark a reminder as completed. Use this when the user has finished a task and wants to mark it as done. Examples: "mark the dentist reminder as done", "complete the meeting reminder", "I finished calling John".',
        inputSchema: z.object({
          searchQuery: z
            .string()
            .describe("Text to search for the reminder to complete"),
        }),
        execute: async (params) => {
          const searchResult = await this.reminderService.searchReminders({
            userId,
            query: params.searchQuery,
            limit: 1,
          });

          if (searchResult.results.length === 0) {
            throw new Error("Could not find that reminder");
          }

          return await this.reminderService.completeReminder({
            reminderId: searchResult.results[0].id,
          });
        },
      }),

      createList: tool({
        description:
          'Create a new list for the user. Use this when the user wants to create a shopping list, todo list, or any other type of list. Examples: "create a shopping list", "make a list called groceries", "start a new todo list".',
        inputSchema: z.object({
          name: z.string().describe("Name of the list"),
          description: z
            .string()
            .optional()
            .describe("Description of the list"),
          items: z
            .array(z.string())
            .optional()
            .describe("Initial items to add"),
        }),
        execute: async (params) => {
          return await this.listService.createList({
            userId,
            ...params,
          });
        },
      }),

      addItemToList: tool({
        description:
          'Add items to an existing list or create a new list if it doesn\'t exist. Use this when the user wants to add items to a list. Examples: "add milk to my shopping list", "add buy groceries to my todo list", "put eggs and bread on the shopping list".',
        inputSchema: z.object({
          listName: z.string().describe("Name of the list"),
          items: z.array(z.string()).describe("Items to add to the list"),
        }),
        execute: async (params) => {
          try {
            return await this.listService.addItemToList({
              userId,
              listName: params.listName,
              items: params.items,
            });
          } catch (error) {
            // List doesn't exist, create it
            return await this.listService.createList({
              userId,
              name: params.listName,
              items: params.items,
            });
          }
        },
      }),

      getLists: tool({
        description:
          'Get all lists for the user. Use this when the user wants to see their lists. Examples: "show me my lists", "what lists do I have?", "list all my lists".',
        inputSchema: z.object({
          includeItems: z
            .boolean()
            .optional()
            .describe("Whether to include list items"),
        }),
        execute: async (params) => {
          return await this.listService.getLists({
            userId,
            includeItems: params.includeItems ?? true,
            limit: 20,
          });
        },
      }),

      searchReminders: tool({
        description: "Search for reminders by text query.",
        inputSchema: z.object({
          query: z.string().describe("Search query"),
          limit: z.number().optional().describe("Maximum results"),
          includeCompleted: z
            .boolean()
            .optional()
            .describe("Whether to include completed reminders"),
        }),
        execute: async (params) => {
          return await this.reminderService.searchReminders({
            userId,
            query: params.query,
            limit: params.limit || 10,
          });
        },
      }),

      snoozeReminder: tool({
        description:
          "Snooze a reminder to a later time. Use this when the user wants to postpone a reminder.",
        inputSchema: z.object({
          searchQuery: z
            .string()
            .describe("Text to search for the reminder to snooze"),
          snoozeUntil: z
            .string()
            .describe(
              'ISO 8601 datetime when the reminder should trigger after snoozing. For relative times like "in 10 minutes", calculate the absolute time from now.',
            ),
        }),
        execute: async (params) => {
          const searchResult = await this.reminderService.searchReminders({
            userId,
            query: params.searchQuery,
            limit: 1,
          });

          if (searchResult.results.length === 0) {
            throw new Error("Could not find that reminder");
          }

          return await this.reminderService.snoozeReminder({
            reminderId: searchResult.results[0].id,
            snoozeUntil: params.snoozeUntil,
          });
        },
      }),

      getUpcomingReminders: tool({
        description:
          "Get upcoming reminders for a specific timeframe. Use this when the user asks about reminders coming up today, tomorrow, this week, or this month.",
        inputSchema: z.object({
          timeframe: z
            .enum(["today", "tomorrow", "week", "month"])
            .describe("The timeframe to get reminders for"),
          limit: z
            .number()
            .optional()
            .describe("Maximum number of reminders to return"),
        }),
        execute: async (params) => {
          return await this.reminderService.getUpcomingReminders({
            userId,
            timeframe: params.timeframe,
            limit: params.limit || 10,
          });
        },
      }),

      batchCreateReminders: tool({
        description:
          "Create multiple reminders at once. For complex recurrence, each reminder can include an RRULE in recurrenceRule (e.g., FREQ=MONTHLY;BYDAY=SA;BYSETPOS=2,4).",
        inputSchema: z.object({
          reminders: z
            .array(
              z.object({
                title: z.string().describe("The reminder title/description"),
                reminderTime: z
                  .string()
                  .describe(
                    "ISO 8601 datetime string when the reminder should trigger",
                  ),
                isRecurring: z
                  .boolean()
                  .optional()
                  .describe("Whether this is a recurring reminder"),
                recurrenceRule: z
                  .string()
                  .optional()
                  .describe(
                    'Recurrence rule in plain English or RRULE. Examples: "daily" or "FREQ=WEEKLY;BYDAY=MO,WE,FR".',
                  ),
              }),
            )
            .describe("Array of reminders to create"),
        }),
        execute: async (params) => {
          return await this.reminderService.batchCreateReminders({
            userId,
            reminders: params.reminders,
          });
        },
      }),

      getListItems: tool({
        description:
          'Get items from a specific list. Use this when the user wants to see what\'s in a particular list. Examples: "show me my shopping list", "what\'s on my todo list?", "display the groceries list".',
        inputSchema: z.object({
          listName: z.string().describe("Name of the list to get items from"),
          includeCompleted: z
            .boolean()
            .optional()
            .describe("Whether to include completed items"),
        }),
        execute: async (params) => {
          return await this.listService.getListItems({
            userId,
            listName: params.listName,
            includeCompleted: params.includeCompleted ?? false,
          });
        },
      }),

      removeItemFromList: tool({
        description:
          'Remove items from a list. Use this when the user wants to delete or remove items from a list. Examples: "remove milk from my shopping list", "delete eggs from the groceries list", "take bread off the shopping list".',
        inputSchema: z.object({
          listName: z.string().describe("Name of the list"),
          itemText: z
            .string()
            .describe("Text to search for in items to remove"),
        }),
        execute: async (params) => {
          return await this.listService.removeItemFromList({
            userId,
            listName: params.listName,
            itemText: params.itemText,
          });
        },
      }),

      updateListItem: tool({
        description:
          'Update a list item (mark as completed, change content, or reorder). Use this when the user wants to check off an item or modify it. Examples: "mark milk as done", "check off eggs from the list", "complete buy groceries".',
        inputSchema: z.object({
          listName: z.string().describe("Name of the list containing the item"),
          itemText: z
            .string()
            .describe("Text to search for the item to update"),
          isCompleted: z
            .boolean()
            .optional()
            .describe("Mark item as completed or not"),
          newContent: z
            .string()
            .optional()
            .describe("New content for the item"),
        }),
        execute: async (params) => {
          // First, search for the item
          const listItems = await this.listService.getListItems({
            userId,
            listName: params.listName,
            includeCompleted: true,
          });

          const item = listItems.items.find((i) =>
            i.content.toLowerCase().includes(params.itemText.toLowerCase()),
          );

          if (!item) {
            throw new Error(
              `Could not find item "${params.itemText}" in list "${params.listName}"`,
            );
          }

          return await this.listService.updateListItem({
            itemId: item.id,
            isCompleted: params.isCompleted,
            newContent: params.newContent,
          });
        },
      }),

      deleteList: tool({
        description:
          'Delete an entire list. Use this when the user wants to remove a whole list. Examples: "delete my shopping list", "remove the groceries list", "get rid of my todo list".',
        inputSchema: z.object({
          listName: z.string().describe("Name of the list to delete"),
        }),
        execute: async (params) => {
          return await this.listService.deleteList({
            userId,
            listName: params.listName,
          });
        },
      }),

      searchLists: tool({
        description:
          'Search for lists or items within lists. Use this when the user wants to find something in their lists. Examples: "find milk in my lists", "search for eggs", "where is buy groceries?".',
        inputSchema: z.object({
          query: z.string().describe("Search query"),
          searchIn: z
            .enum(["list-names", "items", "both"])
            .optional()
            .describe("Where to search"),
          limit: z.number().optional().describe("Maximum results"),
        }),
        execute: async (params) => {
          return await this.listService.searchLists({
            userId,
            query: params.query,
            searchIn: params.searchIn || "both",
            limit: params.limit || 20,
          });
        },
      }),

      getUserSettings: tool({
        description:
          'Get the user\'s current settings including timezone, language, and notification preferences. Use this when the user asks about their settings. Examples: "what are my settings?", "what\'s my timezone?", "show my preferences".',
        inputSchema: z.object({}),
        execute: async () => {
          return await this.userService.getUserSettings(userId);
        },
      }),

      updateUserSettings: tool({
        description:
          'Update user settings like timezone, language, or notification preferences. Use this when the user wants to change their settings. Examples: "change my timezone to EST", "set my language to Spanish", "turn off notifications".',
        inputSchema: z.object({
          timezone: z
            .string()
            .optional()
            .describe(
              'Timezone (e.g., "America/New_York", "UTC", "Asia/Tokyo")',
            ),
          language: z
            .string()
            .optional()
            .describe('Language code (e.g., "en", "es", "fr")'),
          notificationEnabled: z
            .boolean()
            .optional()
            .describe("Enable or disable notifications"),
        }),
        execute: async (params) => {
          const updateParams: any = {};
          if (params.timezone) updateParams.timezone = params.timezone;
          if (params.language) updateParams.language = params.language;
          if (params.notificationEnabled !== undefined) {
            updateParams.notificationPreferences = {
              enabled: params.notificationEnabled,
            };
          }
          return await this.userService.updateUserSettings(
            userId,
            updateParams,
          );
        },
      }),

      setQuietHours: tool({
        description:
          'Set quiet hours when the user doesn\'t want to receive notifications. Use this when the user wants to configure do-not-disturb times. Examples: "set quiet hours from 10pm to 7am", "don\'t disturb me between 11pm and 8am", "turn on quiet hours".',
        inputSchema: z.object({
          enabled: z.boolean().describe("Enable or disable quiet hours"),
          startTime: z
            .string()
            .optional()
            .describe('Start time in HH:MM format (e.g., "22:00")'),
          endTime: z
            .string()
            .optional()
            .describe('End time in HH:MM format (e.g., "07:00")'),
          days: z
            .array(z.string())
            .optional()
            .describe('Days of week (e.g., ["monday", "tuesday"])'),
        }),
        execute: async (params) => {
          return await this.userService.setQuietHours(
            userId,
            params.enabled,
            params.startTime || "22:00",
            params.endTime || "07:00",
            params.days,
          );
        },
      }),

      // Memory Tools (Supermemory)
      ...memoryTools.getTools(),
    };
  }
}
