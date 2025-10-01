import { getSupabaseClient } from '../lib/supabase';
import { List, ListItem } from '../models/types';

export class ListService {
  private supabase = getSupabaseClient();

  async createList(params: {
    userId: string;
    name: string;
    description?: string;
    items?: string[];
  }): Promise<{ success: boolean; listId: string; message: string }> {
    const { data: list, error } = await this.supabase
      .from('lists')
      .insert({
        user_id: params.userId,
        name: params.name,
        description: params.description,
      })
      .select()
      .single();

    if (error) throw error;

    // Add items if provided
    if (params.items && params.items.length > 0) {
      const items = params.items.map((content, index) => ({
        list_id: list.id,
        content,
        position: index,
      }));

      await this.supabase.from('list_items').insert(items);
    }

    return {
      success: true,
      listId: list.id,
      message: `List "${params.name}" created successfully`,
    };
  }

  async addItemToList(params: {
    userId: string;
    listId?: string;
    listName?: string;
    items: string[];
  }): Promise<{ success: boolean; addedCount: number; message: string }> {
    let listId = params.listId;

    // Find list by name if listId not provided
    if (!listId && params.listName) {
      const { data: list } = await this.supabase
        .from('lists')
        .select('id')
        .eq('user_id', params.userId)
        .eq('name', params.listName)
        .single();

      if (!list) {
        throw new Error(`List "${params.listName}" not found`);
      }
      listId = list.id;
    }

    if (!listId) {
      throw new Error('Either listId or listName must be provided');
    }

    // Get current max position
    const { data: maxPos } = await this.supabase
      .from('list_items')
      .select('position')
      .eq('list_id', listId)
      .order('position', { ascending: false })
      .limit(1)
      .single();

    const startPosition = (maxPos?.position || -1) + 1;

    const items = params.items.map((content, index) => ({
      list_id: listId,
      content,
      position: startPosition + index,
    }));

    const { error } = await this.supabase.from('list_items').insert(items);

    if (error) throw error;

    return {
      success: true,
      addedCount: items.length,
      message: `${items.length} item(s) added to list`,
    };
  }

  async removeItemFromList(params: {
    userId: string;
    listId?: string;
    listName?: string;
    itemIds?: string[];
    itemText?: string;
  }): Promise<{ success: boolean; removedCount: number; message: string }> {
    let listId = params.listId;

    // Find list by name if listId not provided
    if (!listId && params.listName) {
      const { data: list } = await this.supabase
        .from('lists')
        .select('id')
        .eq('user_id', params.userId)
        .eq('name', params.listName)
        .single();

      if (!list) {
        throw new Error(`List "${params.listName}" not found`);
      }
      listId = list.id;
    }

    let query = this.supabase.from('list_items').delete();

    if (listId) {
      query = query.eq('list_id', listId);
    }

    if (params.itemIds) {
      query = query.in('id', params.itemIds);
    } else if (params.itemText) {
      query = query.ilike('content', `%${params.itemText}%`);
    }

    const { data, error } = await query.select();

    if (error) throw error;

    return {
      success: true,
      removedCount: data?.length || 0,
      message: `${data?.length || 0} item(s) removed from list`,
    };
  }

  async updateListItem(params: {
    itemId: string;
    newContent?: string;
    isCompleted?: boolean;
    position?: number;
  }): Promise<{ success: boolean; message: string }> {
    const updateData: any = {};

    if (params.newContent !== undefined) updateData.content = params.newContent;
    if (params.isCompleted !== undefined) {
      updateData.is_completed = params.isCompleted;
      if (params.isCompleted) {
        updateData.completed_at = new Date().toISOString();
      }
    }
    if (params.position !== undefined) updateData.position = params.position;

    const { error } = await this.supabase.from('list_items').update(updateData).eq('id', params.itemId);

    if (error) throw error;

    return {
      success: true,
      message: 'List item updated successfully',
    };
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
    const { data: lists, error } = await this.supabase
      .from('lists')
      .select('*')
      .eq('user_id', params.userId)
      .eq('is_archived', false)
      .order('sort_order', { ascending: true })
      .limit(params.limit || 50);

    if (error) throw error;

    const result = await Promise.all(
      (lists || []).map(async (list) => {
        const { count } = await this.supabase
          .from('list_items')
          .select('*', { count: 'exact', head: true })
          .eq('list_id', list.id);

        let items: any[] | undefined;

        if (params.includeItems) {
          const { data: itemsData } = await this.supabase
            .from('list_items')
            .select('id, content, is_completed')
            .eq('list_id', list.id)
            .order('position', { ascending: true });

          items = (itemsData || []).map((item) => ({
            id: item.id,
            content: item.content,
            isCompleted: item.is_completed,
          }));
        }

        return {
          id: list.id,
          name: list.name,
          itemCount: count || 0,
          items,
        };
      })
    );

    return {
      lists: result,
      total: result.length,
    };
  }

