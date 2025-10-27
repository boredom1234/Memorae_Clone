import { getSupabaseClient } from "../../lib/supabase";
import { AppError } from "../../utils/errors";
import { logError, logInfo } from "../../utils/logger";
import { validate, duplicateNoteSchema } from "../../utils/validators";
import { UserNote, CreateNoteParams, UpdateNoteParams } from "./types";
export class NotesService {
  private supabase = getSupabaseClient();
  async createNote(params: CreateNoteParams): Promise<UserNote> {
    try {
      logInfo("Creating note", {
        userId: params.userId,
        hasTitle: !!params.title,
      });
      const noteData = {
        user_id: params.userId,
        content: params.content.trim(),
        title: params.title?.trim() || null,
        tags: params.tags || [],
        category: params.category || "general",
        is_pinned: params.isPinned || false,
        is_archived: false,
      };
      const { data, error } = await this.supabase
        .from("user_notes")
        .insert(noteData)
        .select()
        .single();
      if (error) {
        logError("Failed to create note", error, { userId: params.userId });
        throw new AppError("Failed to create note", 500, "CREATE_NOTE_ERROR");
      }
      logInfo("Note created successfully", {
        noteId: data.id,
        userId: params.userId,
      });
      return this.mapDatabaseNote(data);
    } catch (error) {
      logError("Error in createNote", error, params);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to create note", 500, "CREATE_NOTE_ERROR");
    }
  }
  async updateNote(params: UpdateNoteParams): Promise<UserNote> {
    try {
      logInfo("Updating note", {
        noteId: params.noteId,
        userId: params.userId,
      });
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };
      if (params.content !== undefined)
        updateData.content = params.content.trim();
      if (params.title !== undefined)
        updateData.title = params.title?.trim() || null;
      if (params.tags !== undefined) updateData.tags = params.tags;
      if (params.category !== undefined) updateData.category = params.category;
      if (params.isPinned !== undefined) updateData.is_pinned = params.isPinned;
      if (params.isArchived !== undefined)
        updateData.is_archived = params.isArchived;
      const { data, error } = await this.supabase
        .from("user_notes")
        .update(updateData)
        .eq("id", params.noteId)
        .eq("user_id", params.userId)
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
      throw error instanceof AppError
        ? error
        : new AppError("Failed to update note", 500, "UPDATE_NOTE_ERROR");
    }
  }
  async deleteNote(
    userId: string,
    noteId: string,
  ): Promise<{
    success: boolean;
  }> {
    try {
      logInfo("Deleting note", { noteId, userId });
      const { error } = await this.supabase
        .from("user_notes")
        .delete()
        .eq("id", noteId)
        .eq("user_id", userId);
      if (error) {
        logError("Failed to delete note", error, { noteId, userId });
        throw new AppError("Failed to delete note", 500, "DELETE_NOTE_ERROR");
      }
      logInfo("Note deleted successfully", { noteId });
      return { success: true };
    } catch (error) {
      logError("Error in deleteNote", error, { noteId, userId });
      throw error instanceof AppError
        ? error
        : new AppError("Failed to delete note", 500, "DELETE_NOTE_ERROR");
    }
  }
  async pinNote(params: {
    userId: string;
    noteId: string;
    isPinned: boolean;
  }): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const { error } = await getSupabaseClient()
        .from("user_notes")
        .update({
          is_pinned: params.isPinned,
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.noteId)
        .eq("user_id", params.userId);
      if (error) throw error;
      return {
        success: true,
        message: params.isPinned ? "Note pinned" : "Note unpinned",
      };
    } catch (error) {
      logError("Failed to pin/unpin note", error, params);
      throw error instanceof AppError
        ? error
        : new AppError(
            "Failed to update note pin status",
            500,
            "PIN_NOTE_ERROR",
          );
    }
  }
  async archiveNote(params: {
    userId: string;
    noteId: string;
    isArchived: boolean;
  }): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const { error } = await getSupabaseClient()
        .from("user_notes")
        .update({
          is_archived: params.isArchived,
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.noteId)
        .eq("user_id", params.userId);
      if (error) throw error;
      return {
        success: true,
        message: params.isArchived ? "Note archived" : "Note unarchived",
      };
    } catch (error) {
      logError("Failed to archive/unarchive note", error, params);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to archive note", 500, "ARCHIVE_NOTE_ERROR");
    }
  }
  async duplicateNote(params: {
    userId: string;
    noteId: string;
    newTitle?: string;
  }): Promise<UserNote> {
    try {
      const validatedParams = validate(duplicateNoteSchema, params);
      logInfo("Duplicating note", {
        userId: validatedParams.userId,
        noteId: validatedParams.noteId,
      });
      const { data: originalNote, error: fetchError } = await this.supabase
        .from("user_notes")
        .select("*")
        .eq("id", validatedParams.noteId)
        .eq("user_id", validatedParams.userId)
        .single();
      if (fetchError || !originalNote) {
        throw new AppError("Note not found", 404, "NOTE_NOT_FOUND");
      }
      const newTitle =
        validatedParams.newTitle ||
        (originalNote.title ? `${originalNote.title} (Copy)` : "Copy of note");
      const { data: newNote, error: createError } = await this.supabase
        .from("user_notes")
        .insert({
          user_id: validatedParams.userId,
          title: newTitle,
          content: originalNote.content,
          tags: originalNote.tags || [],
          category: originalNote.category,
          is_pinned: false,
          is_archived: false,
        })
        .select()
        .single();
      if (createError || !newNote) {
        logError("Failed to duplicate note", createError, validatedParams);
        throw new AppError(
          "Failed to duplicate note",
          500,
          "DUPLICATE_NOTE_ERROR",
        );
      }
      logInfo("Note duplicated successfully", {
        originalNoteId: validatedParams.noteId,
        newNoteId: newNote.id,
      });
      return this.mapDatabaseNote(newNote);
    } catch (error) {
      logError("Error in duplicateNote", error, params);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to duplicate note", 500, "DUPLICATE_NOTE_ERROR");
    }
  }
  public mapDatabaseNote(dbNote: any): UserNote {
    return {
      id: dbNote.id,
      userId: dbNote.user_id,
      title: dbNote.title,
      content: dbNote.content,
      tags: dbNote.tags || [],
      category: dbNote.category,
      isPinned: dbNote.is_pinned,
      isArchived: dbNote.is_archived,
      mediaCount: dbNote.media_count || 0,
      createdAt: dbNote.created_at,
      updatedAt: dbNote.updated_at,
    };
  }
  async mergeNotes(params: {
    userId: string;
    noteIds: string[];
    newTitle?: string;
  }): Promise<UserNote> {
    try {
      if (!params.noteIds || params.noteIds.length < 2) {
        throw new AppError("Provide at least two notes to merge", 400, "MERGE_NOTES_INVALID");
      }
      const { data: notes, error } = await this.supabase
        .from("user_notes")
        .select("*")
        .eq("user_id", params.userId)
        .in("id", params.noteIds);
      if (error) throw error;
      if (!notes || notes.length === 0) {
        throw new AppError("No notes found to merge", 404, "MERGE_NOTES_NOT_FOUND");
      }
      // Sort by created_at ascending for readability
      notes.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const mergedContent = notes
        .map((n: any, idx: number) => {
          const titleLine = n.title ? `# ${n.title}\n` : "";
          return `--- Note ${idx + 1} (${new Date(n.created_at).toISOString()}) ---\n${titleLine}${n.content || ""}`;
        })
        .join("\n\n\n");
      const newTitle = params.newTitle || "Merged Notes";
      const { data: newNote, error: createError } = await this.supabase
        .from("user_notes")
        .insert({
          user_id: params.userId,
          title: newTitle,
          content: mergedContent,
          tags: [],
          category: "general",
          is_pinned: false,
          is_archived: false,
        })
        .select()
        .single();
      if (createError || !newNote) {
        throw new AppError("Failed to create merged note", 500, "MERGE_NOTES_CREATE_ERROR");
      }
      logInfo("Notes merged", { userId: params.userId, count: notes.length, newNoteId: newNote.id });
      return this.mapDatabaseNote(newNote);
    } catch (error) {
      logError("Error in mergeNotes", error, params);
      throw error instanceof AppError
        ? error
        : new AppError("Failed to merge notes", 500, "MERGE_NOTES_ERROR");
    }
  }
}
