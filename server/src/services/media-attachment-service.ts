import { supabase } from "../lib/supabase";
import pino from "pino";

export interface MediaAttachment {
  id: string;
  userId: string;
  mediaType: "image" | "audio" | "video" | "document";
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
  transcription?: string;
  extractedText?: string;
  extractedData?: any;
  reminderId?: string;
  listItemId?: string;
  noteId?: string;
  createdAt: Date;
  processedAt?: Date;
}

export interface CreateMediaAttachmentParams {
  userId: string;
  mediaType: "image" | "audio" | "video" | "document";
  fileUrl?: string;
  fileSize?: number;
  mimeType?: string;
  extractedText?: string;
  extractedData?: any;
  reminderId?: string;
  listItemId?: string;
  noteId?: string;
}

export interface LinkMediaParams {
  attachmentId: string;
  reminderId?: string;
  listItemId?: string;
  noteId?: string;
}

export class MediaAttachmentService {
  private logger = pino({ level: "info" });

  /**
   * Save a media attachment with OCR results
   */
  async saveAttachment(
    params: CreateMediaAttachmentParams,
  ): Promise<MediaAttachment> {
    try {
      this.logger.info(
        `Saving media attachment: type=${params.mediaType}, user=${params.userId}`,
      );

      const { data, error } = await supabase
        .from("media_attachments")
        .insert({
          user_id: params.userId,
          media_type: params.mediaType,
          file_url: params.fileUrl || `whatsapp://temp/${Date.now()}`,
          file_size: params.fileSize,
          mime_type: params.mimeType,
          extracted_text: params.extractedText,
          extracted_data: params.extractedData,
          reminder_id: params.reminderId,
          list_item_id: params.listItemId,
          note_id: params.noteId,
          processed_at: params.extractedText ? new Date().toISOString() : null,
        })
        .select()
        .single();

      if (error) {
        this.logger.error({ error }, "Failed to save media attachment");
        throw new Error(`Failed to save media attachment: ${error.message}`);
      }

      this.logger.info(`Media attachment saved: ${data.id}`);

      return this.mapToMediaAttachment(data);
    } catch (error: any) {
      this.logger.error({ error }, "Error saving media attachment");
      throw error;
    }
  }

  /**
   * Link an existing media attachment to a reminder or list item
   */
  async linkToItem(params: LinkMediaParams): Promise<void> {
    try {
      const updates: any = {};

      if (params.reminderId) {
        updates.reminder_id = params.reminderId;
      }

      if (params.listItemId) {
        updates.list_item_id = params.listItemId;
      }

      if (params.noteId) {
        updates.note_id = params.noteId;
      }

      if (Object.keys(updates).length === 0) {
        this.logger.warn("No linking parameters provided");
        return;
      }

      const { error } = await supabase
        .from("media_attachments")
        .update(updates)
        .eq("id", params.attachmentId);

      if (error) {
        this.logger.error({ error }, "Failed to link media attachment");
        throw new Error(`Failed to link media attachment: ${error.message}`);
      }

      const linkedTo = params.reminderId
        ? "reminder"
        : params.listItemId
          ? "list item"
          : "note";
      this.logger.info(
        `Media attachment ${params.attachmentId} linked to ${linkedTo}`,
      );
    } catch (error: any) {
      this.logger.error({ error }, "Error linking media attachment");
      throw error;
    }
  }

