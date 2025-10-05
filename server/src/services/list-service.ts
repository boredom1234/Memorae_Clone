import { getSupabaseClient } from "../lib/supabase";
import { ListItem } from "../models/types";
import {
  validate,
  createListSchema,
  addItemToListSchema,
  removeItemFromListSchema,
  updateListItemSchema,
  getListsSchema,
  getListItemsSchema,
  deleteListSchema,
  searchListsSchema,
  sanitizeString,
} from "../utils/validators";
import {
  handleServiceError,
  NotFoundError,
  ValidationError,
} from "../utils/errors";
import { logInfo, logError, logAudit, logPerformance } from "../utils/logger";

export class ListService {
  private supabase = getSupabaseClient();

  /**
   * Helper method to find a list by name with fuzzy matching
   * Normalizes list names by removing common words and making case-insensitive
   */
  private async findListByName(
    userId: string,
    listName: string,
  ): Promise<string | undefined> {
    const { data: lists } = await this.supabase
      .from("lists")
      .select("id, name")
      .eq("user_id", userId)
      .eq("is_archived", false);

    if (!lists || lists.length === 0) {
      return undefined;
    }

    // Normalize the search name (lowercase, remove common words like "list", "the", "my")
    const normalizeListName = (name: string) => {
      return name
        .toLowerCase()
        .replace(/\b(list|the|my)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
    };

    const searchName = normalizeListName(listName);

    // Try to find exact match first
    let matchedList = lists.find(
      (list) => normalizeListName(list.name) === searchName,
    );

    // If no exact match, try partial match
    if (!matchedList) {
      matchedList = lists.find(
        (list) =>
          normalizeListName(list.name).includes(searchName) ||
          searchName.includes(normalizeListName(list.name)),
      );
    }

    return matchedList ? matchedList.id : undefined;
  }

  async createList(params: {
    userId: string;
    name: string;
    description?: string;
    items?: string[];
    icon?: string;
    color?: string;
  }): Promise<{ success: boolean; listId: string; message: string }> {
    const startTime = Date.now();

    try {
      // Validate input
      const validatedParams = validate(createListSchema, params);

      logInfo("Creating list", { userId: params.userId, name: params.name });

      const { data: list, error } = await this.supabase
        .from("lists")
        .insert({
          user_id: validatedParams.userId,
          name: validatedParams.name,
          description: validatedParams.description,
          icon: validatedParams.icon,
          color: validatedParams.color,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (!list) {
        throw new Error("No data returned from insert operation");
      }

      // Add items if provided (with transaction-like behavior)
      if (validatedParams.items && validatedParams.items.length > 0) {
        const items = validatedParams.items.map((content, index) => ({
          list_id: list.id,
          content,
          position: index,
        }));

        const { error: itemsError } = await this.supabase
          .from("list_items")
          .insert(items);

        if (itemsError) {
          // Rollback: delete the list if items failed to insert
          await this.supabase.from("lists").delete().eq("id", list.id);
          throw new Error(`Failed to add items to list: ${itemsError.message}`);
        }
      }

      logAudit("CREATE_LIST", validatedParams.userId, "list", {
        listId: list.id,
        name: list.name,
      });
      logPerformance("createList", Date.now() - startTime);

      return {
        success: true,
        listId: list.id,
        message: `List "${params.name}" created successfully`,
      };
    } catch (error) {
      logError("Failed to create list", error, {
        userId: params.userId,
        name: params.name,
      });
      throw handleServiceError(error, "createList");
    }
  }

  async addItemToList(params: {
    userId: string;
    listId?: string;
    listName?: string;
    items: string[];
    notes?: string;
  }): Promise<{ success: boolean; addedCount: number; message: string }> {
    const startTime = Date.now();

    try {
      // Validate input
      const validatedParams = validate(addItemToListSchema, params);

      let listId = validatedParams.listId;

      // Find list by name if listId not provided
      if (!listId && validatedParams.listName) {
        listId = await this.findListByName(
          validatedParams.userId,
          validatedParams.listName,
        );

        if (!listId) {
          throw new NotFoundError("List", validatedParams.listName);
        }
      }

      if (!listId) {
        throw new ValidationError("Either listId or listName must be provided");
      }

      // Verify list belongs to user
      const { data: listCheck, error: checkError } = await this.supabase
        .from("lists")
        .select("id, user_id")
        .eq("id", listId)
        .single();

      if (checkError || !listCheck) {
        throw new NotFoundError("List", listId);
      }

      if (listCheck.user_id !== validatedParams.userId) {
        throw new ValidationError("List does not belong to user");
      }

      // Get current max position with error handling
      const { data: maxPos } = await this.supabase
        .from("list_items")
        .select("position")
        .eq("list_id", listId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();

      const startPosition = (maxPos?.position ?? -1) + 1;

      const items = validatedParams.items.map((content, index) => ({
        list_id: listId,
        content,
        position: startPosition + index,
        notes: validatedParams.notes || null,
      }));

      const { error } = await this.supabase.from("list_items").insert(items);

      if (error) {
        throw error;
      }

      logAudit("ADD_ITEMS_TO_LIST", validatedParams.userId, "list", {
        listId,
        count: items.length,
      });
      logPerformance("addItemToList", Date.now() - startTime);

      return {
        success: true,
        addedCount: items.length,
        message: `${items.length} item(s) added to list`,
      };
    } catch (error) {
      logError("Failed to add items to list", error, { userId: params.userId });
      throw handleServiceError(error, "addItemToList");
    }
  }

  async removeItemFromList(params: {
    userId: string;
    listId?: string;
    listName?: string;
    itemIds?: string[];
    itemText?: string;
  }): Promise<{ success: boolean; removedCount: number; message: string }> {
    const startTime = Date.now();

    try {
      // Validate input
      const validatedParams = validate(removeItemFromListSchema, params);

      let listId = validatedParams.listId;

      // Find list by name if listId not provided
      if (!listId && validatedParams.listName) {
        listId = await this.findListByName(
          validatedParams.userId,
          validatedParams.listName,
        );

        if (!listId) {
          throw new NotFoundError("List", validatedParams.listName);
        }
      }

      let query = this.supabase.from("list_items").delete();

      if (listId) {
        query = query.eq("list_id", listId);
      }

      if (validatedParams.itemIds) {
        query = query.in("id", validatedParams.itemIds);
      } else if (validatedParams.itemText) {
        const sanitized = sanitizeString(validatedParams.itemText);
        query = query.ilike("content", `%${sanitized}%`);
      }

      const { data, error } = await query.select();

      if (error) {
        throw error;
      }

      const removedCount = data?.length || 0;

      if (removedCount === 0) {
        throw new NotFoundError("List items");
      }

      logAudit("REMOVE_ITEMS_FROM_LIST", validatedParams.userId, "list", {
        listId,
        removedCount,
      });
      logPerformance("removeItemFromList", Date.now() - startTime);

      return {
        success: true,
        removedCount,
        message: `${removedCount} item(s) removed from list`,
      };
    } catch (error) {
      logError("Failed to remove items from list", error, {
        userId: params.userId,
      });
      throw handleServiceError(error, "removeItemFromList");
    }
  }

  async updateListItem(params: {
    itemId: string;
    newContent?: string;
    isCompleted?: boolean;
    position?: number;
  }): Promise<{ success: boolean; message: string }> {
    const startTime = Date.now();

    try {
      // Validate input
      const validatedParams = validate(updateListItemSchema, params);

      // Check if item exists
      const { data: existing, error: checkError } = await this.supabase
        .from("list_items")
        .select("id, list_id, lists(user_id)")
        .eq("id", validatedParams.itemId)
        .single();

      if (checkError || !existing) {
        throw new NotFoundError("List item", validatedParams.itemId);
      }

      const updateData: any = {};

      if (validatedParams.newContent !== undefined)
        updateData.content = validatedParams.newContent;
      if (validatedParams.isCompleted !== undefined) {
        updateData.is_completed = validatedParams.isCompleted;
        if (validatedParams.isCompleted) {
          updateData.completed_at = new Date().toISOString();
        } else {
          updateData.completed_at = null;
        }
      }
      if (validatedParams.position !== undefined)
        updateData.position = validatedParams.position;
      updateData.updated_at = new Date().toISOString();

      const { error } = await this.supabase
        .from("list_items")
        .update(updateData)
        .eq("id", validatedParams.itemId);

      if (error) {
        throw error;
      }

      const userId = (existing.lists as any)?.user_id;
      if (userId) {
        logAudit("UPDATE_LIST_ITEM", userId, "list_item", {
          itemId: validatedParams.itemId,
        });
      }
      logPerformance("updateListItem", Date.now() - startTime);

      return {
        success: true,
        message: "List item updated successfully",
      };
    } catch (error) {
      logError("Failed to update list item", error, { itemId: params.itemId });
      throw handleServiceError(error, "updateListItem");
    }
  }

  async getLists(params: {
    userId: string;
    includeItems?: boolean;
    limit?: number;
  }): Promise<{
    lists: Array<{
      id: string;
      name: string;
      itemCount: number;
      items?: Array<{ id: string; content: string; isCompleted: boolean }>;
    }>;
    total: number;
  }> {
    const startTime = Date.now();

    try {
      // Validate input
      const validatedParams = validate(getListsSchema, params);

      const { data: lists, error } = await this.supabase
        .from("lists")
        .select("*")
        .eq("user_id", validatedParams.userId)
        .eq("is_archived", false)
        .order("sort_order", { ascending: true })
        .limit(validatedParams.limit || 50);

      if (error) {
        throw error;
      }

      // Process lists with error isolation
      const result = await Promise.allSettled(
        (lists || []).map(async (list) => {
          try {
            const { count } = await this.supabase
              .from("list_items")
              .select("*", { count: "exact", head: true })
              .eq("list_id", list.id);

            let items: any[] | undefined;

            if (validatedParams.includeItems) {
              const { data: itemsData, error: itemsError } = await this.supabase
                .from("list_items")
                .select("id, content, is_completed")
                .eq("list_id", list.id)
                .order("position", { ascending: true });

              if (itemsError) {
                logError("Failed to fetch list items", itemsError, {
                  listId: list.id,
                });
                items = [];
              } else {
                items = (itemsData || []).map((item) => ({
                  id: item.id,
                  content: item.content,
                  isCompleted: item.is_completed,
                }));
              }
            }

            return {
              id: list.id,
              name: list.name,
              itemCount: count || 0,
              items,
            };
          } catch (error) {
            logError("Failed to process list", error, { listId: list.id });
            return {
              id: list.id,
              name: list.name,
              itemCount: 0,
              items: validatedParams.includeItems ? [] : undefined,
            };
          }
        }),
      );

      const successfulResults = result
        .filter(
          (r): r is PromiseFulfilledResult<any> => r.status === "fulfilled",
        )
        .map((r) => r.value);

      logPerformance("getLists", Date.now() - startTime, {
        count: successfulResults.length,
      });

      return {
        lists: successfulResults,
        total: successfulResults.length,
      };
    } catch (error) {
      logError("Failed to get lists", error, { userId: params.userId });
      throw handleServiceError(error, "getLists");
    }
  }

  async getListItems(params: {
    userId: string;
    listId?: string;
    listName?: string;
    includeCompleted?: boolean;
  }): Promise<{ listName: string; items: ListItem[]; total: number }> {
    const startTime = Date.now();

    try {
      // Validate input
      const validatedParams = validate(getListItemsSchema, params);

      let listId = validatedParams.listId;

      // Find list by name if listId not provided
      if (!listId && validatedParams.listName) {
        listId = await this.findListByName(
          validatedParams.userId,
          validatedParams.listName,
        );

        if (!listId) {
          throw new NotFoundError("List", validatedParams.listName);
        }
      }

      if (!listId) {
        throw new ValidationError("Either listId or listName must be provided");
      }

      // Get list name and verify ownership
      const { data: list, error: listError } = await this.supabase
        .from("lists")
        .select("name, user_id")
        .eq("id", listId)
        .single();

      if (listError || !list) {
        throw new NotFoundError("List", listId);
      }

      if (list.user_id !== validatedParams.userId) {
        throw new ValidationError("List does not belong to user");
      }

      let query = this.supabase
        .from("list_items")
        .select("*")
        .eq("list_id", listId);

      if (!validatedParams.includeCompleted) {
        query = query.eq("is_completed", false);
      }

      query = query.order("position", { ascending: true });

      const { data: items, error } = await query;

      if (error) {
        throw error;
      }

      logPerformance("getListItems", Date.now() - startTime, {
        count: items?.length || 0,
      });

      return {
        listName: list.name,
        items: (items || []) as ListItem[],
        total: items?.length || 0,
      };
    } catch (error) {
      logError("Failed to get list items", error, { userId: params.userId });
      throw handleServiceError(error, "getListItems");
    }
  }

  async deleteList(params: {
    userId: string;
    listId?: string;
    listName?: string;
  }): Promise<{ success: boolean; message: string }> {
    const startTime = Date.now();

    try {
      // Validate input
      const validatedParams = validate(deleteListSchema, params);

      let listId = validatedParams.listId;

      // Find list by name if listId not provided
      if (!listId && validatedParams.listName) {
        listId = await this.findListByName(
          validatedParams.userId,
          validatedParams.listName,
        );

        if (!listId) {
          throw new NotFoundError("List", validatedParams.listName);
        }
      }

      if (!listId) {
        throw new ValidationError("Either listId or listName must be provided");
      }

      // Verify list exists and belongs to user
      const { data: existing, error: checkError } = await this.supabase
        .from("lists")
        .select("id, name")
        .eq("id", listId)
        .eq("user_id", validatedParams.userId)
        .single();

      if (checkError || !existing) {
        throw new NotFoundError("List", listId);
      }

      const { error } = await this.supabase
        .from("lists")
        .delete()
        .eq("id", listId)
        .eq("user_id", validatedParams.userId);

      if (error) {
        throw error;
      }

      logAudit("DELETE_LIST", validatedParams.userId, "list", {
        listId,
        name: existing.name,
      });
      logPerformance("deleteList", Date.now() - startTime);

      return {
        success: true,
        message: "List deleted successfully",
      };
    } catch (error) {
      logError("Failed to delete list", error, { userId: params.userId });
      throw handleServiceError(error, "deleteList");
    }
  }

  async searchLists(params: {
    userId: string;
    query: string;
    searchIn?: "list-names" | "items" | "both";
    limit?: number;
  }): Promise<{
    results: Array<{
      type: "list" | "item";
      listId: string;
      listName: string;
      itemId?: string;
      itemContent?: string;
      relevanceScore: number;
    }>;
    total: number;
  }> {
    const startTime = Date.now();

    try {
      // Validate input
      const validatedParams = validate(searchListsSchema, params);

      // Sanitize search query
      const sanitizedQuery = sanitizeString(validatedParams.query);

      const results: any[] = [];
      const searchIn = validatedParams.searchIn || "both";

      // Search in list names
      if (searchIn === "list-names" || searchIn === "both") {
        try {
          const { data: lists, error } = await this.supabase
            .from("lists")
            .select("id, name")
            .eq("user_id", validatedParams.userId)
            .ilike("name", `%${sanitizedQuery}%`)
            .limit(validatedParams.limit || 20);

          if (error) {
            logError("Failed to search list names", error, {
              userId: validatedParams.userId,
            });
          } else if (lists) {
            results.push(
              ...lists.map((list) => ({
                type: "list" as const,
                listId: list.id,
                listName: list.name,
                relevanceScore: 1.0,
              })),
            );
          }
        } catch (error) {
          logError("Error searching list names", error, {
            userId: validatedParams.userId,
          });
        }
      }

      // Search in list items
      if (searchIn === "items" || searchIn === "both") {
        try {
          const { data: items, error } = await this.supabase
            .from("list_items")
            .select("id, content, list_id, lists!inner(name, user_id)")
            .eq("lists.user_id", validatedParams.userId)
            .ilike("content", `%${sanitizedQuery}%`)
            .limit(validatedParams.limit || 20);

          if (error) {
            logError("Failed to search list items", error, {
              userId: validatedParams.userId,
            });
          } else if (items) {
            results.push(
              ...items.map((item: any) => ({
                type: "item" as const,
                listId: item.list_id,
                listName: item.lists?.name || "",
                itemId: item.id,
                itemContent: item.content,
                relevanceScore: 1.0,
              })),
            );
          }
        } catch (error) {
          logError("Error searching list items", error, {
            userId: validatedParams.userId,
          });
        }
      }

      logPerformance("searchLists", Date.now() - startTime, {
        count: results.length,
      });

      return {
        results: results.slice(0, validatedParams.limit || 20),
        total: results.length,
      };
    } catch (error) {
      logError("Failed to search lists", error, { userId: params.userId });
      throw handleServiceError(error, "searchLists");
    }
  }
}
