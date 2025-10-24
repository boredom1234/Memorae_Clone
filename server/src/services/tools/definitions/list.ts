import { tool } from "ai";
import { z } from "zod";
import { DedupeFunction, ToolServices } from "../tool-definitions";
export function createListAITools(
  userId: string,
  services: ToolServices,
  dedupe: DedupeFunction,
) {
  const { listService, listItemService, listQueryService } = services;
  return {
    createList: tool({
      description:
        "Create a new empty list or with initial items. Use when user wants to start a new list. Examples: 'create a shopping list', 'make a new todo list', 'start a list for X', 'new list called Y'. Automatically suggests icons and colors based on list name/purpose.",
      inputSchema: z.object({
        name: z.string().describe("Name of the list"),
        description: z
          .string()
          .optional()
          .describe(
            "Description of the list - ALWAYS try to infer purpose from context (e.g., 'Shopping list for groceries', 'Tasks for work project')",
          ),
        items: z.array(z.string()).optional().describe("Initial items to add"),
        icon: z
          .string()
          .optional()
          .describe(
            "Icon/emoji for the list - infer from list type (🛒 for shopping, ✅ for todo, 📝 for notes, 🎯 for goals, etc.)",
          ),
        color: z
          .string()
          .optional()
          .describe(
            "Color for the list - suggest based on category (blue for work, green for shopping, red for urgent, etc.)",
          ),
      }),
      execute: dedupe("createList", async (params) => {
        const listData: any = { ...params };
        if (!listData.icon) {
          const nameLower = params.name.toLowerCase();
          if (
            nameLower.includes("shop") ||
            nameLower.includes("grocery") ||
            nameLower.includes("buy")
          ) {
            listData.icon = "🛒";
          } else if (nameLower.includes("todo") || nameLower.includes("task")) {
            listData.icon = "✅";
          } else if (
            nameLower.includes("goal") ||
            nameLower.includes("target")
          ) {
            listData.icon = "🎯";
          } else if (nameLower.includes("book") || nameLower.includes("read")) {
            listData.icon = "📚";
          } else if (
            nameLower.includes("movie") ||
            nameLower.includes("watch")
          ) {
            listData.icon = "🎬";
          } else {
            listData.icon = "📝";
          }
        }
        if (!listData.color) {
          const nameLower = params.name.toLowerCase();
          if (nameLower.includes("urgent") || nameLower.includes("important")) {
            listData.color = "#ef4444";
          } else if (
            nameLower.includes("work") ||
            nameLower.includes("office")
          ) {
            listData.color = "#3b82f6";
          } else if (
            nameLower.includes("shop") ||
            nameLower.includes("grocery")
          ) {
            listData.color = "#22c55e";
          } else if (
            nameLower.includes("personal") ||
            nameLower.includes("home")
          ) {
            listData.color = "#a855f7";
          } else {
            listData.color = "#6b7280";
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
        "Add one or more items to an existing list. If the list doesn't exist, it will be created automatically. Use when user wants to add items to a list. Examples: 'add X to Y list', 'put X on my list', 'include X in shopping list'. ALWAYS extract list name from the message - common patterns: 'to X list', 'on my X', 'in the X list'. Max 50 items per call.",
      inputSchema: z.object({
        listName: z
          .string()
          .describe(
            "Name of the list - ALWAYS extract from user message (e.g., 'shopping', 'groceries', 'todo', 'work'). If not specified, try to infer or default to 'General'."
          ),
        items: z
          .array(z.string())
          .describe("Items to add to the list (max 50)"),
        notes: z
          .string()
          .optional()
          .describe("Optional notes/context for the items being added"),
      }),
      execute: dedupe("addItemToList", async (params) => {
        const ctx = (params as any)._context || {};
        let listName = params.listName || "General";
        if (!params.listName && ctx.originalMessage) {
          const msg = ctx.originalMessage.toLowerCase();
          const patterns = [
            /(?:to|on|in)\s+(?:my\s+)?(\w+)\s+list/i,
            /(\w+)\s+list/i,
            /to\s+(\w+)/i,
          ];
          for (const pattern of patterns) {
            const match = msg.match(pattern);
            if (match && match[1]) {
              listName =
                match[1].charAt(0).toUpperCase() + match[1].slice(1);
              break;
            }
          }
        }
        if (params.items.length > 50) {
          const batches = [];
          for (let i = 0; i < params.items.length; i += 50) {
            batches.push(params.items.slice(i, i + 50));
          }
          let totalAdded = 0;
          let errors = [];
          for (let i = 0; i < batches.length; i++) {
            try {
              const result = await listItemService.addItemToList({
                userId,
                listName: listName,
                items: batches[i],
              });
              totalAdded += result.addedCount || batches[i].length;
            } catch (error: any) {
              if (i === 0 && error.code === "LIST_NOT_FOUND") {
                try {
                  const createResult = await listService.createList({
                    userId,
                    name: listName,
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
          return await listItemService.addItemToList({
            userId,
            listName: listName,
            items: params.items,
          });
        } catch (error: any) {
          if (
            error.code === "LIST_NOT_FOUND" ||
            error.message?.includes("not found")
          ) {
            return await listService.createList({
              userId,
              name: listName,
              items: params.items,
            });
          }
          throw error;
        }
      }),
    }),
    getLists: tool({
      description:
        "Show all lists the user has created. Use when user wants to see their lists. Examples: 'show my lists', 'what lists do I have', 'display all lists', 'list my lists'. By default shows active lists only, can optionally include archived ones.",
      inputSchema: z.object({
        includeItems: z
          .boolean()
          .optional()
          .describe("Whether to include list items"),
        includeArchived: z
          .boolean()
          .optional()
          .describe(
            "Whether to include archived lists (default: false, only active lists)",
          ),
      }),
      execute: dedupe("getLists", async (params) => {
        return await listQueryService.getLists({
          userId,
          includeItems: params.includeItems ?? true,
          includeArchived: params.includeArchived ?? false,
          limit: 20,
        });
      }),
    }),
    getListItems: tool({
      description:
        "Get all items from a specific list by name. Use when user asks about contents of a particular list. Examples: 'what's on my shopping list?', 'show grocery list items', 'what's in my todo list', 'view my work list'.",
      inputSchema: z.object({
        listName: z.string().describe("Name of the list to get items from"),
        includeCompleted: z
          .boolean()
          .optional()
          .describe("Whether to include completed items"),
      }),
      execute: dedupe("getListItems", async (params) => {
        return await listQueryService.getListItems({
          userId,
          listName: params.listName,
          includeCompleted: params.includeCompleted ?? false,
        });
      }),
    }),
    removeItemFromList: tool({
      description:
        "Remove items from list. Triggers: remove, delete, take off. Searches for matching items and removes them.",
      inputSchema: z.object({
        listName: z.string().describe("Name of the list"),
        itemText: z.string().describe("Text to search for in items to remove"),
      }),
      execute: dedupe("removeItemFromList", async (params) => {
        try {
          return await listItemService.removeItemFromList({
            userId,
            listName: params.listName,
            itemText: params.itemText,
          });
        } catch (error: any) {
          if (
            error.code === "LIST_NOT_FOUND" ||
            error.message?.includes("not found")
          ) {
            throw new Error(
              `Could not find list \"${params.listName}\". Check the list name and try again.`
            );
          }
          throw error;
        }
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
        const listItems = await listQueryService.getListItems({
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
        return await listItemService.updateListItem({
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
        return await listQueryService.searchLists({
          userId,
          query: params.query,
          searchIn: params.searchIn || "both",
          limit: params.limit || 20,
        });
      }),
    }),
    archiveList: tool({
      description:
        "Archive list (soft delete, keeps data). Triggers: archive list, hide list.",
      inputSchema: z.object({
        listName: z.string().describe("Name of the list to archive"),
      }),
      execute: dedupe("archiveList", async (params) => {
        return await listService.archiveList({
          userId,
          listName: params.listName,
        });
      }),
    }),
    bulkCompleteItems: tool({
      description:
        "Mark multiple list items as completed at once. Triggers: complete all, mark all done, check off multiple.",
      inputSchema: z.object({
        listName: z.string().describe("Name of the list"),
        itemIds: z
          .array(z.string())
          .describe("Array of item IDs to mark as completed"),
      }),
      execute: dedupe("bulkCompleteItems", async (params) => {
        return await listItemService.bulkCompleteItems({
          userId,
          listName: params.listName,
          itemIds: params.itemIds,
        });
      }),
    }),
    clearCompletedItems: tool({
      description:
        "Remove all completed items from list. Triggers: clear completed, remove done items, clean up list.",
      inputSchema: z.object({
        listName: z.string().describe("Name of the list to clear"),
      }),
      execute: dedupe("clearCompletedItems", async (params) => {
        return await listItemService.clearCompletedItems({
          userId,
          listName: params.listName,
        });
      }),
    }),
    duplicateList: tool({
      description:
        "Clone/copy entire list with items. Triggers: duplicate list, copy list, clone list.",
      inputSchema: z.object({
        listName: z.string().describe("Name of the list to duplicate"),
        newName: z
          .string()
          .optional()
          .describe("Optional new name for the duplicate list"),
      }),
      execute: dedupe("duplicateList", async (params) => {
        return await listService.duplicateList({
          userId,
          listName: params.listName,
          newName: params.newName,
        });
      }),
    }),
    getListStats: tool({
      description:
        "Get statistics about user's lists. Triggers: list stats, how many lists, list summary.",
      inputSchema: z.object({}),
      execute: dedupe("getListStats", async () => {
        return await listQueryService.getListStats({ userId });
      }),
    }),
  };
}
