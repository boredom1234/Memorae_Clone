import { getSupabaseClient } from "../../lib/supabase";
import { AppError } from "../../utils/errors";
import { logError, logInfo } from "../../utils/logger";
import {
  UserNote,
  SearchNotesParams,
  ListNotesParams,
  NoteWithMedia,
} from "./types";
import { NotesService } from "./notes.service";
export class NotesQueryService {
  private supabase = getSupabaseClient();
  private notesService = new NotesService();
  async searchNotes(params: SearchNotesParams): Promise<{
    notes: UserNote[];
    total: number;
  }> {
    try {
      logInfo("Searching notes", {
        userId: params.userId,
        query: params.query,
      });
      const supabase = getSupabaseClient();
      let query = supabase
        .from("user_notes")
        .select("*", { count: "exact" })
        .eq("user_id", params.userId);
      if (params.query) {
        const raw = params.query.trim().toLowerCase();
        const tokens = raw.split(/[^a-z0-9]+/g).filter(Boolean);
        if (tokens.length > 0) {
          const orFilters = tokens
            .map((t) => `content.ilike.%${t}%,title.ilike.%${t}%`)
            .join(",");
          query = query.or(orFilters);
        }
      }
      if (params.category) {
        query = query.eq("category", params.category);
      }
      if (params.tags && params.tags.length > 0) {
        query = query.overlaps("tags", params.tags);
      }
      if (!params.includeArchived) {
        query = query.eq("is_archived", false);
      }
      if (params.limit) {
        query = query.limit(params.limit);
      }
      if (params.offset) {
        query = query.range(
          params.offset,
          params.offset + (params.limit || 10) - 1,
        );
      }
      query = query
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      const { data, error, count } = await query;
      if (error) {
        logError("Failed to search notes", error, params);
        throw new AppError("Failed to search notes", 500, "SEARCH_NOTES_ERROR");
      }
      const buildTokens = (q: string) => {
        const stop = new Set([
          "a",
          "an",
          "the",
          "is",
          "was",
          "were",
          "am",
          "i",
          "my",
          "me",
          "do",
          "did",
          "does",
          "where",
          "what",
          "when",
          "which",
          "who",
          "whom",
          "this",
          "that",
          "these",
          "those",
          "to",
          "for",
          "on",
          "in",
          "at",
          "about",
          "with",
          "and",
          "or",
          "but",
          "from",
          "by",
          "of",
          "it",
          "you",
          "your",
          "yours",
          "be",
          "have",
          "has",
          "had",
          "will",
          "would",
          "can",
          "could",
          "should",
          "as",
        ]);
        return q
          .toLowerCase()
          .split(/[^a-z0-9]+/g)
          .filter(Boolean)
          .filter((t) => !stop.has(t))
          .map((t) => t.replace(/[^a-z0-9]/g, ""));
      };
      let originalData = data || [];
      if ((!originalData || originalData.length === 0) && params.query) {
        const fallbackQuery = getSupabaseClient()
          .from("user_notes")
          .select("*")
          .eq("user_id", params.userId)
          .eq("is_archived", false)
          .order("is_pinned", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(200);
        const { data: fallbackData, error: fbErr } = await fallbackQuery;
        if (!fbErr && fallbackData) {
          originalData = fallbackData;
        }
      }
      let filteredData = originalData;
      if (params.query) {
        const tokens = buildTokens(params.query);
        if (tokens.length > 0) {
          filteredData = originalData.filter((note: any) => {
            const combined = `${note.title || ""} ${note.content || ""} ${Array.isArray(note.tags) ? note.tags.join(" ") : ""}`;
            const stripped = combined.toLowerCase().replace(/[^a-z0-9]/g, "");
            return tokens.every((t) => stripped.includes(t));
          });
          if (filteredData.length === 0) {
            filteredData = originalData.filter((note: any) => {
              const combined = `${note.title || ""} ${note.content || ""} ${Array.isArray(note.tags) ? note.tags.join(" ") : ""}`;
              const stripped = combined.toLowerCase().replace(/[^a-z0-9]/g, "");
              return tokens.some((t) => stripped.includes(t));
            });
          }
        }
      }
      const totalFull = filteredData.length;
      const offset = params.offset || 0;
      const limit = params.limit || Math.min(10, totalFull || 10);
      const paged = filteredData.slice(offset, offset + limit);
      const notes = paged.map((note: any) =>
        this.notesService.mapDatabaseNote(note),
      );
      logInfo("Notes search completed", {
        userId: params.userId,
        resultCount: notes.length,
        total: totalFull,
      });
      return {
        notes,
        total: totalFull,
      };
    } catch (error) {
      logError("Error in searchNotes", error, params);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to search notes", 500, "SEARCH_NOTES_ERROR");
    }
  }
  async listNotes(params: ListNotesParams): Promise<{
    notes: UserNote[];
    total: number;
  }> {
    try {
      logInfo("Listing notes", { userId: params.userId });
      const supabase = getSupabaseClient();
      let query = supabase
        .from("user_notes")
        .select("*", { count: "exact" })
        .eq("user_id", params.userId);
      if (params.category) {
        query = query.eq("category", params.category);
      }
      if (params.tags && params.tags.length > 0) {
        query = query.overlaps("tags", params.tags);
      }
      if (!params.includeArchived) {
        query = query.eq("is_archived", false);
      }
      if (params.onlyPinned) {
        query = query.eq("is_pinned", true);
      }
      const sortBy = params.sortBy || "created";
      const sortOrder = params.sortOrder || "desc";
      switch (sortBy) {
        case "title":
          query = query.order("title", {
            ascending: sortOrder === "asc",
            nullsFirst: false,
          });
          break;
        case "updated":
          query = query.order("updated_at", { ascending: sortOrder === "asc" });
          break;
        default:
          query = query.order("created_at", { ascending: sortOrder === "asc" });
      }
      if (params.limit) {
        query = query.limit(params.limit);
      }
      if (params.offset) {
        query = query.range(
          params.offset,
          params.offset + (params.limit || 10) - 1,
        );
      }
      const { data, error, count } = await query;
      if (error) {
        logError("Failed to list notes", error, params);
        throw new AppError("Failed to list notes", 500, "LIST_NOTES_ERROR");
      }
      const notes =
        data?.map((note: any) => this.notesService.mapDatabaseNote(note)) || [];
      logInfo("Notes listed successfully", {
        userId: params.userId,
        resultCount: notes.length,
        total: count || 0,
      });
      return {
        notes,
        total: count || 0,
      };
    } catch (error) {
      logError("Error in listNotes", error, params);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to list notes", 500, "LIST_NOTES_ERROR");
    }
  }
  async getNote(userId: string, noteId: string): Promise<UserNote | null> {
    try {
      logInfo("Getting note", { noteId, userId });
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("user_notes")
        .select("*")
        .eq("id", noteId)
        .eq("user_id", userId)
        .single();
      if (error) {
        if (error.code === "PGRST116") {
          return null;
        }
        logError("Failed to get note", error, { noteId, userId });
        throw new AppError("Failed to get note", 500, "GET_NOTE_ERROR");
      }
      return this.notesService.mapDatabaseNote(data);
    } catch (error) {
      logError("Error in getNote", error, { noteId, userId });
      throw error instanceof AppError
        ? error
        : new AppError("Failed to get note", 500, "GET_NOTE_ERROR");
    }
  }
  async getCategories(userId: string): Promise<string[]> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("user_notes")
        .select("category")
        .eq("user_id", userId)
        .eq("is_archived", false);
      if (error) {
        logError("Failed to get categories", error, { userId });
        throw new AppError(
          "Failed to get categories",
          500,
          "GET_CATEGORIES_ERROR",
        );
      }
      const categories = data
        ? ([
            ...new Set(data.map((item: any) => item.category).filter(Boolean)),
          ] as string[])
        : [];
      return categories;
    } catch (error) {
      logError("Error in getCategories", error, { userId });
      throw error instanceof AppError
        ? error
        : new AppError("Failed to get categories", 500, "GET_CATEGORIES_ERROR");
    }
  }
  async getTags(userId: string): Promise<string[]> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("user_notes")
        .select("tags")
        .eq("user_id", userId)
        .eq("is_archived", false);
      if (error) {
        logError("Failed to get tags", error, { userId });
        throw new AppError("Failed to get tags", 500, "GET_TAGS_ERROR");
      }
      const allTags = data
        ? (data.flatMap((item: any) => item.tags || []) as string[])
        : [];
      const uniqueTags = [...new Set(allTags)];
      return uniqueTags;
    } catch (error) {
      logError("Error in getTags", error, { userId });
      throw error instanceof AppError
        ? error
        : new AppError("Failed to get tags", 500, "GET_TAGS_ERROR");
    }
  }
  async getNotesStats(userId: string): Promise<{
    total: number;
    categories: {
      [key: string]: number;
    };
    pinned: number;
    recent: number;
  }> {
    try {
      const supabase = getSupabaseClient();
      const { count: total } = await supabase
        .from("user_notes")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_archived", false);
      const { data: categoryData } = await supabase
        .from("user_notes")
        .select("category")
        .eq("user_id", userId)
        .eq("is_archived", false);
      const categories: {
        [key: string]: number;
      } = {};
      categoryData?.forEach((item) => {
        categories[item.category] = (categories[item.category] || 0) + 1;
      });
      const { count: pinned } = await supabase
        .from("user_notes")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_archived", false)
        .eq("is_pinned", true);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { count: recent } = await supabase
        .from("user_notes")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_archived", false)
        .gte("created_at", sevenDaysAgo.toISOString());
      return {
        total: total || 0,
        categories,
        pinned: pinned || 0,
        recent: recent || 0,
      };
    } catch (error) {
      logError("Error in getNotesStats", error, { userId });
      throw error instanceof AppError
        ? error
        : new AppError(
            "Failed to get notes stats",
            500,
            "GET_NOTES_STATS_ERROR",
          );
    }
  }
  async getNotesWithMedia(
    userId: string,
    options?: {
      category?: string;
      tags?: string[];
      includeArchived?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<{
    notes: NoteWithMedia[];
    total: number;
  }> {
    try {
      logInfo("Getting notes with media", { userId });
      const supabase = getSupabaseClient();
      let query = supabase
        .from("user_notes")
        .select(
          `
          *,
          media:media_attachments(
            id,
            media_type,
            file_url,
            mime_type,
            extracted_text
          )
        `,
          { count: "exact" },
        )
        .eq("user_id", userId);
      if (options?.category) {
        query = query.eq("category", options.category);
      }
      if (options?.tags && options.tags.length > 0) {
        query = query.overlaps("tags", options.tags);
      }
      if (!options?.includeArchived) {
        query = query.eq("is_archived", false);
      }
      query = query
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      if (options?.offset) {
        query = query.range(
          options.offset,
          options.offset + (options.limit || 10) - 1,
        );
      }
      const { data, error, count } = await query;
      if (error) {
        logError("Failed to get notes with media", error, { userId });
        throw new AppError(
          "Failed to get notes with media",
          500,
          "GET_NOTES_WITH_MEDIA_ERROR",
        );
      }
      const notesWithMedia = (data || []).map((note: any) => ({
        ...this.notesService.mapDatabaseNote(note),
        media: (note.media || []).map((m: any) => ({
          id: m.id,
          mediaType: m.media_type,
          fileUrl: m.file_url,
          mimeType: m.mime_type,
          extractedText: m.extracted_text,
        })),
      }));
      logInfo("Notes with media retrieved", {
        userId,
        resultCount: notesWithMedia.length,
        total: count || 0,
      });
      return {
        notes: notesWithMedia,
        total: count || 0,
      };
    } catch (error) {
      logError("Error in getNotesWithMedia", error, { userId });
      throw error instanceof AppError
        ? error
        : new AppError(
            "Failed to get notes with media",
            500,
            "GET_NOTES_WITH_MEDIA_ERROR",
          );
    }
  }
}
