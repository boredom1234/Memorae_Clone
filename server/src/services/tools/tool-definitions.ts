import { tool } from "ai";
import { z } from "zod";
import { UserService } from "../user-service";
import { ReminderService } from "../reminder-service";
import { ListService } from "../list-service";
import { UtilityService } from "../utility-service";
import { NotesService } from "../notes-service";
import { NotificationService } from "../notification-service";
import { MediaAttachmentService } from "../media-attachment-service";
import { logError, logInfo } from "../../utils/logger";

/**
 * Tool Definitions Module
 * Contains all AI SDK tool schemas and execution logic
 */

export interface ToolServices {
  userService: UserService;
  reminderService: ReminderService;
  listService: ListService;
  utilityService: UtilityService;
  notesService: NotesService;
  notificationService: NotificationService;
  mediaService: MediaAttachmentService;
}

export type DedupeFunction = <T>(
  name: string,
  fn: (params: any) => Promise<T>,
) => (params: any) => Promise<T>;

/**
 * Creates all AI SDK compatible tools for a specific user
 */
export function createAISDKTools(
  userId: string,
  services: ToolServices,
  dedupe: DedupeFunction,
) {
  const {
    userService,
    reminderService,
    listService,
    utilityService,
    notesService,
    notificationService,
    mediaService,
  } = services;

  return {
    // ==================== REMINDER TOOLS ====================
    createReminder: tool({
      description:
        "Create reminder at specific time. Supports one-time and recurring (daily/weekly/monthly). Triggers: remind, alert, schedule, notify.",
      inputSchema: z.object({
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
        notes: z.string().optional().describe("Additional notes - ALWAYS try to extract context from the user's message to fill this field"),
        priority: z
          .enum(["low", "medium", "high"])
          .optional()
          .describe("Priority level - infer from urgency keywords (urgent/ASAP/important=high, later/sometime=low, default=medium)"),
      }),
      execute: dedupe("createReminder", async (params) => {
        const settings = await userService.getUserSettings(userId);
        const tz = settings?.timezone || "UTC";

        let finalTime = params.reminderTime;

        if (params.naturalTimeText || !finalTime) {
          const textToParse =
            params.naturalTimeText || params.reminderTime || "";
          const parsed = utilityService.parseNaturalLanguageDate({
            text: textToParse,
            timezone: tz,
          });

          if (parsed.success && parsed.extractedDates.length > 0) {
            const bestDate = utilityService.pickBestDate(parsed.extractedDates);
            if (bestDate) {
              finalTime = bestDate;
            }
          }
        }

        if (!finalTime) {
          throw new Error(
            "Could not determine reminder time. Please specify a valid date/time.",
          );
        }

        const parsedDate = new Date(finalTime);
        if (isNaN(parsedDate.getTime())) {
          throw new Error("Invalid reminder time format.");
        }

        if (parsedDate.getTime() <= Date.now()) {
          finalTime = utilityService.ensureFuture(finalTime);
        }

        const normalizedTitle = params.title.trim().replace(/\s+/g, " ");
        if (!normalizedTitle) {
          throw new Error("Reminder title cannot be empty.");
        }

        return await reminderService.createReminder({
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
        "Modify existing reminder (time, title, priority). Triggers: change, update, edit, reschedule, move.",
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
        const settings = await userService.getUserSettings(userId);
        const tz = settings?.timezone || "UTC";

        const searchResult = await reminderService.searchReminders({
          userId,
          query: params.searchQuery,
          limit: 5,
        });

        if (searchResult.results.length === 0) {
          throw new Error(
            "Could not find any reminders matching that description.",
          );
        }

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

        let finalTime = params.reminderTime;
        if (
          params.naturalTimeText ||
          (params.reminderTime &&
            isNaN(new Date(params.reminderTime).getTime()))
        ) {
          const textToParse =
            params.naturalTimeText || params.reminderTime || "";
          const parsed = utilityService.parseNaturalLanguageDate({
            text: textToParse,
            timezone: tz,
          });

          if (parsed.success && parsed.extractedDates.length > 0) {
            finalTime =
              utilityService.pickBestDate(parsed.extractedDates) || finalTime;
          }
        }

        if (finalTime) {
          const parsedDate = new Date(finalTime);
          if (parsedDate.getTime() <= Date.now()) {
            finalTime = utilityService.ensureFuture(finalTime);
          }
        }

        const normalizedTitle = params.title
          ? params.title.trim().replace(/\s+/g, " ")
          : undefined;

        if (!normalizedTitle && !finalTime && !params.priority) {
          throw new Error(
            "Please specify what you want to update (title, time, or priority).",
          );
        }

        return await reminderService.updateReminder({
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
        "Delete/cancel reminder permanently. Triggers: delete, remove, cancel, clear.",
      inputSchema: z.object({
        searchQuery: z
          .string()
          .describe("Text to search for the reminder to delete"),
      }),
      execute: dedupe("deleteReminder", async (params) => {
        const searchResult = await reminderService.searchReminders({
          userId,
          query: params.searchQuery,
          limit: 5,
        });

        if (searchResult.results.length === 0) {
          throw new Error(
            "Could not find any reminders matching that description.",
          );
        }

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

        if (reminder.isRecurring) {
          return {
            needsConfirmation: true,
            message: `This is a recurring reminder ("${reminder.title}"). Are you sure you want to delete it? Reply 'yes' to confirm.`,
            action: "deleteReminder",
            targetId: reminder.id,
            summary: `Delete recurring reminder: ${reminder.title}`,
          };
        }

        return await reminderService.deleteReminder({
          userId,
          reminderId: reminder.id,
        });
      }),
    }),

    listReminders: tool({
      description:
        "List reminders with filters (status, date). Triggers: list, show, display, what reminders.",
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
        return await reminderService.listReminders({
          userId,
          status: params.status || "pending",
          limit: params.limit || 10,
          sortBy: "time",
        });
      }),
    }),

    completeReminder: tool({
      description:
        "Mark reminder as done (status only, not deleted). Triggers: complete, done, finished, mark as done.",
      inputSchema: z.object({
        searchQuery: z
          .string()
          .describe("Text to search for the reminder to complete"),
      }),
      execute: dedupe("completeReminder", async (params) => {
        const searchResult = await reminderService.searchReminders({
          userId,
          query: params.searchQuery,
          limit: 1,
        });

        if (searchResult.results.length === 0) {
          throw new Error("Could not find that reminder");
        }

        return await reminderService.completeReminder({
          userId,
          reminderId: searchResult.results[0].id,
        });
      }),
    }),

    searchReminders: tool({
      description:
        "Search reminders by keyword/title. Triggers: find, search, look for, where is.",
      inputSchema: z.object({
        query: z.string().describe("Search query"),
        limit: z.number().optional().describe("Maximum results"),
        includeCompleted: z
          .boolean()
          .optional()
          .describe("Whether to include completed reminders"),
      }),
      execute: dedupe("searchReminders", async (params) => {
        return await reminderService.searchReminders({
          userId,
          query: params.query,
          limit: params.limit || 10,
        });
      }),
    }),

    snoozeReminder: tool({
      description:
        "Postpone reminder to later time. Triggers: snooze, postpone, delay, push back, later.",
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
        const settings = await userService.getUserSettings(userId);
        const tz = settings?.timezone || "UTC";

        const searchResult = await reminderService.searchReminders({
          userId,
          query: params.searchQuery,
          limit: 5,
        });

        if (searchResult.results.length === 0) {
          throw new Error(
            "Could not find any reminders matching that description.",
          );
        }

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

        let finalTime = params.snoozeUntil;
        if (params.naturalTimeText || !finalTime) {
          const textToParse =
            params.naturalTimeText || params.snoozeUntil || "";
          const parsed = utilityService.parseNaturalLanguageDate({
            text: textToParse,
            timezone: tz,
          });

          if (parsed.success && parsed.extractedDates.length > 0) {
            finalTime =
              utilityService.pickBestDate(parsed.extractedDates) || finalTime;
          }
        }

        if (!finalTime) {
          throw new Error(
            "Please specify when to snooze until (e.g., 'in 10 minutes', 'tomorrow 3pm').",
          );
        }

        const parsedDate = new Date(finalTime);
        if (parsedDate.getTime() <= Date.now()) {
          throw new Error("Snooze time must be in the future.");
        }

        return await reminderService.snoozeReminder({
          userId,
          reminderId: searchResult.results[0].id,
          snoozeUntil: finalTime,
          timezone: tz,
        });
      }),
    }),

    getUpcomingReminders: tool({
      description:
        "Get reminders for timeframe (today/tomorrow/week/month). Triggers: upcoming, what's coming, scheduled.",
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
        return await reminderService.getUpcomingReminders({
          userId,
          timeframe: params.timeframe,
          limit: params.limit || 10,
        });
      }),
    }),

    batchCreateReminders: tool({
      description:
        "Create multiple reminders at once. Triggers: remind me to [list], set reminders for.",
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
        return await reminderService.batchCreateReminders({
          userId,
          reminders: params.reminders,
        });
      }),
    }),

    // ==================== LIST TOOLS ====================
    createList: tool({
      description:
        "Create new list (shopping, todo, tasks). Triggers: create list, make list, new list.",
      inputSchema: z.object({
        name: z.string().describe("Name of the list"),
        description: z.string().optional().describe("Description of the list - ALWAYS try to infer purpose from context (e.g., 'Shopping list for groceries', 'Tasks for work project')"),
        items: z.array(z.string()).optional().describe("Initial items to add"),
        icon: z.string().optional().describe("Icon/emoji for the list - infer from list type (🛒 for shopping, ✅ for todo, 📝 for notes, 🎯 for goals, etc.)"),
        color: z.string().optional().describe("Color for the list - suggest based on category (blue for work, green for shopping, red for urgent, etc.)"),
      }),
      execute: dedupe("createList", async (params) => {
        // Auto-fill icon and color if not provided
        const listData: any = { ...params };
        
        if (!listData.icon) {
          const nameLower = params.name.toLowerCase();
          if (nameLower.includes('shop') || nameLower.includes('grocery') || nameLower.includes('buy')) {
            listData.icon = '🛒';
          } else if (nameLower.includes('todo') || nameLower.includes('task')) {
            listData.icon = '✅';
          } else if (nameLower.includes('goal') || nameLower.includes('target')) {
            listData.icon = '🎯';
          } else if (nameLower.includes('book') || nameLower.includes('read')) {
            listData.icon = '📚';
          } else if (nameLower.includes('movie') || nameLower.includes('watch')) {
            listData.icon = '🎬';
          } else {
            listData.icon = '📝';
          }
        }
        
        if (!listData.color) {
          const nameLower = params.name.toLowerCase();
          if (nameLower.includes('urgent') || nameLower.includes('important')) {
            listData.color = '#ef4444';
          } else if (nameLower.includes('work') || nameLower.includes('office')) {
            listData.color = '#3b82f6';
          } else if (nameLower.includes('shop') || nameLower.includes('grocery')) {
            listData.color = '#22c55e';
          } else if (nameLower.includes('personal') || nameLower.includes('home')) {
            listData.color = '#a855f7';
          } else {
            listData.color = '#6b7280';
          }
        }
        
        return await listService.createList({
          userId,
          ...listData,
        });
      }),
    }),

    addItemToList: tool({
      description:
        "Add items to list (auto-creates if missing, max 50/call). Triggers: add to, put on, include.",
      inputSchema: z.object({
        listName: z.string().describe("Name of the list"),
        items: z
          .array(z.string())
          .describe("Items to add to the list (max 50)"),
        notes: z.string().optional().describe("Optional notes/context for the items being added"),
      }),
      execute: dedupe("addItemToList", async (params) => {
        if (params.items.length > 50) {
          const batches = [];
          for (let i = 0; i < params.items.length; i += 50) {
            batches.push(params.items.slice(i, i + 50));
          }

          let totalAdded = 0;
          let errors = [];

          for (let i = 0; i < batches.length; i++) {
            try {
              const result = await listService.addItemToList({
                userId,
                listName: params.listName,
                items: batches[i],
              });
              totalAdded += result.addedCount || batches[i].length;
            } catch (error: any) {
              if (i === 0 && error.code === "LIST_NOT_FOUND") {
                try {
                  const createResult = await listService.createList({
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

        try {
          return await listService.addItemToList({
            userId,
            listName: params.listName,
            items: params.items,
          });
        } catch (error: any) {
          if (
            error.code === "LIST_NOT_FOUND" ||
            error.message?.includes("not found")
          ) {
            return await listService.createList({
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
        "Show all user lists. Triggers: show lists, what lists, all lists.",
      inputSchema: z.object({
        includeItems: z
          .boolean()
          .optional()
          .describe("Whether to include list items"),
      }),
      execute: dedupe("getLists", async (params) => {
        return await listService.getLists({
          userId,
          includeItems: params.includeItems ?? true,
          limit: 20,
        });
      }),
    }),

    getListItems: tool({
      description:
        "Show items in specific list. Triggers: show [list], what's on, what's in, view.",
      inputSchema: z.object({
        listName: z.string().describe("Name of the list to get items from"),
        includeCompleted: z
          .boolean()
          .optional()
          .describe("Whether to include completed items"),
      }),
      execute: dedupe("getListItems", async (params) => {
        return await listService.getListItems({
          userId,
          listName: params.listName,
          includeCompleted: params.includeCompleted ?? false,
        });
      }),
    }),

    removeItemFromList: tool({
      description:
        "Remove items from list. Triggers: remove, delete, take off.",
      inputSchema: z.object({
        listName: z.string().describe("Name of the list"),
        itemText: z.string().describe("Text to search for in items to remove"),
      }),
      execute: dedupe("removeItemFromList", async (params) => {
        return await listService.removeItemFromList({
          userId,
          listName: params.listName,
          itemText: params.itemText,
        });
      }),
    }),

    updateListItem: tool({
      description:
        "Update list item (complete/edit/reorder). Triggers: mark as done, check off, update, change.",
      inputSchema: z.object({
        listName: z.string().describe("Name of the list containing the item"),
        itemText: z.string().describe("Text to search for the item to update"),
        isCompleted: z
          .boolean()
          .optional()
          .describe("Mark item as completed or not"),
        newContent: z.string().optional().describe("New content for the item"),
      }),
      execute: dedupe("updateListItem", async (params) => {
        const listItems = await listService.getListItems({
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

        return await listService.updateListItem({
          itemId: item.id,
          isCompleted: params.isCompleted,
          newContent: params.newContent,
        });
      }),
    }),

    deleteList: tool({
      description:
        "Delete entire list and items. Triggers: delete list, remove list, clear list.",
      inputSchema: z.object({
        listName: z.string().describe("Name of the list to delete"),
      }),
      execute: dedupe("deleteList", async (params) => {
        return await listService.deleteList({
          userId,
          listName: params.listName,
        });
      }),
    }),

    searchLists: tool({
      description:
        "Search all lists/items. Triggers: find, search, where is, look for.",
      inputSchema: z.object({
        query: z.string().describe("Search query"),
        searchIn: z
          .enum(["list-names", "items", "both"])
          .optional()
          .describe("Where to search"),
        limit: z.number().optional().describe("Maximum results"),
      }),
      execute: dedupe("searchLists", async (params) => {
        return await listService.searchLists({
          userId,
          query: params.query,
          searchIn: params.searchIn || "both",
          limit: params.limit || 20,
        });
      }),
    }),

    // ==================== NOTES TOOLS ====================
    createNote: tool({
      description:
        "Save information/facts for later. Triggers: remember, note, save, store, keep track.",
      inputSchema: z.object({
        content: z
          .string()
          .describe("The information/note content to remember"),
        title: z.string().optional().describe("Optional title for the note - ALWAYS try to generate a descriptive title from the content"),
        category: z
          .string()
          .optional()
          .describe("Category like 'personal', 'work', 'general', 'shopping', 'health', 'finance' - infer from content context"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Optional tags for organization - extract relevant keywords from content as tags"),
        isPinned: z.boolean().optional().describe("Mark as important/pinned - set to true if user says 'important', 'remember this', 'don't forget'"),
      }),
      execute: dedupe("createNote", async (params) => {
        // Auto-generate title if not provided
        let title = params.title;
        if (!title && params.content) {
          // Generate title from first 50 chars of content
          const firstLine = params.content.split('\n')[0];
          title = firstLine.length > 50 ? firstLine.substring(0, 47) + '...' : firstLine;
        }
        
        // Auto-infer category if not provided
        let category = params.category || "general";
        if (!params.category) {
          const contentLower = params.content.toLowerCase();
          if (contentLower.includes('work') || contentLower.includes('office') || contentLower.includes('meeting')) {
            category = 'work';
          } else if (contentLower.includes('buy') || contentLower.includes('shop') || contentLower.includes('price')) {
            category = 'shopping';
          } else if (contentLower.includes('health') || contentLower.includes('doctor') || contentLower.includes('medicine')) {
            category = 'health';
          } else if (contentLower.includes('money') || contentLower.includes('payment') || contentLower.includes('bill')) {
            category = 'finance';
          } else if (contentLower.includes('family') || contentLower.includes('friend') || contentLower.includes('personal')) {
            category = 'personal';
          }
        }
        
        return await notesService.createNote({
          userId,
          content: params.content,
          title: title,
          category: category,
          tags: params.tags,
          isPinned: params.isPinned || false,
        });
      }),
    }),

    searchNotes: tool({
      description:
        "Search saved notes/memories. Triggers: what did I, find note, do you remember, what was.",
      inputSchema: z.object({
        query: z.string().describe("Search query to find in notes"),
        category: z.string().optional().describe("Filter by category"),
        tags: z.array(z.string()).optional().describe("Filter by tags"),
        limit: z.number().optional().describe("Maximum results to return"),
      }),
      execute: dedupe("searchNotes", async (params) => {
        return await notesService.searchNotes({
          userId,
          query: params.query,
          category: params.category,
          tags: params.tags,
          limit: Math.min(params.limit || 5, 10),
          includeArchived: false,
        });
      }),
    }),

    listNotes: tool({
      description:
        "Show all saved notes. Triggers: show notes, list memories, what have I saved.",
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
        return await notesService.listNotes({
          userId,
          category: params.category,
          tags: params.tags,
          onlyPinned: params.onlyPinned || false,
          limit: Math.min(params.limit || 10, 15),
          includeArchived: false,
          sortBy: "created",
          sortOrder: "desc",
        });
      }),
    }),

    updateNote: tool({
      description:
        "Modify existing note. Triggers: update, change, modify, edit, correct.",
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
        const searchResult = await notesService.searchNotes({
          userId,
          query: params.searchQuery,
          limit: 1,
          includeArchived: false,
        });

        if (searchResult.notes.length === 0) {
          throw new Error("Could not find that note");
        }

        return await notesService.updateNote({
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
        "Delete note permanently. Triggers: delete, remove, forget, clear.",
      inputSchema: z.object({
        searchQuery: z
          .string()
          .describe("Text to search for the note to delete"),
      }),
      execute: dedupe("deleteNote", async (params) => {
        const searchResult = await notesService.searchNotes({
          userId,
          query: params.searchQuery,
          limit: 1,
          includeArchived: false,
        });

        if (searchResult.notes.length === 0) {
          throw new Error("Could not find that note");
        }

        return await notesService.deleteNote(userId, searchResult.notes[0].id);
      }),
    }),

    // ==================== SETTINGS TOOLS ====================
    getUserSettings: tool({
      description:
        "Get user profile/settings (name, timezone, language, notifications). Triggers: my settings, who am I, my name.",
      inputSchema: z.object({}),
      execute: dedupe("getUserSettings", async () => {
        return await userService.getUserSettings(userId);
      }),
    }),

    updateUserSettings: tool({
      description:
        "Update settings (name, timezone, language, notifications, quiet hours). Triggers: change, set, update, configure.",
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
        return await userService.updateUserSettings(userId, params);
      }),
    }),

    setQuietHours: tool({
      description:
        "Set do-not-disturb windows. Triggers: quiet hours, do not disturb, DND, silent hours.",
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
        return await userService.setQuietHours(
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
        "Get current time/date in user timezone. Triggers: what time, current time, what date.",
      inputSchema: z.object({}),
      execute: dedupe("getCurrentTime", async () => {
        const settings = await userService.getUserSettings(userId);
        const tz = settings?.timezone || "UTC";

        return await utilityService.getCurrentTime({
          timezone: tz,
        });
      }),
    }),

    // ==================== NOTIFICATION TOOLS ====================
    sendReminderToContact: tool({
      description:
        "Send reminder to contact at specific time. Trigger: remind [number] to [task].",
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
        const settings = await userService.getUserSettings(userId);
        const tz = settings?.timezone || "UTC";
        let iso = params.reminderTime;
        const asDate = new Date(iso);
        if (isNaN(asDate.getTime())) {
          const parsed = await utilityService.parseNaturalLanguageDate({
            text: params.reminderTime,
            timezone: tz,
          });
          if (!parsed.success || parsed.extractedDates.length === 0) {
            throw new Error("Could not parse reminder time");
          }
          iso = parsed.extractedDates[0].parsedDate;
        }

        let whenMs = new Date(iso).getTime();
        const nowMs = Date.now();
        if (whenMs <= nowMs && nowMs - whenMs < 24 * 60 * 60 * 1000) {
          whenMs += 24 * 60 * 60 * 1000;
          iso = new Date(whenMs).toISOString();
        }
        if (whenMs <= nowMs) {
          throw new Error("Reminder time must be in the future");
        }

        return await notificationService.sendReminderToContact({
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
        "Get notification history. Trigger: show notification history.",
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
        return await notificationService.getNotificationHistory({
          userId,
          limit,
          offset,
          type: params.type,
        });
      }),
    }),

    sendCustomMessage: tool({
      description: "Send custom formatted WhatsApp message to user.",
      inputSchema: z.object({
        message: z.string().describe("Message text"),
        formatting: z.enum(["plain", "markdown"]).optional(),
        buttons: z
          .array(z.object({ id: z.string(), label: z.string() }))
          .optional(),
      }),
      execute: dedupe("sendCustomMessage", async (params) => {
        return await notificationService.sendCustomMessage(userId, {
          message: params.message,
          formatting: params.formatting,
          buttons: params.buttons,
        });
      }),
    }),

    // ==================== MEDIA TOOLS ====================
    getMediaHistory: tool({
      description:
        "Get user's image/media history with OCR text. Triggers: show images, my images, media history.",
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
        const result = await mediaService.getUserAttachments(userId, {
          mediaType: params.mediaType,
          limit: Math.min(params.limit || 10, 50),
        });

        return {
          success: true,
          attachments: result.attachments.map((a) => ({
            id: a.id,
            type: a.mediaType,
            fileUrl: a.fileUrl,
            extractedText: a.extractedText?.substring(0, 200),
            createdAt: a.createdAt,
            hasReminder: !!a.reminderId,
            hasList: !!a.listItemId,
          })),
          total: result.total,
          message: `Found ${result.total} media attachment(s). You can view them at the URLs provided.`,
        };
      }),
    }),

    searchMediaByText: tool({
      description:
        "Search through extracted text from images. Triggers: find in images, search images, what image.",
      inputSchema: z.object({
        query: z.string().describe("Text to search for in OCR results"),
        limit: z.number().optional().describe("Max results (default 5)"),
      }),
      execute: dedupe("searchMediaByText", async (params) => {
        const results = await mediaService.searchByText(userId, params.query, {
          limit: params.limit || 5,
        });

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
            fileUrl: r.fileUrl,
            extractedText: r.extractedText,
            createdAt: r.createdAt,
            linkedToReminder: !!r.reminderId,
            linkedToList: !!r.listItemId,
          })),
          message: `Found ${results.length} image(s) containing "${params.query}". You can view them at the URLs provided.`,
        };
      }),
    }),

    getMediaStats: tool({
      description:
        "Get statistics about user's media attachments. Triggers: media stats, how many images.",
      inputSchema: z.object({}),
      execute: dedupe("getMediaStats", async () => {
        const stats = await mediaService.getAttachmentStats(userId);

        return {
          success: true,
          ...stats,
          message: `You have ${stats.total} media attachment(s): ${stats.withOCR} with OCR, ${stats.linked} linked to items`,
        };
      }),
    }),
  };
}
