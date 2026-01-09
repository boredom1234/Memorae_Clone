import { tool } from "ai";
import { z } from "zod";
import { DedupeFunction, ToolServices } from "../tool-definitions";
export function createListAITools(
  userId: string,
  services: ToolServices,
  dedupe: DedupeFunction
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
            "Description of the list - ALWAYS try to infer purpose from context (e.g., 'Shopping list for groceries', 'Tasks for work project')"
          ),
        items: z.array(z.string()).optional().describe("Initial items to add"),
        icon: z
          .string()
          .optional()
          .describe(
            "Icon/emoji for the list - infer from list type (🛒 for shopping, ✅ for todo, 📝 for notes, 🎯 for goals, etc.)"
          ),
        color: z
          .string()
          .optional()
          .describe(
            "Color for the list - suggest based on category (blue for work, green for shopping, red for urgent, etc.)"
          ),
      }),
      execute: dedupe("createList", async (params) => {
        if (
          !params.name ||
          typeof params.name !== "string" ||
          params.name.trim().length === 0
        ) {
          throw new Error("List name is required and cannot be empty.");
        }
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
        if (
          !params.items ||
          !Array.isArray(params.items) ||
          params.items.length === 0
        ) {
          throw new Error("At least one item is required to add to the list.");
        }
        const invalidItems = params.items.filter(
          (item) =>
            !item || typeof item !== "string" || item.trim().length === 0
        );
        if (invalidItems.length > 0) {
          throw new Error("All items must be non-empty strings.");
        }
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
              listName = match[1].charAt(0).toUpperCase() + match[1].slice(1);
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
                ? `Added ${totalAdded} of ${
                    params.items.length
                  } items. Errors: ${errors.join("; ")}`
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
            "Whether to include archived lists (default: false, only active lists)"
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
    bulkRemoveItemsExcept: tool({
      description:
        "Remove ALL items from a list EXCEPT the ones specified. Use when user says 'delete all except X', 'remove everything but Y', 'clear list except Z'. This is the PREFERRED tool for bulk removal operations.",
      inputSchema: z.object({
        listName: z.string().describe("Name of the list"),
        keepItems: z
          .array(z.string())
          .describe(
            "Items to KEEP (everything else will be removed). Use item names/text, not IDs."
          ),
      }),
      execute: dedupe("bulkRemoveItemsExcept", async (params) => {
        // First, get all items in the list
        const listItems = await listQueryService.getListItems({
          userId,
          listName: params.listName,
          includeCompleted: true,
        });

        if (!listItems.items || listItems.items.length === 0) {
          return {
            success: true,
            removedCount: 0,
            message: "List is already empty.",
          };
        }

        // Normalize keep items for comparison
        const keepItemsLower = params.keepItems.map((item) =>
          item.toLowerCase().trim()
        );

        // Find items to remove (everything NOT in keepItems)
        const itemsToRemove = listItems.items.filter((item) => {
          const contentLower = item.content.toLowerCase().trim();
          return !keepItemsLower.some(
            (keep) => contentLower.includes(keep) || keep.includes(contentLower)
          );
        });

        if (itemsToRemove.length === 0) {
          return {
            success: true,
            removedCount: 0,
            keptCount: listItems.items.length,
            message: `No items to remove. All ${listItems.items.length} items match your keep list.`,
          };
        }

        // Remove each item
        let removedCount = 0;
        const errors: string[] = [];

        for (const item of itemsToRemove) {
          try {
            await listItemService.removeItemFromList({
              userId,
              listName: params.listName,
              itemText: item.content,
            });
            removedCount++;
          } catch (error: any) {
            errors.push(`${item.content}: ${error.message}`);
          }
        }

        const keptCount = listItems.items.length - removedCount;

        return {
          success: errors.length === 0,
          removedCount,
          keptCount,
          keptItems: params.keepItems,
          message:
            errors.length > 0
              ? `Removed ${removedCount} items, kept ${keptCount}. Errors: ${errors.join(
                  "; "
                )}`
              : `Successfully removed ${removedCount} items. Kept ${keptCount} items (${params.keepItems.join(
                  ", "
                )}).`,
          errors: errors.length > 0 ? errors : undefined,
        };
      }),
    }),
    bulkDeleteLists: tool({
      description:
        "Delete multiple lists at once. Use when user says 'delete these lists', 'delete Shopping and Tasks lists'. This deletes entire lists, not just their items.",
      inputSchema: z.object({
        listNames: z.array(z.string()).describe("Names of the lists to delete"),
      }),
      execute: dedupe("bulkDeleteLists", async (params) => {
        if (!params.listNames || params.listNames.length === 0) {
          throw new Error("Please specify which lists to delete.");
        }

        let deletedCount = 0;
        const errors: string[] = [];
        const deletedLists: string[] = [];

        for (const listName of params.listNames) {
          try {
            await listService.deleteList({
              userId,
              listName,
            });
            deletedCount++;
            deletedLists.push(listName);
          } catch (error: any) {
            errors.push(`${listName}: ${error.message}`);
          }
        }

        return {
          success: errors.length === 0,
          deletedCount,
          deletedLists,
          message:
            errors.length > 0
              ? `Deleted ${deletedCount} lists. Errors: ${errors.join("; ")}`
              : `Successfully deleted ${deletedCount} lists: ${deletedLists.join(
                  ", "
                )}.`,
          errors: errors.length > 0 ? errors : undefined,
        };
      }),
    }),
    bulkDeleteListsExcept: tool({
      description:
        "Delete ALL lists EXCEPT the ones specified. Use when user says 'delete all lists except Work', 'remove every list but Shopping'.",
      inputSchema: z.object({
        keepNames: z
          .array(z.string())
          .describe(
            "Names of the lists to KEEP (everything else will be deleted)"
          ),
      }),
      execute: dedupe("bulkDeleteListsExcept", async (params) => {
        // Fetch all lists
        const allLists = await listQueryService.getLists({ userId });

        if (!allLists.lists || allLists.lists.length === 0) {
          return {
            success: true,
            deletedCount: 0,
            message: "No lists to delete.",
          };
        }

        // Normalize keep names for comparison
        const keepNamesLower = params.keepNames.map((n) =>
          n.toLowerCase().trim()
        );

        // Find lists to delete (everything NOT in keepNames)
        const listsToDelete = allLists.lists.filter((list: any) => {
          const nameLower = (list.name || "").toLowerCase().trim();
          return !keepNamesLower.some(
            (keep) => nameLower.includes(keep) || keep.includes(nameLower)
          );
        });

        if (listsToDelete.length === 0) {
          return {
            success: true,
            deletedCount: 0,
            keptCount: allLists.lists.length,
            message: `No lists to delete. All ${allLists.lists.length} lists match your keep list.`,
          };
        }

        // Delete each list
        let deletedCount = 0;
        const errors: string[] = [];
        const deletedLists: string[] = [];

        for (const list of listsToDelete) {
          try {
            await listService.deleteList({
              userId,
              listName: list.name,
            });
            deletedCount++;
            deletedLists.push(list.name);
          } catch (error: any) {
            errors.push(`${list.name}: ${error.message}`);
          }
        }

        const keptCount = allLists.lists.length - deletedCount;

        return {
          success: errors.length === 0,
          deletedCount,
          keptCount,
          deletedLists,
          keptNames: params.keepNames,
          message:
            errors.length > 0
              ? `Deleted ${deletedCount} lists, kept ${keptCount}. Errors: ${errors.join(
                  "; "
                )}`
              : `Successfully deleted ${deletedCount} lists. Kept ${keptCount} lists (${params.keepNames.join(
                  ", "
                )}).`,
          errors: errors.length > 0 ? errors : undefined,
        };
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
        if (
          !params.listName ||
          typeof params.listName !== "string" ||
          params.listName.trim().length === 0
        ) {
          throw new Error("List name is required to find the item to update.");
        }
        if (
          !params.itemText ||
          typeof params.itemText !== "string" ||
          params.itemText.trim().length === 0
        ) {
          throw new Error("Item text is required to find the item to update.");
        }
        const listItems = await listQueryService.getListItems({
          userId,
          listName: params.listName,
          includeCompleted: true,
        });
        const item = listItems.items.find((i) =>
          i.content.toLowerCase().includes(params.itemText.toLowerCase())
        );
        if (!item) {
          throw new Error(
            `Could not find item "${params.itemText}" in list "${params.listName}"`
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
    renameList: tool({
      description:
        "Rename a list by id or by name. Use when user says 'rename X list to Y'.",
      inputSchema: z.object({
        listId: z.string().optional().describe("List ID"),
        listName: z.string().optional().describe("Current list name"),
        newName: z.string().describe("New name for the list"),
      }),
      execute: dedupe("renameList", async (params) => {
        return await listService.renameList({
          userId,
          listId: params.listId,
          listName: params.listName,
          newName: params.newName,
        });
      }),
    }),
    mergeLists: tool({
      description:
        "Merge all items from a source list into a target list. Optionally delete the source after merge.",
      inputSchema: z.object({
        sourceListId: z.string().optional(),
        sourceListName: z.string().optional(),
        targetListId: z.string().optional(),
        targetListName: z.string().optional(),
        deleteSource: z
          .boolean()
          .optional()
          .describe("Delete source list after merge"),
      }),
      execute: dedupe("mergeLists", async (params) => {
        return await listService.mergeLists({
          userId,
          sourceListId: params.sourceListId,
          sourceListName: params.sourceListName,
          targetListId: params.targetListId,
          targetListName: params.targetListName,
          deleteSource: params.deleteSource || false,
        });
      }),
    }),
    batchAddItemsToList: tool({
      description:
        "Add many items to a list in batches (idempotent by tool dedupe).",
      inputSchema: z.object({
        listName: z.string().describe("Name of the list"),
        items: z.array(z.string()).describe("Items to add (can be 100+)"),
      }),
      execute: dedupe("batchAddItemsToList", async (params) => {
        const chunks: string[][] = [];
        for (let i = 0; i < params.items.length; i += 50) {
          chunks.push(params.items.slice(i, i + 50));
        }
        let totalAdded = 0;
        const errors: string[] = [];
        for (let i = 0; i < chunks.length; i++) {
          try {
            const res = await listItemService.addItemToList({
              userId,
              listName: params.listName,
              items: chunks[i],
            });
            totalAdded += res.addedCount || chunks[i].length;
          } catch (e: any) {
            errors.push(`Batch ${i + 1}: ${e?.message || "unknown error"}`);
          }
        }
        return {
          success: errors.length === 0,
          addedCount: totalAdded,
          totalItems: params.items.length,
          batches: chunks.length,
          message:
            errors.length > 0
              ? `Added ${totalAdded} of ${
                  params.items.length
                } items. Errors: ${errors.join("; ")}`
              : `Successfully added all ${totalAdded} items in ${chunks.length} batches.`,
          errors: errors.length ? errors : undefined,
        };
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
