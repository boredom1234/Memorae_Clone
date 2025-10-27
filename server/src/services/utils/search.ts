import { handleServiceError } from "../../utils/errors";
import { logError } from "../../utils/logger";
export async function globalSearch(params: {
  userId: string;
  query: string;
  limit?: number;
}): Promise<{
  reminders: any[];
  notes: any[];
  lists: any[];
  listItems: any[];
  media: any[];
  total: number;
}> {
  try {
    const { getSupabaseClient } = await import("../../lib/supabase");
    const supabase = getSupabaseClient();
    const q = `%${params.query}%`;
    const limit = params.limit || 10;
    const [reminders, notes, lists, listItems, media] = await Promise.all([
      supabase
        .from("reminders")
        .select("id, title, notes, reminder_time, status")
        .eq("user_id", params.userId)
        .or(`title.ilike.${q},notes.ilike.${q}`)
        .limit(limit),
      supabase
        .from("user_notes")
        .select("id, title, content, category, tags")
        .eq("user_id", params.userId)
        .or(`title.ilike.${q},content.ilike.${q}`)
        .limit(limit),
      supabase
        .from("lists")
        .select("id, name, description")
        .eq("user_id", params.userId)
        .or(`name.ilike.${q},description.ilike.${q}`)
        .limit(limit),
      supabase
        .from("list_items")
        .select("id, list_id, content, notes")
        .or(`content.ilike.${q},notes.ilike.${q}`)
        .limit(limit),
      supabase
        .from("media_attachments")
        .select("id, media_type, file_url, extracted_text, transcription")
        .eq("user_id", params.userId)
        .or(
          `extracted_text.ilike.${q},transcription.ilike.${q},file_url.ilike.${q}`,
        )
        .limit(limit),
    ]);
    const results = {
      reminders: reminders.data || [],
      notes: notes.data || [],
      lists: lists.data || [],
      listItems: listItems.data || [],
      media: media.data || [],
      total:
        (reminders.data?.length || 0) +
        (notes.data?.length || 0) +
        (lists.data?.length || 0) +
        (listItems.data?.length || 0) +
        (media.data?.length || 0),
    };
    return results;
  } catch (error) {
    logError("Failed to perform global search", error, {
      userId: params.userId,
      query: params.query,
    });
    throw handleServiceError(error, "globalSearch");
  }
}
