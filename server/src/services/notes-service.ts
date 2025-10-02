import { getSupabaseClient } from "../lib/supabase";
import { AppError } from "../utils/errors";
import { logError, logInfo } from "../utils/logger";

export interface UserNote {
  id: string;
  userId: string;
  title?: string;
  content: string;
  tags?: string[];
  category: string;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteParams {
  userId: string;
  content: string;
  title?: string;
  tags?: string[];
  category?: string;
  isPinned?: boolean;
}

export interface UpdateNoteParams {
  userId: string;
  noteId: string;
  content?: string;
  title?: string;
  tags?: string[];
  category?: string;
  isPinned?: boolean;
  isArchived?: boolean;
}

export interface SearchNotesParams {
  userId: string;
  query: string;
  category?: string;
  tags?: string[];
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListNotesParams {
  userId: string;
  category?: string;
  tags?: string[];
  includeArchived?: boolean;
  onlyPinned?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: 'created' | 'updated' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export class NotesService {
  /**
   * Create a new note
   */
  async createNote(params: CreateNoteParams): Promise<UserNote> {
    try {
      logInfo("Creating note", { userId: params.userId, hasTitle: !!params.title });

      const noteData = {
        user_id: params.userId,
        content: params.content.trim(),
        title: params.title?.trim() || null,
        tags: params.tags || [],
        category: params.category || 'general',
        is_pinned: params.isPinned || false,
        is_archived: false,
      };

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('user_notes')
        .insert(noteData)
        .select()
        .single();

      if (error) {
        logError("Failed to create note", error, { userId: params.userId });
        throw new AppError("Failed to create note", 500, "CREATE_NOTE_ERROR");
      }

      logInfo("Note created successfully", { noteId: data.id, userId: params.userId });

      return this.mapDatabaseNote(data);
    } catch (error) {
      logError("Error in createNote", error, params);
      throw error instanceof AppError ? error : new AppError("Failed to create note", 500, "CREATE_NOTE_ERROR");
    }
  }

  /**
   * Update an existing note
   */
  async updateNote(params: UpdateNoteParams): Promise<UserNote> {
    try {
      logInfo("Updating note", { noteId: params.noteId, userId: params.userId });

      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (params.content !== undefined) updateData.content = params.content.trim();
      if (params.title !== undefined) updateData.title = params.title?.trim() || null;
      if (params.tags !== undefined) updateData.tags = params.tags;
      if (params.category !== undefined) updateData.category = params.category;
      if (params.isPinned !== undefined) updateData.is_pinned = params.isPinned;
      if (params.isArchived !== undefined) updateData.is_archived = params.isArchived;

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('user_notes')
        .update(updateData)
        .eq('id', params.noteId)
        .eq('user_id', params.userId)
        .select()
        .single();

      if (error) {
        logError("Failed to update note", error, params);
        throw new AppError("Failed to update note", 500, "UPDATE_NOTE_ERROR");
      }

      if (!data) {
        throw new AppError("Note not found", 404, "NOTE_NOT_FOUND");
      }

      logInfo("Note updated successfully", { noteId: params.noteId });

      return this.mapDatabaseNote(data);
    } catch (error) {
      logError("Error in updateNote", error, params);
      throw error instanceof AppError ? error : new AppError("Failed to update note", 500, "UPDATE_NOTE_ERROR");
    }
  }

  /**
   * Delete a note
   */
  async deleteNote(userId: string, noteId: string): Promise<{ success: boolean }> {
    try {
      logInfo("Deleting note", { noteId, userId });

      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('user_notes')
        .delete()
        .eq('id', noteId)
        .eq('user_id', userId);

      if (error) {
        logError("Failed to delete note", error, { noteId, userId });
        throw new AppError("Failed to delete note", 500, "DELETE_NOTE_ERROR");
      }

      logInfo("Note deleted successfully", { noteId });

      return { success: true };
    } catch (error) {
      logError("Error in deleteNote", error, { noteId, userId });
      throw error instanceof AppError ? error : new AppError("Failed to delete note", 500, "DELETE_NOTE_ERROR");
    }
  }

  /**
   * Search notes by content, title, or tags
   */
  async searchNotes(params: SearchNotesParams): Promise<{ notes: UserNote[]; total: number }> {
    try {
      logInfo("Searching notes", { userId: params.userId, query: params.query });

      const supabase = getSupabaseClient();
      let query = supabase
        .from('user_notes')
        .select('*', { count: 'exact' })
        .eq('user_id', params.userId);

      // Add search conditions
      if (params.query) {
        // Use simple ilike search for now - more reliable than fts in Supabase
        const searchQuery = params.query.trim();
        query = query.or(`content.ilike.%${searchQuery}%,title.ilike.%${searchQuery}%`);
      }

      if (params.category) {
        query = query.eq('category', params.category);
      }

      if (params.tags && params.tags.length > 0) {
        query = query.overlaps('tags', params.tags);
      }

      if (!params.includeArchived) {
        query = query.eq('is_archived', false);
      }

      // Add pagination
      if (params.limit) {
        query = query.limit(params.limit);
      }
      if (params.offset) {
        query = query.range(params.offset, params.offset + (params.limit || 10) - 1);
      }

      // Order by relevance (pinned first, then by creation date)
      query = query.order('is_pinned', { ascending: false })
                   .order('created_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) {
        logError("Failed to search notes", error, params);
        throw new AppError("Failed to search notes", 500, "SEARCH_NOTES_ERROR");
      }

      const notes = data?.map((note: any) => this.mapDatabaseNote(note)) || [];

      logInfo("Notes search completed", { 
        userId: params.userId, 
        resultCount: notes.length,
        total: count || 0
      });

      return {
        notes,
        total: count || 0
      };
    } catch (error) {
      logError("Error in searchNotes", error, params);
      throw error instanceof AppError ? error : new AppError("Failed to search notes", 500, "SEARCH_NOTES_ERROR");
    }
  }

  /**
   * List notes with filters
   */
  async listNotes(params: ListNotesParams): Promise<{ notes: UserNote[]; total: number }> {
    try {
      logInfo("Listing notes", { userId: params.userId });

      const supabase = getSupabaseClient();
      let query = supabase
        .from('user_notes')
        .select('*', { count: 'exact' })
        .eq('user_id', params.userId);

      // Add filters
      if (params.category) {
        query = query.eq('category', params.category);
      }

      if (params.tags && params.tags.length > 0) {
        query = query.overlaps('tags', params.tags);
      }

      if (!params.includeArchived) {
        query = query.eq('is_archived', false);
      }

      if (params.onlyPinned) {
        query = query.eq('is_pinned', true);
      }

      // Add sorting
      const sortBy = params.sortBy || 'created';
      const sortOrder = params.sortOrder || 'desc';
      
      switch (sortBy) {
        case 'title':
          query = query.order('title', { ascending: sortOrder === 'asc', nullsFirst: false });
          break;
        case 'updated':
          query = query.order('updated_at', { ascending: sortOrder === 'asc' });
          break;
        default: // 'created'
          query = query.order('created_at', { ascending: sortOrder === 'asc' });
      }

      // Add pagination
      if (params.limit) {
        query = query.limit(params.limit);
      }
      if (params.offset) {
        query = query.range(params.offset, params.offset + (params.limit || 10) - 1);
      }

      const { data, error, count } = await query;

      if (error) {
        logError("Failed to list notes", error, params);
        throw new AppError("Failed to list notes", 500, "LIST_NOTES_ERROR");
      }

      const notes = data?.map((note: any) => this.mapDatabaseNote(note)) || [];

      logInfo("Notes listed successfully", { 
        userId: params.userId, 
        resultCount: notes.length,
        total: count || 0
      });

      return {
        notes,
        total: count || 0
      };
    } catch (error) {
      logError("Error in listNotes", error, params);
      throw error instanceof AppError ? error : new AppError("Failed to list notes", 500, "LIST_NOTES_ERROR");
    }
  }

  /**
   * Get a specific note by ID
   */
  async getNote(userId: string, noteId: string): Promise<UserNote | null> {
    try {
      logInfo("Getting note", { noteId, userId });

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('user_notes')
        .select('*')
        .eq('id', noteId)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Note not found
        }
        logError("Failed to get note", error, { noteId, userId });
        throw new AppError("Failed to get note", 500, "GET_NOTE_ERROR");
      }

      return this.mapDatabaseNote(data);
    } catch (error) {
      logError("Error in getNote", error, { noteId, userId });
      throw error instanceof AppError ? error : new AppError("Failed to get note", 500, "GET_NOTE_ERROR");
    }
  }