  async getListItems(params: {
    userId: string;
    listId?: string;
    listName?: string;
    includeCompleted?: boolean;
  }): Promise<{
    listName: string;
    items: Array<{
      id: string;
      content: string;
      isCompleted: boolean;
      position: number;
    }>;
    total: number;
  }> {
    let listId = params.listId;

    // Find list by name if listId not provided
    if (!listId && params.listName) {
      const { data: list } = await this.supabase
        .from('lists')
        .select('id, name')
        .eq('user_id', params.userId)
        .eq('name', params.listName)
        .single();

      if (!list) {
        throw new Error(`List "${params.listName}" not found`);
      }
      listId = list.id;
    }

    if (!listId) {
      throw new Error('Either listId or listName must be provided');
    }

    // Get list name
    const { data: list } = await this.supabase.from('lists').select('name').eq('id', listId).single();

    let query = this.supabase.from('list_items').select('*').eq('list_id', listId);

    if (!params.includeCompleted) {
      query = query.eq('is_completed', false);
    }

    query = query.order('position', { ascending: true });

    const { data: items, error } = await query;

    if (error) throw error;

    return {
      listName: list?.name || '',
      items: (items || []).map((item) => ({
        id: item.id,
        content: item.content,
        isCompleted: item.is_completed,
        position: item.position,
      })),
      total: items?.length || 0,
    };
  }

  async deleteList(params: {
    userId: string;
    listId?: string;
    listName?: string;
  }): Promise<{ success: boolean; message: string }> {
    let listId = params.listId;

    // Find list by name if listId not provided
    if (!listId && params.listName) {
      const { data: list } = await this.supabase
        .from('lists')
        .select('id')
        .eq('user_id', params.userId)
        .eq('name', params.listName)
        .single();

      if (!list) {
        throw new Error(`List "${params.listName}" not found`);
      }
      listId = list.id;
    }

    if (!listId) {
      throw new Error('Either listId or listName must be provided');
    }

    const { error } = await this.supabase.from('lists').delete().eq('id', listId).eq('user_id', params.userId);

    if (error) throw error;

    return {
      success: true,
      message: 'List deleted successfully',
    };
  }

  async searchLists(params: {
    userId: string;
    query: string;
    searchIn?: 'list-names' | 'items' | 'both';
    limit?: number;
  }): Promise<{
    results: Array<{
      type: 'list' | 'item';
      listId: string;
      listName: string;
      itemId?: string;
      itemContent?: string;
      relevanceScore: number;
    }>;
    total: number;
  }> {
    const results: any[] = [];
    const searchIn = params.searchIn || 'both';

    // Search in list names
    if (searchIn === 'list-names' || searchIn === 'both') {
      const { data: lists } = await this.supabase
        .from('lists')
        .select('id, name')
        .eq('user_id', params.userId)
        .ilike('name', `%${params.query}%`)
        .limit(params.limit || 20);

      if (lists) {
        results.push(
          ...lists.map((list) => ({
            type: 'list' as const,
            listId: list.id,
            listName: list.name,
            relevanceScore: 1.0,
          }))
        );
      }
    }

    // Search in list items
    if (searchIn === 'items' || searchIn === 'both') {
      const { data: items } = await this.supabase
        .from('list_items')
        .select('id, content, list_id, lists(name)')
        .ilike('content', `%${params.query}%`)
        .limit(params.limit || 20);

      if (items) {
        results.push(
          ...items.map((item: any) => ({
            type: 'item' as const,
            listId: item.list_id,
            listName: item.lists?.name || '',
            itemId: item.id,
            itemContent: item.content,
            relevanceScore: 1.0,
          }))
        );
      }
    }

    return {
      results: results.slice(0, params.limit || 20),
      total: results.length,
    };
  }
}
