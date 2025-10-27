import { getSupabaseClient } from "../../lib/supabase";
import {
  validate,
  createListSchema,
  deleteListSchema,
  archiveListSchema,
  duplicateListSchema,
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
export class ListService {
  private supabase = getSupabaseClient();
  public async findListByName(
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
    const normalizeListName = (name: string) => {
      return name
        .toLowerCase()
        .replace(/\b(list|the|my)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
    };
    const searchName = normalizeListName(listName);
    let matchedList = lists.find(
      (list) => normalizeListName(list.name) === searchName,
    );
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
  }): Promise<{
    success: boolean;
    listId: string;
    message: string;
  }> {
    const startTime = Date.now();
    try {
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
  async deleteList(params: {
    userId: string;
    listId?: string;
    listName?: string;
  }): Promise<{
    success: boolean;
    message: string;
  }> {
    const startTime = Date.now();
    try {
      const validatedParams = validate(deleteListSchema, params);
      let listId = validatedParams.listId;
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
  async archiveList(params: {
    userId: string;
    listId?: string;
    listName?: string;
  }): Promise<{
    success: boolean;
    message: string;
  }> {
    const startTime = Date.now();
    try {
      const validatedParams = validate(archiveListSchema, params);
      let listId = validatedParams.listId;
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
        .update({
          is_archived: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", listId)
        .eq("user_id", validatedParams.userId);
      if (error) {
        throw error;
      }
      logAudit("ARCHIVE_LIST", validatedParams.userId, "list", {
        listId,
        name: existing.name,
      });
      logPerformance("archiveList", Date.now() - startTime);
      return {
        success: true,
        message: `List "${existing.name}" archived successfully`,
      };
    } catch (error) {
      logError("Failed to archive list", error, { userId: params.userId });
      throw handleServiceError(error, "archiveList");
    }
  }
  async duplicateList(params: {
    userId: string;
    listId?: string;
    listName?: string;
    newName?: string;
  }): Promise<{
    success: boolean;
    listId: string;
    message: string;
  }> {
    const startTime = Date.now();
    try {
      const validatedParams = validate(duplicateListSchema, params);
      let listId = validatedParams.listId;
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
      const { data: originalList, error: listError } = await this.supabase
        .from("lists")
        .select("*")
        .eq("id", listId)
        .eq("user_id", validatedParams.userId)
        .single();
      if (listError || !originalList) {
        throw new NotFoundError("List", listId);
      }
      const newName = validatedParams.newName || `${originalList.name} (Copy)`;
      const { data: newList, error: createError } = await this.supabase
        .from("lists")
        .insert({
          user_id: validatedParams.userId,
          name: newName,
          description: originalList.description,
          icon: originalList.icon,
          color: originalList.color,
          is_archived: false,
          sort_order: originalList.sort_order,
        })
        .select()
        .single();
      if (createError || !newList) {
        throw createError || new Error("Failed to create duplicate list");
      }
      const { data: originalItems, error: itemsError } = await this.supabase
        .from("list_items")
        .select("*")
        .eq("list_id", listId)
        .order("position", { ascending: true });
      if (itemsError) {
        await this.supabase.from("lists").delete().eq("id", newList.id);
        throw itemsError;
      }
      if (originalItems && originalItems.length > 0) {
        const newItems = originalItems.map((item) => ({
          list_id: newList.id,
          content: item.content,
          notes: item.notes,
          is_completed: false,
          position: item.position,
        }));
        const { error: insertItemsError } = await this.supabase
          .from("list_items")
          .insert(newItems);
        if (insertItemsError) {
          await this.supabase.from("lists").delete().eq("id", newList.id);
          throw insertItemsError;
        }
      }
      logAudit("DUPLICATE_LIST", validatedParams.userId, "list", {
        originalListId: listId,
        newListId: newList.id,
        name: newName,
      });
      logPerformance("duplicateList", Date.now() - startTime);
      return {
        success: true,
        listId: newList.id,
        message: `List duplicated as "${newName}"`,
      };
    } catch (error) {
      logError("Failed to duplicate list", error, { userId: params.userId });
      throw handleServiceError(error, "duplicateList");
    }
  }
  async renameList(params: {
    userId: string;
    listId?: string;
    listName?: string;
    newName: string;
  }): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      if (!params.newName || params.newName.trim().length === 0) {
        throw new ValidationError("New name cannot be empty");
      }
      let listId = params.listId;
      if (!listId && params.listName) {
        listId = await this.findListByName(params.userId, params.listName);
        if (!listId) throw new NotFoundError("List", params.listName);
      }
      if (!listId)
        throw new ValidationError("Either listId or listName must be provided");
      const { data: existing, error: checkError } = await this.supabase
        .from("lists")
        .select("id, user_id")
        .eq("id", listId)
        .single();
      if (checkError || !existing) throw new NotFoundError("List", listId);
      if (existing.user_id !== params.userId)
        throw new ValidationError("List does not belong to user");
      const { error } = await this.supabase
        .from("lists")
        .update({
          name: params.newName.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", listId)
        .eq("user_id", params.userId);
      if (error) throw error;
      return { success: true, message: `List renamed to "${params.newName}"` };
    } catch (error) {
      logError("Failed to rename list", error, params);
      throw handleServiceError(error, "renameList");
    }
  }
  async mergeLists(params: {
    userId: string;
    sourceListId?: string;
    sourceListName?: string;
    targetListId?: string;
    targetListName?: string;
    deleteSource?: boolean;
  }): Promise<{
    success: boolean;
    message: string;
    targetListId: string;
    movedCount: number;
  }> {
    try {
      let sourceId = params.sourceListId;
      if (!sourceId && params.sourceListName) {
        sourceId = await this.findListByName(
          params.userId,
          params.sourceListName,
        );
        if (!sourceId) throw new NotFoundError("List", params.sourceListName);
      }
      let targetId = params.targetListId;
      if (!targetId && params.targetListName) {
        targetId = await this.findListByName(
          params.userId,
          params.targetListName,
        );
        if (!targetId) throw new NotFoundError("List", params.targetListName);
      }
      if (!sourceId || !targetId) {
        throw new ValidationError(
          "Both source and target lists must be specified",
        );
      }
      if (sourceId === targetId) {
        throw new ValidationError("Source and target lists cannot be the same");
      }
      const { data: targetMax } = await this.supabase
        .from("list_items")
        .select("position")
        .eq("list_id", targetId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      let nextPos = (targetMax?.position ?? -1) + 1;
      const { data: sourceItems, error: srcErr } = await this.supabase
        .from("list_items")
        .select("id, content, notes, is_completed, position")
        .eq("list_id", sourceId)
        .order("position", { ascending: true });
      if (srcErr) throw srcErr;
      let movedCount = 0;
      if (sourceItems && sourceItems.length > 0) {
        const newItems = sourceItems.map((it) => ({
          list_id: targetId!,
          content: it.content,
          notes: it.notes,
          is_completed: it.is_completed,
          position: nextPos++,
          updated_at: new Date().toISOString(),
        }));
        const { error: insertErr } = await this.supabase
          .from("list_items")
          .insert(newItems);
        if (insertErr) throw insertErr;
        movedCount = newItems.length;
      }
      if (params.deleteSource) {
        const { error: delErr } = await this.supabase
          .from("lists")
          .delete()
          .eq("id", sourceId)
          .eq("user_id", params.userId);
        if (delErr) throw delErr;
      }
      return {
        success: true,
        message: `Merged ${movedCount} item(s) into target list`,
        targetListId: targetId,
        movedCount,
      };
    } catch (error) {
      logError("Failed to merge lists", error, params);
      throw handleServiceError(error, "mergeLists");
    }
  }
}
