import { UserService } from "./user-service";
import { ReminderService } from "./reminder-service";
import { ListService } from "./list-service";
import { UtilityService } from "./utility-service";
import { NotesService } from "./notes-service";
import { NotificationService } from "./notification-service";
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
  private notesService: NotesService;
  private notificationService: NotificationService;

  constructor() {
    this.userService = new UserService();
    this.reminderService = new ReminderService();
    this.listService = new ListService();
    this.utilityService = new UtilityService();
    this.notesService = new NotesService();
    this.notificationService = new NotificationService();
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
      getCurrentTime: {
        description: "Get the current time in the user's timezone",
        parameters: {
          timezone: "string",
        },
        handler: this.utilityService.getCurrentTime.bind(this.utilityService),
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

  // Get notes service for direct access
  getNotesService() {
    return this.notesService;
  }

  // Get AI SDK compatible tools for tool calling
  getAISDKTools(userId: string) {
    // Define schemas separately to ensure they're properly initialized
    const createReminderSchema = z.object({
      title: z.string().describe("The reminder title/description"),
      reminderTime: z
        .string()
        .optional()
        .describe(
          'ISO 8601 datetime string when the reminder should trigger. Optional if naturalTimeText is provided.',
        ),
      naturalTimeText: z
        .string()
        .optional()
        .describe(
          'Natural language time description (e.g., "tomorrow at 3pm", "in 30 minutes", "next Monday 9am"). Server will parse this using user timezone.',
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
    logInfo("JSON Schema:", {
      jsonSchema: JSON.stringify(jsonSchema, null, 2),
    });

    // Per-request de-duplication for identical tool calls
    const resultCache = new Map<string, any>();
    const pendingCache = new Map<string, Promise<any>>();
    // Per-request execution stats
    const stats: any = { executed: false, names: [] as string[], counts: {} as Record<string, number> };
    const normalize = (value: any): any => {
      if (Array.isArray(value)) return value.map(normalize);
      if (value && typeof value === "object") {
        const out: any = {};
        for (const k of Object.keys(value).sort()) out[k] = normalize(value[k]);
        return out;
      }
      return value;
    };
    const canonicalizeForKey = (name: string, params: any) => {
      const p = normalize(params || {});
      try {
        if (name === "createReminder" && p) {
          if (typeof p.title === "string") {
            p.title = p.title.trim().toLowerCase();
          }
          if (p.reminderTime) {
            const d = new Date(p.reminderTime);
            if (!isNaN(d.getTime())) {
              const bucket = Math.floor(d.getTime() / 60000) * 60000; // floor to minute
              p.reminderTime = new Date(bucket).toISOString();
            }
          }
        }
      } catch {}
      return p;
    };
    const buildKey = (name: string, params: any) =>
      `${name}:${JSON.stringify(canonicalizeForKey(name, params))}`;
    const dedupe = <T,>(name: string, fn: (params: any) => Promise<T>) => {
      return async (params: any): Promise<T> => {
        const key = buildKey(name, params);
        // mark stats on attempt; concrete execution may reuse cached
        stats.executed = true;
        stats.names.push(name);
        stats.counts[name] = (stats.counts[name] || 0) + 1;
        if (resultCache.has(key)) {
          logInfo(`Dedup hit for tool: ${name}`);
          return resultCache.get(key) as T;
        }
        if (pendingCache.has(key)) {
          logInfo(`Dedup pending hit for tool: ${name}`);
          return (await pendingCache.get(key)!) as T;
        }
        const p = (async () => {
          try {
            const res = await fn(params);
            resultCache.set(key, res);
            return res;
          } catch (error: any) {
            // Return error as structured response so AI can see it
            const errorResponse = {
              success: false,
              error: true,
              message: error.message || "Operation failed",
              errorCode: error.code || "UNKNOWN_ERROR",
              details: error.statusCode ? `Status: ${error.statusCode}` : undefined,
            } as any;
            
            logError(`Tool ${name} failed`, error, { params });
            
            // Cache the error response to prevent retries
            resultCache.set(key, errorResponse);
            return errorResponse;
          } finally {
            pendingCache.delete(key);
          }
        })();
        pendingCache.set(key, p);
        return (await p) as T;
      };
    };

    const toolsObj = {
      createReminder: tool({
        description:
          'Create a new reminder for the user at a specific date and time. Use this when the user wants to be reminded about something in the future. Trigger phrases: "remind me", "set a reminder", "don\'t let me forget", "alert me", "notify me when", "schedule a reminder". For one-time reminders, set isRecurring=false. For recurring reminders (daily, weekly, monthly, etc.), set isRecurring=true and provide recurrenceRule. Examples: "remind me to call mom tomorrow at 3pm", "set a daily reminder to take medicine at 9am", "remind me every Monday at 10am for team meeting".',
        inputSchema: createReminderSchema,
        execute: dedupe("createReminder", async (params) => {
          // Fetch user's timezone
          const settings = await this.userService.getUserSettings(userId);
          const tz = settings?.timezone || "UTC";
          
          // Server-side time parsing (single source of truth)
          let finalTime = params.reminderTime;
          
          // If naturalTimeText is provided or reminderTime is invalid, parse it
          if (params.naturalTimeText || !finalTime) {
            const textToParse = params.naturalTimeText || params.reminderTime || "";
            const parsed = this.utilityService.parseNaturalLanguageDate({
              text: textToParse,
              timezone: tz,
            });
            
            if (parsed.success && parsed.extractedDates.length > 0) {
              // Pick best date (highest confidence, soonest future)
              const bestDate = this.utilityService.pickBestDate(parsed.extractedDates);
              if (bestDate) {
                finalTime = bestDate;
              }
            }
          }
          
          // Validate we have a time
          if (!finalTime) {
            throw new Error("Could not determine reminder time. Please specify a valid date/time.");
          }
          
          // Ensure future time
          const parsedDate = new Date(finalTime);
          if (isNaN(parsedDate.getTime())) {
            throw new Error("Invalid reminder time format.");
          }
          
          if (parsedDate.getTime() <= Date.now()) {
            // Roll forward to tomorrow at same time
            finalTime = this.utilityService.ensureFuture(finalTime);
          }
          
          // Normalize title
          const normalizedTitle = params.title.trim().replace(/\s+/g, " ");
          if (!normalizedTitle) {
            throw new Error("Reminder title cannot be empty.");
          }
          
          return await this.reminderService.createReminder({
            userId,
            title: normalizedTitle,
            reminderTime: finalTime,
            timezone: tz,
            isRecurring: params.isRecurring ?? false,
            recurrenceRule: params.recurrenceRule,
            notes: params.notes,
            priority: params.priority,
          });
        }),
      }),

      updateReminder: tool({
        description:
          'Modify an existing reminder\'s time, title, notes, or priority. Use this when the user wants to change, edit, reschedule, or update a reminder they already created. Trigger phrases: "change", "update", "modify", "edit", "reschedule", "move", "shift". Examples: "change my dentist reminder to 4pm", "update the meeting reminder to tomorrow", "make the call reminder high priority", "move my workout reminder to 7am", "reschedule the interview to next week".',
        inputSchema: z.object({
          searchQuery: z.string().describe("Text to search for the reminder"),
          title: z.string().optional().describe("New title for the reminder"),
          reminderTime: z.string().optional().describe("New ISO 8601 datetime"),
          naturalTimeText: z.string().optional().describe("Natural language time for update"),
          priority: z
            .enum(["low", "medium", "high"])
            .optional()
            .describe("New priority"),
        }),
        execute: dedupe("updateReminder", async (params) => {
          // Fetch user's timezone
          const settings = await this.userService.getUserSettings(userId);
          const tz = settings?.timezone || "UTC";
          
          // Search for the reminder - allow up to 5 results for disambiguation
          const searchResult = await this.reminderService.searchReminders({
            userId,
            query: params.searchQuery,
            limit: 5,
          });

          if (searchResult.results.length === 0) {
            throw new Error("Could not find any reminders matching that description.");
          }
          
          // Disambiguation: if multiple results, return them for user selection
          if (searchResult.results.length > 1) {
            return {
              needsSelection: true,
              message: "I found multiple reminders. Which one did you mean?",
              candidates: searchResult.results.map((r: any, idx: number) => ({
                id: r.id,
                number: idx + 1,
                title: r.title,
                time: r.reminderTime,
                type: "reminder",
              })),
            };
          }
          
          // Server-side time parsing if needed
          let finalTime = params.reminderTime;
          if (params.naturalTimeText || (params.reminderTime && isNaN(new Date(params.reminderTime).getTime()))) {
            const textToParse = params.naturalTimeText || params.reminderTime || "";
            const parsed = this.utilityService.parseNaturalLanguageDate({
              text: textToParse,
              timezone: tz,
            });
            
            if (parsed.success && parsed.extractedDates.length > 0) {
              finalTime = this.utilityService.pickBestDate(parsed.extractedDates) || finalTime;
            }
          }
          
          // Ensure future time if updating time
          if (finalTime) {
            const parsedDate = new Date(finalTime);
            if (parsedDate.getTime() <= Date.now()) {
              finalTime = this.utilityService.ensureFuture(finalTime);
            }
          }
          
          // Normalize title if provided
          const normalizedTitle = params.title ? params.title.trim().replace(/\s+/g, " ") : undefined;
          
          // Check for meaningful update
          if (!normalizedTitle && !finalTime && !params.priority) {
            throw new Error("Please specify what you want to update (title, time, or priority).");
          }

          // Update the reminder
          return await this.reminderService.updateReminder({
            userId,
            reminderId: searchResult.results[0].id,
            title: normalizedTitle,
            reminderTime: finalTime,
            timezone: tz,
            priority: params.priority,
          });
        }),
      }),

      deleteReminder: tool({
        description:
          'Permanently delete or cancel a reminder. Use this when the user no longer needs a reminder and wants to remove it completely from the system. Trigger phrases: "delete", "remove", "cancel", "get rid of", "clear", "erase". Examples: "delete my dentist reminder", "cancel the meeting reminder", "remove the reminder about calling John", "get rid of all reminders for tomorrow", "clear my workout reminder".',
        inputSchema: z.object({
          searchQuery: z
            .string()
            .describe("Text to search for the reminder to delete"),
        }),
        execute: dedupe("deleteReminder", async (params) => {
          // Search with limit for disambiguation
          const searchResult = await this.reminderService.searchReminders({
            userId,
            query: params.searchQuery,
            limit: 5,
          });

          if (searchResult.results.length === 0) {
            throw new Error("Could not find any reminders matching that description.");
          }
          
          // Disambiguation: if multiple results, return them for user selection
          if (searchResult.results.length > 1) {
            return {
              needsSelection: true,
              message: "I found multiple reminders. Which one do you want to delete?",
              candidates: searchResult.results.map((r: any, idx: number) => ({
                id: r.id,
                number: idx + 1,
                title: r.title,
                time: r.reminderTime,
                type: "reminder",
              })),
            };
          }
          
          const reminder = searchResult.results[0];
          
          // Confirmation for recurring reminders
          if (reminder.isRecurring) {
            return {
              needsConfirmation: true,
              message: `This is a recurring reminder ("${reminder.title}"). Are you sure you want to delete it? Reply 'yes' to confirm.`,
              action: "deleteReminder",
              targetId: reminder.id,
              summary: `Delete recurring reminder: ${reminder.title}`,
            };
          }

          return await this.reminderService.deleteReminder({
            userId,
            reminderId: reminder.id,
          });
        }),
      }),

      listReminders: tool({
        description:
          'Display a list of the user\'s reminders with optional filtering by status (pending/completed/all), date range, and sorting. Use this when the user wants to view, see, or check their reminders without a specific search query. Trigger phrases: "list", "show", "display", "what reminders", "my reminders", "all reminders". Examples: "show me my reminders", "list all my pending reminders", "what reminders do I have?", "display completed reminders", "show me all reminders for next week".',
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
        execute: dedupe("listReminders", async (params) => {
          return await this.reminderService.listReminders({
            userId,
            status: params.status || "pending",
            limit: params.limit || 10,
            sortBy: "time",
          });
        }),
      }),

      completeReminder: tool({
        description:
          'Mark a reminder as completed or done. Use this when the user has finished the task associated with a reminder and wants to mark it as complete. This does NOT delete the reminder, just changes its status to completed. Trigger phrases: "mark as done", "complete", "finished", "completed", "mark as complete", "done with", "I did". Examples: "mark the dentist reminder as done", "complete the meeting reminder", "I finished calling John", "done with my workout reminder", "completed the grocery shopping reminder".',
        inputSchema: z.object({
          searchQuery: z
            .string()
            .describe("Text to search for the reminder to complete"),
        }),
        execute: dedupe("completeReminder", async (params) => {
          const searchResult = await this.reminderService.searchReminders({
            userId,
            query: params.searchQuery,
            limit: 1,
          });

          if (searchResult.results.length === 0) {
            throw new Error("Could not find that reminder");
          }

          return await this.reminderService.completeReminder({
            userId,
            reminderId: searchResult.results[0].id,
          });
        }),
      }),

      createList: tool({
        description:
          'Create a new named list (shopping list, todo list, task list, etc.). Use this when the user explicitly wants to create a new list container. Trigger phrases: "create a list", "make a list", "start a list", "new list". Examples: "create a shopping list", "make a list called groceries", "start a new todo list", "create a vacation packing list", "make a work tasks list".',
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
        execute: dedupe("createList", async (params) => {
          return await this.listService.createList({
            userId,
            ...params,
          });
        }),
      }),

      addItemToList: tool({
        description:
          'Add one or more items to an existing list. If the list doesn\'t exist, it will be created automatically. Use this when the user wants to add, put, or append items to a list. Maximum 50 items per call - if user provides more, split into multiple calls. Trigger phrases: "add to", "put on", "add [item] to [list]", "include in". Examples: "add milk to my shopping list", "add buy groceries to my todo list", "put eggs and bread on the shopping list", "add workout to my daily tasks", "include meeting notes in my work list".',
        inputSchema: z.object({
          listName: z.string().describe("Name of the list"),
          items: z.array(z.string()).describe("Items to add to the list (max 50)"),
        }),
        execute: dedupe("addItemToList", async (params) => {
          // Handle batch splitting automatically if more than 50 items
          if (params.items.length > 50) {
            const batches = [];
            for (let i = 0; i < params.items.length; i += 50) {
              batches.push(params.items.slice(i, i + 50));
            }
            
            let totalAdded = 0;
            let errors = [];
            
            for (let i = 0; i < batches.length; i++) {
              try {
                const result = await this.listService.addItemToList({
                  userId,
                  listName: params.listName,
                  items: batches[i],
                });
                totalAdded += result.addedCount || batches[i].length;
              } catch (error: any) {
                // If first batch and list doesn't exist, try creating it
                if (i === 0 && error.code === "LIST_NOT_FOUND") {
                  try {
                    const createResult = await this.listService.createList({
                      userId,
                      name: params.listName,
                      items: batches[i],
                    });
                    totalAdded += batches[i].length;
                  } catch (createError: any) {
                    errors.push(`Batch ${i + 1}: ${createError.message}`);
                  }
                } else {
                  errors.push(`Batch ${i + 1}: ${error.message}`);
                }
              }
            }
            
            return {
              success: errors.length === 0,
              addedCount: totalAdded,
              totalItems: params.items.length,
              batches: batches.length,
              message: errors.length > 0 
                ? `Added ${totalAdded} of ${params.items.length} items. Errors: ${errors.join("; ")}`
                : `Successfully added all ${totalAdded} items in ${batches.length} batches.`,
              errors: errors.length > 0 ? errors : undefined,
            };
          }
          
          // Normal flow for <= 50 items
          try {
            return await this.listService.addItemToList({
              userId,
              listName: params.listName,
              items: params.items,
            });
          } catch (error: any) {
            // List doesn't exist, create it
            if (error.code === "LIST_NOT_FOUND" || error.message?.includes("not found")) {
              return await this.listService.createList({
                userId,
                name: params.listName,
                items: params.items,
              });
            }
            throw error;
          }
        }),
      }),

      getLists: tool({
        description:
          'Display all lists the user has created. Use this when the user wants to see an overview of all their lists (shopping lists, todo lists, etc.). Trigger phrases: "show my lists", "what lists", "all lists", "list my lists", "display lists". Examples: "show me my lists", "what lists do I have?", "list all my lists", "display all my lists", "what lists have I created?".',
        inputSchema: z.object({
          includeItems: z
            .boolean()
            .optional()
            .describe("Whether to include list items"),
        }),
        execute: dedupe("getLists", async (params) => {
          return await this.listService.getLists({
            userId,
            includeItems: params.includeItems ?? true,
            limit: 20,
          });
        }),
      }),

      searchReminders: tool({
        description:
          'Search and find reminders by keyword, title, or content. Use this when the user wants to find specific reminders using a search term or phrase. Trigger phrases: "find", "search", "look for", "where is", "do I have a reminder about". Examples: "find my dentist reminder", "search for reminders about John", "look for meeting reminders", "do I have a reminder about groceries?", "search for all work-related reminders".',
        inputSchema: z.object({
          query: z.string().describe("Search query"),
          limit: z.number().optional().describe("Maximum results"),
          includeCompleted: z
            .boolean()
            .optional()
            .describe("Whether to include completed reminders"),
        }),
        execute: dedupe("searchReminders", async (params) => {
          return await this.reminderService.searchReminders({
            userId,
            query: params.query,
            limit: params.limit || 10,
          });
        }),
      }),

      snoozeReminder: tool({
        description:
          'Postpone or delay a reminder to a later time or date. Use this when the user wants to temporarily push back a reminder without deleting it. The reminder will trigger again at the new time. Trigger phrases: "snooze", "postpone", "delay", "push back", "remind me later", "move it to". Examples: "snooze my alarm for 10 minutes", "postpone the meeting reminder to 3pm", "delay the dentist reminder until tomorrow", "remind me about this in 2 hours", "push back my workout to 7pm".',
        inputSchema: z.object({
          searchQuery: z
            .string()
            .describe("Text to search for the reminder to snooze"),
          snoozeUntil: z
            .string()
            .optional()
            .describe("ISO 8601 datetime when the reminder should trigger after snoozing"),
          naturalTimeText: z
            .string()
            .optional()
            .describe('Natural language time (e.g., "in 10 minutes", "tomorrow 3pm")'),
        }),
        execute: dedupe("snoozeReminder", async (params) => {
          // Fetch user's timezone
          const settings = await this.userService.getUserSettings(userId);
          const tz = settings?.timezone || "UTC";
          
          // Search with disambiguation
          const searchResult = await this.reminderService.searchReminders({
            userId,
            query: params.searchQuery,
            limit: 5,
          });

          if (searchResult.results.length === 0) {
            throw new Error("Could not find any reminders matching that description.");
          }
          
          // Disambiguation
          if (searchResult.results.length > 1) {
            return {
              needsSelection: true,
              message: "I found multiple reminders. Which one do you want to snooze?",
              candidates: searchResult.results.map((r: any, idx: number) => ({
                id: r.id,
                number: idx + 1,
                title: r.title,
                time: r.reminderTime,
                type: "reminder",
              })),
            };
          }
          
          // Server-side time parsing
          let finalTime = params.snoozeUntil;
          if (params.naturalTimeText || !finalTime) {
            const textToParse = params.naturalTimeText || params.snoozeUntil || "";
            const parsed = this.utilityService.parseNaturalLanguageDate({
              text: textToParse,
              timezone: tz,
            });
            
            if (parsed.success && parsed.extractedDates.length > 0) {
              finalTime = this.utilityService.pickBestDate(parsed.extractedDates) || finalTime;
            }
          }
          
          if (!finalTime) {
            throw new Error("Please specify when to snooze until (e.g., 'in 10 minutes', 'tomorrow 3pm').");
          }
          
          // Ensure future time
          const parsedDate = new Date(finalTime);
          if (parsedDate.getTime() <= Date.now()) {
            throw new Error("Snooze time must be in the future.");
          }

          return await this.reminderService.snoozeReminder({
            userId,
            reminderId: searchResult.results[0].id,
            snoozeUntil: finalTime,
            timezone: tz,
          });
        }),
      }),

      getUpcomingReminders: tool({
        description:
          'Retrieve reminders scheduled for a specific upcoming timeframe: today, tomorrow, this week, or this month. Use this when the user asks about future reminders within a defined time period. Trigger phrases: "what\'s coming up", "upcoming", "what do I have", "reminders for", "what\'s scheduled", "what\'s next". Examples: "what reminders do I have today?", "show me tomorrow\'s reminders", "what\'s coming up this week?", "reminders for this month", "what do I have scheduled today?".',
        inputSchema: z.object({
          timeframe: z
            .enum(["today", "tomorrow", "week", "month"])
            .describe("The timeframe to get reminders for"),
          limit: z
            .number()
            .optional()
            .describe("Maximum number of reminders to return"),
        }),
        execute: dedupe("getUpcomingReminders", async (params) => {
          return await this.reminderService.getUpcomingReminders({
            userId,
            timeframe: params.timeframe,
            limit: params.limit || 10,
          });
        }),
      }),

      batchCreateReminders: tool({
        description:
          'Create multiple reminders in a single operation. Use this when the user provides a list of multiple tasks or events they want to be reminded about. This is more efficient than creating reminders one by one. Trigger phrases: "remind me to [list of things]", "set reminders for", "create reminders for", "I need reminders for". Examples: "remind me to call mom, buy groceries, and pay bills", "set reminders for my meetings tomorrow at 10am, 2pm, and 4pm", "create reminders for all my tasks: workout, study, cook dinner".',
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
        execute: dedupe("batchCreateReminders", async (params) => {
          return await this.reminderService.batchCreateReminders({
            userId,
            reminders: params.reminders,
          });
        }),
      }),

      getListItems: tool({
        description:
          'Display all items within a specific named list. Use this when the user wants to see the contents or items of a particular list. Trigger phrases: "show [list name]", "what\'s on", "what\'s in", "display [list]", "view [list]". Examples: "show me my shopping list", "what\'s on my todo list?", "display the groceries list", "what\'s in my work tasks?", "view my vacation packing list".',
        inputSchema: z.object({
          listName: z.string().describe("Name of the list to get items from"),
          includeCompleted: z
            .boolean()
            .optional()
            .describe("Whether to include completed items"),
        }),
        execute: dedupe("getListItems", async (params) => {
          return await this.listService.getListItems({
            userId,
            listName: params.listName,
            includeCompleted: params.includeCompleted ?? false,
          });
        }),
      }),

      removeItemFromList: tool({
        description:
          'Delete or remove specific items from a list. Use this when the user wants to take items off a list (e.g., after buying them or completing them). Trigger phrases: "remove", "delete", "take off", "remove [item] from [list]", "delete [item]". Examples: "remove milk from my shopping list", "delete eggs from the groceries list", "take bread off the shopping list", "remove workout from my todo list", "delete completed items".',
        inputSchema: z.object({
          listName: z.string().describe("Name of the list"),
          itemText: z
            .string()
            .describe("Text to search for in items to remove"),
        }),
        execute: dedupe("removeItemFromList", async (params) => {
          return await this.listService.removeItemFromList({
            userId,
            listName: params.listName,
            itemText: params.itemText,
          });
        }),
      }),

      updateListItem: tool({
        description:
          'Modify a list item: mark it as completed/uncompleted, change its content, or reorder it. Use this when the user wants to check off, update, or edit an item within a list. Trigger phrases: "mark as done", "check off", "complete", "mark as complete", "update [item]", "change [item]". Examples: "mark milk as done", "check off eggs from the list", "complete buy groceries", "mark workout as complete", "update meeting notes to include agenda".',
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
        execute: dedupe("updateListItem", async (params) => {
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
        }),
      }),

      deleteList: tool({
        description:
          'Permanently delete an entire list and all its items. Use this when the user wants to remove a complete list, not just individual items. Trigger phrases: "delete [list]", "remove [list]", "get rid of [list]", "clear [list]". Examples: "delete my shopping list", "remove the groceries list", "get rid of my todo list", "delete the vacation packing list", "clear my work tasks list".',
        inputSchema: z.object({
          listName: z.string().describe("Name of the list to delete"),
        }),
        execute: dedupe("deleteList", async (params) => {
          return await this.listService.deleteList({
            userId,
            listName: params.listName,
          });
        }),
      }),

      searchLists: tool({
        description:
          'Search across all lists and their items to find specific content. Use this when the user wants to locate a list or item but doesn\'t remember which list it\'s in. Trigger phrases: "find", "search", "where is", "look for", "do I have". Examples: "find milk in my lists", "search for eggs", "where is buy groceries?", "do I have bread on any list?", "look for workout in my lists".',
        inputSchema: z.object({
          query: z.string().describe("Search query"),
          searchIn: z
            .enum(["list-names", "items", "both"])
            .optional()
            .describe("Where to search"),
          limit: z.number().optional().describe("Maximum results"),
        }),
        execute: dedupe("searchLists", async (params) => {
          return await this.listService.searchLists({
            userId,
            query: params.query,
            searchIn: params.searchIn || "both",
            limit: params.limit || 20,
          });
        }),
      }),

      getUserSettings: tool({
        description:
          'Retrieve the user\'s profile and configuration settings including name, timezone, language, notification preferences, and quiet hours. Use this when the user wants to view or check their personal information or settings. Trigger phrases: "my settings", "what are my settings", "show settings", "my preferences", "what\'s my timezone", "what\'s my name", "who am I", "what\'s my phone number", "what\'s my configuration". Examples: "what are my settings?", "what\'s my timezone?", "show my preferences", "what\'s my current language?", "display my notification settings", "what\'s my name?".',
        inputSchema: z.object({}),
        execute: dedupe("getUserSettings", async () => {
          return await this.userService.getUserSettings(userId);
        }),
      }),

      updateUserSettings: tool({
        description:
          'Modify user configuration settings such as timezone, language, or notification preferences. Use this when the user wants to change, update, or configure their settings. Trigger phrases: "change", "set", "update", "configure", "switch", "turn on/off". Examples: "change my timezone to EST", "set my language to Spanish", "turn off notifications", "update my timezone to Asia/Kolkata", "switch language to French", "enable notifications".',
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
        execute: dedupe("updateUserSettings", async (params) => {
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
        }),
      }),

      setQuietHours: tool({
        description:
          'Configure do-not-disturb time windows when the user doesn\'t want to receive reminder notifications. Use this when the user wants to set, enable, disable, or modify quiet hours. Trigger phrases: "quiet hours", "do not disturb", "don\'t disturb", "DND", "silent hours", "no notifications". Examples: "set quiet hours from 10pm to 7am", "don\'t disturb me between 11pm and 8am", "turn on quiet hours", "enable do not disturb from 9pm to 6am", "disable quiet hours", "set DND for weekends".',
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
        execute: dedupe("setQuietHours", async (params) => {
          return await this.userService.setQuietHours(
            userId,
            params.enabled,
            params.startTime || "22:00",
            params.endTime || "07:00",
            params.days,
          );
        }),
      }),

      getCurrentTime: tool({
        description:
          'Get the current date and time in the user\'s timezone. Use this when the user asks for the current time, date, or "what time is it now?". Trigger phrases: "what time is it", "current time", "what\'s the time", "time now", "what date is it", "today\'s date". Examples: "what time is it?", "what\'s the current time?", "what date is it today?".',
        inputSchema: z.object({}),
        execute: dedupe("getCurrentTime", async () => {
          // Fetch user's timezone automatically
          const settings = await this.userService.getUserSettings(userId);
          const tz = settings?.timezone || "UTC";

          return await this.utilityService.getCurrentTime({
            timezone: tz,
          });
        }),
      }),

      // Notes/Memory Management
      createNote: tool({
        description:
          'Save and remember arbitrary information, facts, or notes for the user. Use this when the user wants to store information for later retrieval, such as personal details, important facts, project IDs, locations of items, or any other information they want to remember. Trigger phrases: "remember", "note", "save", "store", "keep track", "write down", "take a note". Examples: "remember that I kept my wallet in second shelf", "take a note of my Project ID: 22987AC", "note that my favorite restaurant is XYZ", "remember my car license plate is ABC123", "save this information for later".',
        inputSchema: z.object({
          content: z
            .string()
            .describe("The information/note content to remember"),
          title: z.string().optional().describe("Optional title for the note"),
          category: z
            .string()
            .optional()
            .describe("Category like 'personal', 'work', 'general'"),
          tags: z
            .array(z.string())
            .optional()
            .describe("Optional tags for organization"),
          isPinned: z.boolean().optional().describe("Mark as important/pinned"),
        }),
        execute: dedupe("createNote", async (params) => {
          return await this.notesService.createNote({
            userId,
            content: params.content,
            title: params.title,
            category: params.category || "general",
            tags: params.tags,
            isPinned: params.isPinned || false,
          });
        }),
      }),

      searchNotes: tool({
        description:
          'Search through saved notes and memories to find specific information. Use this when the user is looking for something they previously asked you to remember or when they want to find specific notes. Trigger phrases: "what did I", "find my note", "search", "look for", "do you remember", "what was", "where did I". Examples: "what did I say about my wallet?", "find my note about the project ID", "search for restaurant information", "do you remember where I kept my keys?", "what was my license plate number?".',
        inputSchema: z.object({
          query: z.string().describe("Search query to find in notes"),
          category: z.string().optional().describe("Filter by category"),
          tags: z.array(z.string()).optional().describe("Filter by tags"),
          limit: z.number().optional().describe("Maximum results to return"),
        }),
        execute: dedupe("searchNotes", async (params) => {
          return await this.notesService.searchNotes({
            userId,
            query: params.query,
            category: params.category,
            tags: params.tags,
            limit: Math.min(params.limit || 5, 10), // Cap at 10 for performance
            includeArchived: false,
          });
        }),
      }),

      listNotes: tool({
        description:
          'Display all saved notes and memories. Use this when the user wants to see all their stored information or get an overview of what they have saved. Trigger phrases: "show my notes", "list my memories", "what have I saved", "all my notes", "my stored information". Examples: "show me all my notes", "list everything I\'ve saved", "what information do I have stored?", "display all my memories".',
        inputSchema: z.object({
          category: z.string().optional().describe("Filter by category"),
          tags: z.array(z.string()).optional().describe("Filter by tags"),
          onlyPinned: z
            .boolean()
            .optional()
            .describe("Show only pinned/important notes"),
          limit: z.number().optional().describe("Maximum results to return"),
        }),
        execute: dedupe("listNotes", async (params) => {
          return await this.notesService.listNotes({
            userId,
            category: params.category,
            tags: params.tags,
            onlyPinned: params.onlyPinned || false,
            limit: Math.min(params.limit || 10, 15), // Cap at 15 for WhatsApp limits
            includeArchived: false,
            sortBy: "created",
            sortOrder: "desc",
          });
        }),
      }),

      updateNote: tool({
        description:
          'Update or modify an existing note/memory. Use this when the user wants to change, edit, or update information they previously saved. Trigger phrases: "update", "change", "modify", "edit", "correct". Examples: "update my project ID note", "change the wallet location", "modify my restaurant note", "edit that information", "correct my license plate number".',
        inputSchema: z.object({
          searchQuery: z
            .string()
            .describe("Text to search for the note to update"),
          content: z.string().optional().describe("New content for the note"),
          title: z.string().optional().describe("New title for the note"),
          category: z.string().optional().describe("New category"),
          tags: z.array(z.string()).optional().describe("New tags"),
          isPinned: z.boolean().optional().describe("Mark as pinned/unpinned"),
        }),
        execute: dedupe("updateNote", async (params) => {
          // First search for the note
          const searchResult = await this.notesService.searchNotes({
            userId,
            query: params.searchQuery,
            limit: 1,
            includeArchived: false,
          });

          if (searchResult.notes.length === 0) {
            throw new Error("Could not find that note");
          }

          // Update the note
          return await this.notesService.updateNote({
            userId,
            noteId: searchResult.notes[0].id,
            content: params.content,
            title: params.title,
            category: params.category,
            tags: params.tags,
            isPinned: params.isPinned,
          });
        }),
      }),

      deleteNote: tool({
        description:
          'Delete a saved note or memory permanently. Use this when the user no longer needs certain information and wants to remove it. Trigger phrases: "delete", "remove", "forget", "get rid of", "clear". Examples: "delete my wallet note", "remove the project ID information", "forget about the restaurant", "get rid of that note", "clear my license plate info".',
        inputSchema: z.object({
          searchQuery: z
            .string()
            .describe("Text to search for the note to delete"),
        }),
        execute: dedupe("deleteNote", async (params) => {
          // First search for the note
          const searchResult = await this.notesService.searchNotes({
            userId,
            query: params.searchQuery,
            limit: 1,
            includeArchived: false,
          });

          if (searchResult.notes.length === 0) {
            throw new Error("Could not find that note");
          }

          // Delete the note
          return await this.notesService.deleteNote(
            userId,
            searchResult.notes[0].id,
          );
        }),
      }),

      // ---------------- Notification & Communication ----------------
      sendReminderToContact: tool({
        description:
          'Send a reminder to a specific contact number at a specific time. Use when the user asks to remind someone else. Example: "remind +15551234567 to pay rent tomorrow 10am".',
        inputSchema: z.object({
          recipientNumber: z
            .string()
            .regex(/^\+?[1-9]\d{1,14}$/)
            .describe('E.164 phone number, e.g. "+15551234567"'),
          recipientName: z
            .string()
            .optional()
            .describe("Optional display name for recipient"),
          reminderText: z
            .string()
            .min(1)
            .max(1000)
            .describe("Reminder text to send"),
          reminderTime: z
            .string()
            .min(1)
            .describe(
              "ISO 8601 datetime or natural language time (e.g., 'tomorrow 10am')",
            ),
          fromUserName: z
            .string()
            .optional()
            .describe("Optional sender name to include"),
        }),
        execute: dedupe("sendReminderToContact", async (params) => {
          // Normalize time: if not valid ISO, parse using user's timezone
          const settings = await this.userService.getUserSettings(userId);
          const tz = settings?.timezone || "UTC";
          let iso = params.reminderTime;
          const asDate = new Date(iso);
          if (isNaN(asDate.getTime())) {
            const parsed = await this.utilityService.parseNaturalLanguageDate({
              text: params.reminderTime,
              timezone: tz,
            });
            if (!parsed.success || parsed.extractedDates.length === 0) {
              throw new Error("Could not parse reminder time");
            }
            iso = parsed.extractedDates[0].parsedDate;
          }

          // Ensure future time; if within past 24h, roll forward 24h
          let whenMs = new Date(iso).getTime();
          const nowMs = Date.now();
          if (whenMs <= nowMs && nowMs - whenMs < 24 * 60 * 60 * 1000) {
            whenMs += 24 * 60 * 60 * 1000;
            iso = new Date(whenMs).toISOString();
          }
          if (whenMs <= nowMs) {
            throw new Error("Reminder time must be in the future");
          }

          return await this.notificationService.sendReminderToContact({
            senderUserId: userId,
            recipientNumber: params.recipientNumber,
            recipientName: params.recipientName,
            reminderText: params.reminderText,
            reminderTime: iso,
            fromUserName: params.fromUserName,
          });
        }),
      }),

      getNotificationHistory: tool({
        description:
          'Retrieve previously sent notifications. Use when the user asks to see notification history. Example: "show my notification history".',
        inputSchema: z.object({
          limit: z
            .number()
            .optional()
            .describe("Max results (default 20, max 100)"),
          offset: z.number().optional().describe("Offset for pagination"),
          type: z
            .enum(["reminder", "shared", "all"])
            .optional()
            .describe("Filter by type"),
        }),
        execute: dedupe("getNotificationHistory", async (params) => {
          const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
          const offset = Math.max(params.offset ?? 0, 0);
          return await this.notificationService.getNotificationHistory({
            userId,
            limit,
            offset,
            type: params.type,
          });
        }),
      }),

      sendCustomMessage: tool({
        description:
          "Send a custom WhatsApp message to the current user. Use when the assistant needs to push a formatted message back to the user.",
        inputSchema: z.object({
          message: z.string().describe("Message text"),
          formatting: z.enum(["plain", "markdown"]).optional(),
          buttons: z
            .array(z.object({ id: z.string(), label: z.string() }))
            .optional(),
        }),
        execute: dedupe("sendCustomMessage", async (params) => {
          return await this.notificationService.sendCustomMessage(userId, {
            message: params.message,
            formatting: params.formatting,
            buttons: params.buttons,
          });
        }),
      }),
    };
    (toolsObj as any).__stats = stats;
    return toolsObj;
  }

  /**
   * Get a restricted subset of tools based on detected intent
   * This prevents the model from hallucinating or using wrong tools
   */
  getAISDKToolsSubset(userId: string, intent: string): any {
    const allTools = this.getAISDKTools(userId);
    
    // Intent-to-tools mapping
    const intentToolMap: Record<string, string[]> = {
      createReminder: ["createReminder", "parseNaturalLanguageDate", "getUserSettings"],
      updateReminder: ["updateReminder", "searchReminders", "parseNaturalLanguageDate", "getUserSettings"],
      deleteReminder: ["deleteReminder", "searchReminders", "getUserSettings"],
      completeReminder: ["completeReminder", "searchReminders", "getUserSettings"],
      snoozeReminder: ["snoozeReminder", "searchReminders", "parseNaturalLanguageDate", "getUserSettings"],
      listReminders: ["listReminders", "getUserSettings"],
      searchReminders: ["searchReminders", "getUserSettings"],
      getUpcomingReminders: ["getUpcomingReminders", "getUserSettings"],
      batchCreateReminders: ["batchCreateReminders", "parseNaturalLanguageDate", "getUserSettings"],
      
      createList: ["createList", "getUserSettings"],
      addItemToList: ["addItemToList", "getLists", "getUserSettings"],
      getLists: ["getLists", "getUserSettings"],
      getListItems: ["getListItems", "getLists", "getUserSettings"],
      deleteList: ["deleteList", "getLists", "getUserSettings"],
      searchLists: ["searchLists", "getUserSettings"],
      updateListItem: ["updateListItem", "getListItems", "getUserSettings"],
      removeItemFromList: ["removeItemFromList", "getListItems", "getUserSettings"],
      
      getUserSettings: ["getUserSettings"],
      updateUserSettings: ["updateUserSettings", "getUserSettings"],
      setQuietHours: ["setQuietHours", "getUserSettings"],
      
      createNote: ["createNote", "getUserSettings"],
      searchNotes: ["searchNotes", "getUserSettings"],
      listNotes: ["listNotes", "getUserSettings"],
      updateNote: ["updateNote", "searchNotes", "getUserSettings"],
      deleteNote: ["deleteNote", "searchNotes", "getUserSettings"],
      
      getCurrentTime: ["getCurrentTime", "getUserSettings"],
    };

    const allowedToolNames = intentToolMap[intent];
    if (!allowedToolNames) {
      // Unknown intent - return all tools
      return allTools;
    }

    // Build subset
    const subset: any = {};
    for (const toolName of allowedToolNames) {
      if (allTools[toolName]) {
        subset[toolName] = allTools[toolName];
      }
    }

    return subset;
  }
}
