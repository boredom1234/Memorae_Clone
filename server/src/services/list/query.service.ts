import { getSupabaseClient } from "../../lib/supabase";
import { ListItem } from "./types";
import {
  validate,
  getListsSchema,
  getListItemsSchema,
  searchListsSchema,
  getListStatsSchema,
  sanitizeString,
} from "../../utils/validators";
import {
  handleServiceError,
  NotFoundError,
  ValidationError,
} from "../../utils/errors";
import { logError, logPerformance } from "../../utils/logger";
import { ListService } from "./list.service";
export class ListQueryService {
  private supabase = getSupabaseClient();
  private listService = new ListService();
  async getLists(params: {
    userId: string;
    includeItems?: boolean;
    includeArchived?: boolean;
    limit?: number;
  }): Promise<{
    lists: Array<{
      id: string;
      name: string;
      description?: string;
      icon?: string;
      color?: string;
      itemCount?: number;
      items?: ListItem[];
      isArchived?: boolean;
    }>;
    total: number;
  }> {
    const startTime = Date.now();
    try {
      const validatedParams = validate(getListsSchema, params);
      let query = this.supabase
        .from("lists")
        .select("*")
        .eq("user_id", validatedParams.userId);
      if (!validatedParams.includeArchived) {
        query = query.eq("is_archived", false);
      }
      const { data: lists, error } = await query
        .order("sort_order", { ascending: true })
        .limit(validatedParams.limit || 50);
      if (error) {
        throw error;
      }
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
              description: list.description,
              icon: list.icon,
              color: list.color,
              itemCount: count || 0,
              items,
              isArchived: list.is_archived || false,
            };
          } catch (error) {
            logError("Failed to process list", error, { listId: list.id });
            return {
              id: list.id,
              name: list.name,
              description: list.description,
              icon: list.icon,
              color: list.color,
              itemCount: 0,
              items: validatedParams.includeItems ? [] : undefined,
              isArchived: list.is_archived || false,
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
  }): Promise<{
    listName: string;
    items: ListItem[];
    total: number;
  }> {
    const startTime = Date.now();
    try {
      const validatedParams = validate(getListItemsSchema, params);
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
      const validatedParams = validate(searchListsSchema, params);
      const sanitizedQuery = sanitizeString(validatedParams.query);
      const results: any[] = [];
      const searchIn = validatedParams.searchIn || "both";
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
  async getListStats(params: { userId: string }): Promise<{
    totalLists: number;
    totalItems: number;
    completedItems: number;
    completionRate: number;
    mostActiveList: {
      id: string;
      name: string;
      itemCount: number;
    } | null;
    recentlyUpdated: Array<{
      id: string;
      name: string;
      updatedAt: string;
    }>;
  }> {
    const startTime = Date.now();
    try {
      const validatedParams = validate(getListStatsSchema, params);
      const { count: totalLists } = await this.supabase
        .from("lists")
        .select("*", { count: "exact", head: true })
        .eq("user_id", validatedParams.userId)
        .eq("is_archived", false);
      const { data: lists } = await this.supabase
        .from("lists")
        .select("id, name, updated_at")
        .eq("user_id", validatedParams.userId)
        .eq("is_archived", false);
      if (!lists || lists.length === 0) {
        return {
          totalLists: 0,
          totalItems: 0,
          completedItems: 0,
          completionRate: 0,
          mostActiveList: null,
          recentlyUpdated: [],
        };
      }
      const listIds = lists.map((l) => l.id);
      const { count: totalItems } = await this.supabase
        .from("list_items")
        .select("*", { count: "exact", head: true })
        .in("list_id", listIds);
      const { count: completedItems } = await this.supabase
        .from("list_items")
        .select("*", { count: "exact", head: true })
        .in("list_id", listIds)
        .eq("is_completed", true);
      const completionRate =
        totalItems && totalItems > 0
          ? Math.round(((completedItems || 0) / totalItems) * 100)
          : 0;
      const listItemCounts = await Promise.all(
        lists.map(async (list) => {
          const { count } = await this.supabase
            .from("list_items")
            .select("*", { count: "exact", head: true })
            .eq("list_id", list.id);
          return { id: list.id, name: list.name, itemCount: count || 0 };
        }),
      );
      const mostActiveList =
        listItemCounts.length > 0
          ? listItemCounts.reduce((max, current) =>
              current.itemCount > max.itemCount ? current : max,
            )
          : null;
      const recentlyUpdated = lists
        .sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        )
        .slice(0, 5)
        .map((l) => ({
          id: l.id,
          name: l.name,
          updatedAt: l.updated_at,
        }));
      logPerformance("getListStats", Date.now() - startTime);
      return {
        totalLists: totalLists || 0,
        totalItems: totalItems || 0,
        completedItems: completedItems || 0,
        completionRate,
        mostActiveList:
          mostActiveList && mostActiveList.itemCount > 0
            ? mostActiveList
            : null,
        recentlyUpdated,
      };
    } catch (error) {
      logError("Failed to get list stats", error, { userId: params.userId });
      throw handleServiceError(error, "getListStats");
    }
  }
}