  /**
   * Get all unique categories for a user
   */
  async getCategories(userId: string): Promise<string[]> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('user_notes')
        .select('category')
        .eq('user_id', userId)
        .eq('is_archived', false);

      if (error) {
        logError("Failed to get categories", error, { userId });
        throw new AppError("Failed to get categories", 500, "GET_CATEGORIES_ERROR");
      }

      const categories = data ? [...new Set(data.map((item: any) => item.category).filter(Boolean))] as string[] : [];
      return categories;
    } catch (error) {
      logError("Error in getCategories", error, { userId });
      throw error instanceof AppError ? error : new AppError("Failed to get categories", 500, "GET_CATEGORIES_ERROR");
    }
  }

  /**
   * Get all unique tags for a user
   */
  async getTags(userId: string): Promise<string[]> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('user_notes')
        .select('tags')
        .eq('user_id', userId)
        .eq('is_archived', false);

      if (error) {
        logError("Failed to get tags", error, { userId });
        throw new AppError("Failed to get tags", 500, "GET_TAGS_ERROR");
      }

      const allTags = data ? data.flatMap((item: any) => item.tags || []) as string[] : [];
      const uniqueTags = [...new Set(allTags)];
      return uniqueTags;
    } catch (error) {
      logError("Error in getTags", error, { userId });
      throw error instanceof AppError ? error : new AppError("Failed to get tags", 500, "GET_TAGS_ERROR");
    }
  }

  /**
   * Get user notes statistics
   */
  async getNotesStats(userId: string): Promise<{
    total: number;
    categories: { [key: string]: number };
    pinned: number;
    recent: number; // notes from last 7 days
  }> {
    try {
      const supabase = getSupabaseClient();
      
      // Get total count
      const { count: total } = await supabase
        .from('user_notes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_archived', false);

      // Get categories with counts
      const { data: categoryData } = await supabase
        .from('user_notes')
        .select('category')
        .eq('user_id', userId)
        .eq('is_archived', false);

      const categories: { [key: string]: number } = {};
      categoryData?.forEach(item => {
        categories[item.category] = (categories[item.category] || 0) + 1;
      });

      // Get pinned count
      const { count: pinned } = await supabase
        .from('user_notes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_archived', false)
        .eq('is_pinned', true);

      // Get recent notes (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const { count: recent } = await supabase
        .from('user_notes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_archived', false)
        .gte('created_at', sevenDaysAgo.toISOString());

      return {
        total: total || 0,
        categories,
        pinned: pinned || 0,
        recent: recent || 0,
      };
    } catch (error) {
      logError("Error in getNotesStats", error, { userId });
      throw error instanceof AppError ? error : new AppError("Failed to get notes stats", 500, "GET_NOTES_STATS_ERROR");
    }
  }

  /**
   * Map database note to UserNote interface
   */
  private mapDatabaseNote(dbNote: any): UserNote {
    return {
      id: dbNote.id,
      userId: dbNote.user_id,
      title: dbNote.title,
      content: dbNote.content,
      tags: dbNote.tags || [],
      category: dbNote.category,
      isPinned: dbNote.is_pinned,
      isArchived: dbNote.is_archived,
      createdAt: dbNote.created_at,
      updatedAt: dbNote.updated_at,
    };
  }
}
