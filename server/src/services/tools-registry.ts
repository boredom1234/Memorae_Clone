import { UserService } from "./user-service";
import { ReminderService } from "./reminder-service";
import { ListService } from "./list-service";
import { UtilityService } from "./utility-service";
import { NotesService } from "./notes-service";
import { NotificationService } from "./notification-service";
import { MediaAttachmentService } from "./media-attachment-service";
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
  private mediaService: MediaAttachmentService;

  constructor() {
    this.userService = new UserService();
    this.reminderService = new ReminderService();
    this.listService = new ListService();
    this.utilityService = new UtilityService();
    this.notesService = new NotesService();
    this.notificationService = new NotificationService();
    this.mediaService = new MediaAttachmentService();
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
          "ISO 8601 datetime string when the reminder should trigger. Optional if naturalTimeText is provided.",
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
    const stats: any = {
      executed: false,
      names: [] as string[],
      counts: {} as Record<string, number>,
    };
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
    const dedupe = <T>(name: string, fn: (params: any) => Promise<T>) => {
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
              details: error.statusCode
                ? `Status: ${error.statusCode}`
                : undefined,
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
          'Create reminder at specific time. Supports one-time and recurring (daily/weekly/monthly). Triggers: remind, alert, schedule, notify.',
        inputSchema: createReminderSchema,
        execute: dedupe("createReminder", async (params) => {
          // Fetch user's timezone
          const settings = await this.userService.getUserSettings(userId);
          const tz = settings?.timezone || "UTC";

          // Server-side time parsing (single source of truth)
          let finalTime = params.reminderTime;

          // If naturalTimeText is provided or reminderTime is invalid, parse it
          if (params.naturalTimeText || !finalTime) {
            const textToParse =
              params.naturalTimeText || params.reminderTime || "";
            const parsed = this.utilityService.parseNaturalLanguageDate({
              text: textToParse,
              timezone: tz,
            });

            if (parsed.success && parsed.extractedDates.length > 0) {
              // Pick best date (highest confidence, soonest future)
              const bestDate = this.utilityService.pickBestDate(
                parsed.extractedDates,
              );
              if (bestDate) {
                finalTime = bestDate;
              }
            }
          }

          // Validate we have a time
          if (!finalTime) {
            throw new Error(
              "Could not determine reminder time. Please specify a valid date/time.",
            );
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
          'Modify existing reminder (time, title, priority). Triggers: change, update, edit, reschedule, move.',
        inputSchema: z.object({
          searchQuery: z.string().describe("Text to search for the reminder"),
          title: z.string().optional().describe("New title for the reminder"),
          reminderTime: z.string().optional().describe("New ISO 8601 datetime"),
          naturalTimeText: z
            .string()
            .optional()
            .describe("Natural language time for update"),
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
            throw new Error(
              "Could not find any reminders matching that description.",
            );
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
          if (
            params.naturalTimeText ||
            (params.reminderTime &&
              isNaN(new Date(params.reminderTime).getTime()))
          ) {
            const textToParse =
              params.naturalTimeText || params.reminderTime || "";
            const parsed = this.utilityService.parseNaturalLanguageDate({
              text: textToParse,
              timezone: tz,
            });

            if (parsed.success && parsed.extractedDates.length > 0) {
              finalTime =
                this.utilityService.pickBestDate(parsed.extractedDates) ||
                finalTime;
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
          const normalizedTitle = params.title
            ? params.title.trim().replace(/\s+/g, " ")
            : undefined;

          // Check for meaningful update
          if (!normalizedTitle && !finalTime && !params.priority) {
            throw new Error(
              "Please specify what you want to update (title, time, or priority).",
            );
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
          'Delete/cancel reminder permanently. Triggers: delete, remove, cancel, clear.',
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
            throw new Error(
              "Could not find any reminders matching that description.",
            );
          }

          // Disambiguation: if multiple results, return them for user selection
          if (searchResult.results.length > 1) {
            return {
              needsSelection: true,
              message:
                "I found multiple reminders. Which one do you want to delete?",
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
          'List reminders with filters (status, date). Triggers: list, show, display, what reminders.',
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
          'Mark reminder as done (status only, not deleted). Triggers: complete, done, finished, mark as done.',
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
          'Create new list (shopping, todo, tasks). Triggers: create list, make list, new list.',
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
          'Add items to list (auto-creates if missing, max 50/call). Triggers: add to, put on, include.',
        inputSchema: z.object({
          listName: z.string().describe("Name of the list"),
          items: z
            .array(z.string())
            .describe("Items to add to the list (max 50)"),
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
              message:
                errors.length > 0
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
            if (
              error.code === "LIST_NOT_FOUND" ||
              error.message?.includes("not found")
            ) {
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
          'Show all user lists. Triggers: show lists, what lists, all lists.',
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
          'Search reminders by keyword/title. Triggers: find, search, look for, where is.',
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
          'Postpone reminder to later time. Triggers: snooze, postpone, delay, push back, later.',
        inputSchema: z.object({
          searchQuery: z
            .string()
            .describe("Text to search for the reminder to snooze"),
          snoozeUntil: z
            .string()
            .optional()
            .describe(
              "ISO 8601 datetime when the reminder should trigger after snoozing",
            ),
          naturalTimeText: z
            .string()
            .optional()
            .describe(
              'Natural language time (e.g., "in 10 minutes", "tomorrow 3pm")',
            ),
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
            throw new Error(
              "Could not find any reminders matching that description.",
            );
          }

          // Disambiguation
          if (searchResult.results.length > 1) {
            return {
              needsSelection: true,
              message:
                "I found multiple reminders. Which one do you want to snooze?",
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
            const textToParse =
              params.naturalTimeText || params.snoozeUntil || "";
            const parsed = this.utilityService.parseNaturalLanguageDate({
              text: textToParse,
              timezone: tz,
            });

            if (parsed.success && parsed.extractedDates.length > 0) {
              finalTime =
                this.utilityService.pickBestDate(parsed.extractedDates) ||
                finalTime;
            }
          }

          if (!finalTime) {
            throw new Error(
              "Please specify when to snooze until (e.g., 'in 10 minutes', 'tomorrow 3pm').",
            );
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
          'Get reminders for timeframe (today/tomorrow/week/month). Triggers: upcoming, what\'s coming, scheduled.',
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
          'Create multiple reminders at once. Triggers: remind me to [list], set reminders for.',
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
          'Show items in specific list. Triggers: show [list], what\'s on, what\'s in, view.',
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
          'Remove items from list. Triggers: remove, delete, take off.',
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
          'Update list item (complete/edit/reorder). Triggers: mark as done, check off, update, change.',
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
          'Delete entire list and items. Triggers: delete list, remove list, clear list.',
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
          'Search all lists/items. Triggers: find, search, where is, look for.',
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
          'Get user profile/settings (name, timezone, language, notifications). Triggers: my settings, who am I, my name.',
        inputSchema: z.object({}),
        execute: dedupe("getUserSettings", async () => {
          return await this.userService.getUserSettings(userId);
        }),
      }),

      updateUserSettings: tool({
        description:
          'Update settings (name, timezone, language, notifications, quiet hours). Triggers: change, set, update, configure.',
        inputSchema: z.object({
          name: z
            .string()
            .min(1)
            .max(255)
            .optional()
            .describe("User's display name"),
          timezone: z
            .string()
            .optional()
            .describe(
              'Timezone (e.g., "America/New_York", "UTC", "Asia/Kolkata")',
            ),
          language: z
            .string()
            .length(2)
            .optional()
            .describe('Language code (e.g., "en", "es", "fr")'),
          defaultReminderTime: z
            .string()
            .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
            .optional()
            .describe('Default reminder time in HH:MM format (e.g., "09:00")'),
          notificationEnabled: z
            .boolean()
            .optional()
            .describe("Enable or disable notifications"),
          advanceNoticeMinutes: z
            .number()
            .int()
            .min(0)
            .max(1440)
            .optional()
            .describe("Advance notice in minutes (0-1440)"),
          quietHoursEnabled: z
            .boolean()
            .optional()
            .describe("Enable or disable quiet hours"),
          quietHoursStart: z
            .string()
            .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
            .nullable()
            .optional()
            .describe(
              'Quiet hours start time in HH:MM (e.g., "22:00"). Set to null to clear.',
            ),
          quietHoursEnd: z
            .string()
            .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
            .nullable()
            .optional()
            .describe(
              'Quiet hours end time in HH:MM (e.g., "07:00"). Set to null to clear.',
            ),
          quietHoursDays: z
            .array(
              z.enum([
                "monday",
                "tuesday",
                "wednesday",
                "thursday",
                "friday",
                "saturday",
                "sunday",
              ]),
            )
            .nullable()
            .optional()
            .describe(
              'Days for quiet hours (e.g., ["monday", "tuesday"]). Set to null to clear.',
            ),
        }),
        execute: dedupe("updateUserSettings", async (params) => {
          return await this.userService.updateUserSettings(userId, params);
        }),
      }),

      setQuietHours: tool({
        description:
          'Set do-not-disturb windows. Triggers: quiet hours, do not disturb, DND, silent hours.',
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
          'Get current time/date in user timezone. Triggers: what time, current time, what date.',
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
          'Save information/facts for later. Triggers: remember, note, save, store, keep track.',
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
          'Search saved notes/memories. Triggers: what did I, find note, do you remember, what was.',
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
          'Show all saved notes. Triggers: show notes, list memories, what have I saved.',
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
          'Modify existing note. Triggers: update, change, modify, edit, correct.',
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
          'Delete note permanently. Triggers: delete, remove, forget, clear.',
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
          'Send reminder to contact at specific time. Trigger: remind [number] to [task].',
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
          'Get notification history. Trigger: show notification history.',
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
          'Send custom formatted WhatsApp message to user.',
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

      // ---------------- Media Attachments ----------------
      getMediaHistory: tool({
        description:
          'Get user\'s image/media history with OCR text. Triggers: show images, my images, media history.',
        inputSchema: z.object({
          mediaType: z
            .enum(["image", "audio", "video", "document"])
            .optional()
            .describe("Filter by media type"),
          limit: z
            .number()
            .optional()
            .describe("Max results (default 10, max 50)"),
        }),
        execute: dedupe("getMediaHistory", async (params) => {
          const result = await this.mediaService.getUserAttachments(userId, {
            mediaType: params.mediaType,
            limit: Math.min(params.limit || 10, 50),
          });

          return {
            success: true,
            attachments: result.attachments.map((a) => ({
              id: a.id,
              type: a.mediaType,
              extractedText: a.extractedText?.substring(0, 200), // Preview
              createdAt: a.createdAt,
              hasReminder: !!a.reminderId,
              hasList: !!a.listItemId,
            })),
            total: result.total,
            message: `Found ${result.total} media attachment(s)`,
          };
        }),
      }),

      searchMediaByText: tool({
        description:
          'Search through extracted text from images. Triggers: find in images, search images, what image.',
        inputSchema: z.object({
          query: z.string().describe("Text to search for in OCR results"),
          limit: z.number().optional().describe("Max results (default 5)"),
        }),
        execute: dedupe("searchMediaByText", async (params) => {
          const results = await this.mediaService.searchByText(
            userId,
            params.query,
            {
              limit: params.limit || 5,
            },
          );

          if (results.length === 0) {
            return {
              success: true,
              results: [],
              message: `No images found containing "${params.query}"`,
            };
          }

          return {
            success: true,
            results: results.map((r) => ({
              id: r.id,
              extractedText: r.extractedText,
              createdAt: r.createdAt,
              linkedToReminder: !!r.reminderId,
              linkedToList: !!r.listItemId,
            })),
            message: `Found ${results.length} image(s) containing "${params.query}"`,
          };
        }),
      }),

      getMediaStats: tool({
        description:
          'Get statistics about user\'s media attachments. Triggers: media stats, how many images.',
        inputSchema: z.object({}),
        execute: dedupe("getMediaStats", async () => {
          const stats = await this.mediaService.getAttachmentStats(userId);

          return {
            success: true,
            ...stats,
            message: `You have ${stats.total} media attachment(s): ${stats.withOCR} with OCR, ${stats.linked} linked to items`,
          };
        }),
      }),
    };
    (toolsObj as any).__stats = stats;
    return toolsObj;
  }

  /**
   * STEP 1: Intent Detection Heuristic
   * Quick keyword-based detection to categorize user intent
   */
  private detectIntent(message: string): string[] {
    const lower = message.toLowerCase().trim();
    const intents: string[] = [];

    // Reminder-related keywords
    if (
      /\b(remind|reminder|alert|notify|schedule|set a reminder|don't forget|don't let me forget)\b/.test(
        lower,
      )
    ) {
      intents.push("reminder");
    }

    // List-related keywords
    if (
      /\b(list|shopping|groceries|todo|task|add to|put on|check off|mark as done)\b/.test(
        lower,
      )
    ) {
      intents.push("list");
    }

    // Note/memory keywords
    if (
      /\b(note|remember|save|store|keep track|write down|take a note|what did I|do you remember|where did I)\b/.test(
        lower,
      )
    ) {
      intents.push("note");
    }

    // Settings keywords
    if (
      /\b(setting|settings|timezone|language|quiet hours|notification|preference|configure|my name|who am i|my phone)\b/.test(
        lower,
      )
    ) {
      intents.push("settings");
    }

    // Time query keywords
    if (/\b(what time|current time|what date|time now|today's date)\b/.test(lower)) {
      intents.push("time");
    }

    // Update/modify keywords
    if (
      /\b(update|change|modify|edit|reschedule|move|shift)\b/.test(lower) &&
      !intents.includes("settings")
    ) {
      if (intents.includes("reminder")) {
        intents.push("update");
      }
    }

    // Delete/remove keywords
    if (/\b(delete|remove|cancel|clear|get rid of|forget)\b/.test(lower)) {
      intents.push("delete");
    }

    // Search/find keywords
    if (/\b(find|search|look for|where is|show|display|what's on)\b/.test(lower)) {
      intents.push("search");
    }

    // Snooze/postpone keywords
    if (/\b(snooze|postpone|delay|push back|later)\b/.test(lower)) {
      intents.push("snooze");
    }

    // Complete/done keywords
    if (/\b(complete|done|finished|mark as done|mark as complete)\b/.test(lower)) {
      intents.push("complete");
    }

    // Notification-related keywords
    if (
      /\b(notification|history|send reminder to|share reminder|notify someone)\b/.test(
        lower,
      )
    ) {
      intents.push("notification");
    }

    // Media-related keywords
    if (
      /\b(image|images|photo|photos|picture|pictures|media|show my images|my images|find image|search image)\b/.test(
        lower,
      )
    ) {
      intents.push("media");
    }

    // Default to general if no specific intent detected
    if (intents.length === 0) {
      intents.push("general");
    }
    return intents;
  }

  /**
   * STEP 2: Tool Category Mapping
   * Organize tools into logical categories
   */
  private getToolCategories(): Record<string, string[]> {
    return {
      // Core utility tools (always included)
      core: ["getCurrentTime", "getUserSettings"],

      // Reminder management
      reminder_create: ["createReminder", "batchCreateReminders"],
      reminder_read: [
        "listReminders",
        "searchReminders",
        "getUpcomingReminders",
      ],
      reminder_update: ["updateReminder", "snoozeReminder"],
      reminder_delete: ["deleteReminder"],
      reminder_complete: ["completeReminder"],

      // List management
      list_create: ["createList", "addItemToList"],
      list_read: ["getLists", "getListItems", "searchLists"],
      list_update: ["updateListItem"],
      list_delete: ["deleteList", "removeItemFromList"],

      // Notes/Memory
      note_create: ["createNote"],
      note_read: ["searchNotes", "listNotes"],
      note_update: ["updateNote"],
      note_delete: ["deleteNote"],

      // User settings
      settings: ["updateUserSettings", "setQuietHours"],

      // Notifications
      notification: [
        "sendReminderToContact",
        "getNotificationHistory",
        "sendCustomMessage",
      ],

      // Media attachments
      media: ["getMediaHistory", "searchMediaByText", "getMediaStats"],
    };
  }

  /**
   * STEP 3: Dynamic Tool Selection Based on Intent
   * Returns only relevant tools for the detected intent
   */
  getRelevantTools(userId: string, message: string): any {
    const intents = this.detectIntent(message);
    const categories = this.getToolCategories();
    const allTools = this.getAISDKTools(userId);

    // Always include core tools
    const selectedToolNames = new Set<string>(categories.core);

    // Map intents to tool categories
    for (const intent of intents) {
      switch (intent) {
        case "reminder":
          // Include all reminder tools for general reminder intent
          categories.reminder_create.forEach((t) => selectedToolNames.add(t));
          categories.reminder_read.forEach((t) => selectedToolNames.add(t));
          break;

        case "update":
          if (intents.includes("reminder")) {
            categories.reminder_update.forEach((t) => selectedToolNames.add(t));
            categories.reminder_read.forEach((t) => selectedToolNames.add(t));
          }
          if (intents.includes("list")) {
            categories.list_update.forEach((t) => selectedToolNames.add(t));
            categories.list_read.forEach((t) => selectedToolNames.add(t));
          }
          if (intents.includes("note")) {
            categories.note_update.forEach((t) => selectedToolNames.add(t));
            categories.note_read.forEach((t) => selectedToolNames.add(t));
          }
          break;

        case "delete":
          if (intents.includes("reminder")) {
            categories.reminder_delete.forEach((t) => selectedToolNames.add(t));
            categories.reminder_read.forEach((t) => selectedToolNames.add(t));
          }
          if (intents.includes("list")) {
            categories.list_delete.forEach((t) => selectedToolNames.add(t));
            categories.list_read.forEach((t) => selectedToolNames.add(t));
          }
          if (intents.includes("note")) {
            categories.note_delete.forEach((t) => selectedToolNames.add(t));
            categories.note_read.forEach((t) => selectedToolNames.add(t));
          }
          break;

        case "search":
          if (intents.includes("reminder")) {
            categories.reminder_read.forEach((t) => selectedToolNames.add(t));
          }
          if (intents.includes("list")) {
            categories.list_read.forEach((t) => selectedToolNames.add(t));
          }
          if (intents.includes("note")) {
            categories.note_read.forEach((t) => selectedToolNames.add(t));
          }
          // If no specific category, include all search tools
          if (
            !intents.includes("reminder") &&
            !intents.includes("list") &&
            !intents.includes("note")
          ) {
            categories.reminder_read.forEach((t) => selectedToolNames.add(t));
            categories.list_read.forEach((t) => selectedToolNames.add(t));
            categories.note_read.forEach((t) => selectedToolNames.add(t));
          }
          break;

        case "list":
          categories.list_create.forEach((t) => selectedToolNames.add(t));
          categories.list_read.forEach((t) => selectedToolNames.add(t));
          break;

        case "note":
          categories.note_create.forEach((t) => selectedToolNames.add(t));
          categories.note_read.forEach((t) => selectedToolNames.add(t));
          break;

        case "settings":
          categories.settings.forEach((t) => selectedToolNames.add(t));
          break;

        case "time":
          // Core already includes getCurrentTime
          break;

        case "snooze":
          categories.reminder_update.forEach((t) => selectedToolNames.add(t));
          categories.reminder_read.forEach((t) => selectedToolNames.add(t));
          break;

        case "complete":
          categories.reminder_complete.forEach((t) => selectedToolNames.add(t));
          categories.reminder_read.forEach((t) => selectedToolNames.add(t));
          if (intents.includes("list")) {
            categories.list_update.forEach((t) => selectedToolNames.add(t));
            categories.list_read.forEach((t) => selectedToolNames.add(t));
          }
          break;

        case "notification":
          categories.notification.forEach((t) => selectedToolNames.add(t));
          break;

        case "media":
          categories.media.forEach((t) => selectedToolNames.add(t));
          break;

        case "general":
        default:
          // For general/unknown intents, include most common tools
          categories.reminder_create.forEach((t) => selectedToolNames.add(t));
          categories.reminder_read.forEach((t) => selectedToolNames.add(t));
          categories.list_create.forEach((t) => selectedToolNames.add(t));
          categories.list_read.forEach((t) => selectedToolNames.add(t));
          categories.note_read.forEach((t) => selectedToolNames.add(t));
          break;
      }
    }

    // Build filtered tools object
    const filteredTools: any = {};
    for (const toolName of selectedToolNames) {
      if (allTools[toolName]) {
        filteredTools[toolName] = allTools[toolName];
      }
    }

    // Copy stats reference
    if ((allTools as any).__stats) {
      (filteredTools as any).__stats = (allTools as any).__stats;
    }

    logInfo(
      `Intent detection: ${intents.join(", ")} | Selected ${selectedToolNames.size} tools from ${Object.keys(allTools).length} total`,
      { intents, toolCount: selectedToolNames.size },
    );

    return filteredTools;
  }

  /**
   * LEGACY: Get a restricted subset of tools based on detected intent
   * Kept for backward compatibility
   * @deprecated Use getRelevantTools instead
   */
  getAISDKToolsSubset(userId: string, intent: string): any {
    const allTools = this.getAISDKTools(userId);

    // Intent-to-tools mapping
    const intentToolMap: Record<string, string[]> = {
      createReminder: [
        "createReminder",
        "parseNaturalLanguageDate",
        "getUserSettings",
      ],
      updateReminder: [
        "updateReminder",
        "searchReminders",
        "parseNaturalLanguageDate",
        "getUserSettings",
      ],
      deleteReminder: ["deleteReminder", "searchReminders", "getUserSettings"],
      completeReminder: [
        "completeReminder",
        "searchReminders",
        "getUserSettings",
      ],
      snoozeReminder: [
        "snoozeReminder",
        "searchReminders",
        "parseNaturalLanguageDate",
        "getUserSettings",
      ],
      listReminders: ["listReminders", "getUserSettings"],
      searchReminders: ["searchReminders", "getUserSettings"],
      getUpcomingReminders: ["getUpcomingReminders", "getUserSettings"],
      batchCreateReminders: [
        "batchCreateReminders",
        "parseNaturalLanguageDate",
        "getUserSettings",
      ],

      createList: ["createList", "getUserSettings"],
      addItemToList: ["addItemToList", "getLists", "getUserSettings"],
      getLists: ["getLists", "getUserSettings"],
      getListItems: ["getListItems", "getLists", "getUserSettings"],
      deleteList: ["deleteList", "getLists", "getUserSettings"],
      searchLists: ["searchLists", "getUserSettings"],
      updateListItem: ["updateListItem", "getListItems", "getUserSettings"],
      removeItemFromList: [
        "removeItemFromList",
        "getListItems",
        "getUserSettings",
      ],

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