  /**
   * Get all media attachments for a user
   */
  async getUserAttachments(
    userId: string,
    options?: {
      mediaType?: "image" | "audio" | "video" | "document";
      limit?: number;
      offset?: number;
    },
  ): Promise<{ attachments: MediaAttachment[]; total: number }> {
    try {
      let query = supabase
        .from("media_attachments")
        .select("*", { count: "exact" })
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (options?.mediaType) {
        query = query.eq("media_type", options.mediaType);
      }

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
        this.logger.error({ error }, "Failed to get user attachments");
        throw new Error(`Failed to get user attachments: ${error.message}`);
      }

      return {
        attachments: (data || []).map(this.mapToMediaAttachment),
        total: count || 0,
      };
    } catch (error: any) {
      this.logger.error({ error }, "Error getting user attachments");
      throw error;
    }
  }

  /**
   * Get media attachments linked to a specific reminder
   */
  async getAttachmentsByReminder(
    reminderId: string,
  ): Promise<MediaAttachment[]> {
    try {
      const { data, error } = await supabase
        .from("media_attachments")
        .select("*")
        .eq("reminder_id", reminderId)
        .order("created_at", { ascending: false });

      if (error) {
        this.logger.error({ error }, "Failed to get reminder attachments");
        throw new Error(`Failed to get reminder attachments: ${error.message}`);
      }

      return (data || []).map(this.mapToMediaAttachment);
    } catch (error: any) {
      this.logger.error({ error }, "Error getting reminder attachments");
      throw error;
    }
  }

  /**
   * Get media attachments linked to a specific list item
   */
  async getAttachmentsByListItem(
    listItemId: string,
  ): Promise<MediaAttachment[]> {
    try {
      const { data, error } = await supabase
        .from("media_attachments")
        .select("*")
        .eq("list_item_id", listItemId)
        .order("created_at", { ascending: false });

      if (error) {
        this.logger.error({ error }, "Failed to get list item attachments");
        throw new Error(
          `Failed to get list item attachments: ${error.message}`,
        );
      }

      return (data || []).map(this.mapToMediaAttachment);
    } catch (error: any) {
      this.logger.error({ error }, "Error getting list item attachments");
      throw error;
    }
  }

  /**
   * Get media attachments linked to a specific note
   */
  async getAttachmentsByNote(noteId: string): Promise<MediaAttachment[]> {
    try {
      const { data, error } = await supabase
        .from("media_attachments")
        .select("*")
        .eq("note_id", noteId)
        .order("created_at", { ascending: false });

      if (error) {
        this.logger.error({ error }, "Failed to get note attachments");
        throw new Error(`Failed to get note attachments: ${error.message}`);
      }

      return (data || []).map(this.mapToMediaAttachment);
    } catch (error: any) {
      this.logger.error({ error }, "Error getting note attachments");
      throw error;
    }
  }

  /**
   * Search media attachments by extracted text
   */
  async searchByText(
    userId: string,
    searchQuery: string,
    options?: {
      mediaType?: "image" | "audio" | "video" | "document";
      limit?: number;
    },
  ): Promise<MediaAttachment[]> {
    try {
      let query = supabase
        .from("media_attachments")
        .select("*")
        .eq("user_id", userId)
        .not("extracted_text", "is", null)
        .ilike("extracted_text", `%${searchQuery}%`)
        .order("created_at", { ascending: false });

      if (options?.mediaType) {
        query = query.eq("media_type", options.mediaType);
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        this.logger.error({ error }, "Failed to search attachments");
        throw new Error(`Failed to search attachments: ${error.message}`);
      }

      return (data || []).map(this.mapToMediaAttachment);
    } catch (error: any) {
      this.logger.error({ error }, "Error searching attachments");
      throw error;
    }
  }

  /**
   * Get recent unlinked attachments (orphaned media)
   */
  async getUnlinkedAttachments(
    userId: string,
    limit: number = 10,
  ): Promise<MediaAttachment[]> {
    try {
      const { data, error } = await supabase
        .from("media_attachments")
        .select("*")
        .eq("user_id", userId)
        .is("reminder_id", null)
        .is("list_item_id", null)
        .is("note_id", null)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        this.logger.error({ error }, "Failed to get unlinked attachments");
        throw new Error(`Failed to get unlinked attachments: ${error.message}`);
      }

      return (data || []).map(this.mapToMediaAttachment);
    } catch (error: any) {
      this.logger.error({ error }, "Error getting unlinked attachments");
      throw error;
    }
  }

  /**
   * Delete a media attachment
   */
  async deleteAttachment(attachmentId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from("media_attachments")
        .delete()
        .eq("id", attachmentId);

      if (error) {
        this.logger.error({ error }, "Failed to delete attachment");
        throw new Error(`Failed to delete attachment: ${error.message}`);
      }

      this.logger.info(`Media attachment deleted: ${attachmentId}`);
    } catch (error: any) {
      this.logger.error({ error }, "Error deleting attachment");
      throw error;
    }
  }

  /**
   * Get attachment statistics for a user
   */
  async getAttachmentStats(userId: string): Promise<{
    total: number;
    byType: Record<string, number>;
    withOCR: number;
    linked: number;
  }> {
    try {
      const { data, error } = await supabase
        .from("media_attachments")
        .select(
          "media_type, extracted_text, reminder_id, list_item_id, note_id",
        )
        .eq("user_id", userId);

      if (error) {
        this.logger.error({ error }, "Failed to get attachment stats");
        throw new Error(`Failed to get attachment stats: ${error.message}`);
      }

      const stats = {
        total: data?.length || 0,
        byType: {} as Record<string, number>,
        withOCR: 0,
        linked: 0,
      };

      data?.forEach((item) => {
        // Count by type
        stats.byType[item.media_type] =
          (stats.byType[item.media_type] || 0) + 1;

        // Count with OCR
        if (item.extracted_text) {
          stats.withOCR++;
        }

        // Count linked
        if (item.reminder_id || item.list_item_id || item.note_id) {
          stats.linked++;
        }
      });

      return stats;
    } catch (error: any) {
      this.logger.error({ error }, "Error getting attachment stats");
      throw error;
    }
  }

  /**
   * Map database row to MediaAttachment
   */
  private mapToMediaAttachment(data: any): MediaAttachment {
    return {
      id: data.id,
      userId: data.user_id,
      mediaType: data.media_type,
      fileUrl: data.file_url,
      fileSize: data.file_size,
      mimeType: data.mime_type,
      transcription: data.transcription,
      extractedText: data.extracted_text,
      extractedData: data.extracted_data,
      reminderId: data.reminder_id,
      listItemId: data.list_item_id,
      noteId: data.note_id,
      createdAt: new Date(data.created_at),
      processedAt: data.processed_at ? new Date(data.processed_at) : undefined,
    };
  }
}
