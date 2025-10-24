import { getSupabaseClient } from "../../lib/supabase";
import {
  validate,
  addItemToListSchema,
  removeItemFromListSchema,
  updateListItemSchema,
  bulkCompleteItemsSchema,
  clearCompletedItemsSchema,
} from "../../utils/validators";
import {
  handleServiceError,
  NotFoundError,
  ValidationError,
} from "../../utils/errors";
import {
  logInfo,
  logError,
  logAudit,
  logPerformance,
} from "../../utils/logger";
import { ListService } from "./list.service";
import { sanitizeString } from "../../utils/validators";
export class ListItemService {
  private supabase = getSupabaseClient();
  private listService = new ListService();
  async addItemToList(params: {
    userId: string;
    listId?: string;
    listName?: string;
    items: string[];
    notes?: string;
  }): Promise<{
    success: boolean;
    addedCount: number;
    message: string;
  }> {
    const startTime = Date.now();
    try {
      const validatedParams = validate(addItemToListSchema, params);
      let listId = validatedParams.listId;
      if (!listId && validatedParams.listName) {
        listId = await this.listService.findListByName(
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
  }): Promise<{
    success: boolean;
    removedCount: number;
    message: string;
  }> {
    const startTime = Date.now();
    try {
      const validatedParams = validate(removeItemFromListSchema, params);
      let listId = validatedParams.listId;
      if (!listId && validatedParams.listName) {
        listId = await this.listService.findListByName(
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
  }): Promise<{
    success: boolean;
    message: string;
  }> {
    const startTime = Date.now();
    try {
      const validatedParams = validate(updateListItemSchema, params);
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
  async bulkCompleteItems(params: {
    userId: string;
    listId?: string;
    listName?: string;
    itemIds: string[];
  }): Promise<{
    success: boolean;
    completedCount: number;
    message: string;
  }> {
    const startTime = Date.now();
    try {
      const validatedParams = validate(bulkCompleteItemsSchema, params);
      let listId = validatedParams.listId;
      if (!listId && validatedParams.listName) {
        listId = await this.listService.findListByName(
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
      const { data, error } = await this.supabase
        .from("list_items")
        .update({
          is_completed: true,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("list_id", listId)
        .in("id", validatedParams.itemIds)
        .select();
      if (error) {
        throw error;
      }
      const completedCount = data?.length || 0;
      logAudit("BULK_COMPLETE_ITEMS", validatedParams.userId, "list", {
        listId,
        completedCount,
      });
      logPerformance("bulkCompleteItems", Date.now() - startTime);
      return {
        success: true,
        completedCount,
        message: `${completedCount} item(s) marked as completed`,
      };
    } catch (error) {
      logError("Failed to bulk complete items", error, {
        userId: params.userId,
      });
      throw handleServiceError(error, "bulkCompleteItems");
    }
  }
  async clearCompletedItems(params: {
    userId: string;
    listId?: string;
    listName?: string;
  }): Promise<{
    success: boolean;
    deletedCount: number;
    message: string;
  }> {
    const startTime = Date.now();
    try {
      const validatedParams = validate(clearCompletedItemsSchema, params);
      let listId = validatedParams.listId;
      if (!listId && validatedParams.listName) {
        listId = await this.listService.findListByName(
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
      const { data, error } = await this.supabase
        .from("list_items")
        .delete()
        .eq("list_id", listId)
        .eq("is_completed", true)
        .select();
      if (error) {
        throw error;
      }
      const deletedCount = data?.length || 0;
      logAudit("CLEAR_COMPLETED_ITEMS", validatedParams.userId, "list", {
        listId,
        deletedCount,
      });
      logPerformance("clearCompletedItems", Date.now() - startTime);
      return {
        success: true,
        deletedCount,
        message: `${deletedCount} completed item(s) removed`,
      };
    } catch (error) {
      logError("Failed to clear completed items", error, {
        userId: params.userId,
      });
      throw handleServiceError(error, "clearCompletedItems");
    }
  }
  async moveItemToList(params: {
    itemId: string;
    targetListId: string;
  }): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const { data: item, error: itemError } = await this.supabase
        .from("list_items")
        .select("id, list_id")
        .eq("id", params.itemId)
        .single();
      if (itemError || !item)
        throw new NotFoundError("List item", params.itemId);
      const { data: targetList, error: listError } = await this.supabase
        .from("lists")
        .select("id")
        .eq("id", params.targetListId)
        .single();
      if (listError || !targetList)
        throw new NotFoundError("Target list", params.targetListId);
      const { data: maxPos } = await this.supabase
        .from("list_items")
        .select("position")
        .eq("list_id", params.targetListId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const newPosition = (maxPos?.position ?? -1) + 1;
      const { error } = await this.supabase
        .from("list_items")
        .update({
          list_id: params.targetListId,
          position: newPosition,
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.itemId);
      if (error) throw error;
      return { success: true, message: "Item moved successfully" };
    } catch (error) {
      logError("Failed to move item", error, { itemId: params.itemId });
      throw handleServiceError(error, "moveItemToList");
    }
  }
  async reorderListItems(params: {
    userId: string;
    listId: string;
    orderedItemIds: string[];
  }): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const { data: listCheck, error: checkError } = await this.supabase
        .from("lists")
        .select("id, user_id")
        .eq("id", params.listId)
        .single();
      if (checkError || !listCheck)
        throw new NotFoundError("List", params.listId);
      if (listCheck.user_id !== params.userId)
        throw new ValidationError("List does not belong to user");
      for (let i = 0; i < params.orderedItemIds.length; i++) {
        await this.supabase
          .from("list_items")
          .update({ position: i, updated_at: new Date().toISOString() })
          .eq("id", params.orderedItemIds[i])
          .eq("list_id", params.listId);
      }
      return { success: true, message: "Items reordered successfully" };
    } catch (error) {
      logError("Failed to reorder items", error, { listId: params.listId });
      throw handleServiceError(error, "reorderListItems");
    }
  }
}
