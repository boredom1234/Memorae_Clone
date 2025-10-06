import { getSupabaseClient } from "../lib/supabase";
import { validate, getActivityFeedSchema } from "../utils/validators";
import { handleServiceError } from "../utils/errors";
import { logError, logInfo, logPerformance } from "../utils/logger";
export interface ActivityItem {
  id: string;
  type: "reminder" | "list" | "note";
  action: "created" | "updated" | "completed" | "deleted" | "archived";
  title: string;
  timestamp: string;
  details?: string;
}
export class ActivityService {
  private supabase = getSupabaseClient();
  async getActivityFeed(params: {
    userId: string;
    limit?: number;
    offset?: number;
    types?: Array<"reminder" | "list" | "note" | "all">;
  }): Promise<{
    activities: ActivityItem[];
    total: number;
    hasMore: boolean;
  }> {
    const startTime = Date.now();
    try {
      const validatedParams = validate(getActivityFeedSchema, params);
      logInfo("Getting activity feed", { userId: validatedParams.userId });
      const activities: ActivityItem[] = [];
      const types = validatedParams.types || ["all"];
      const includeAll = types.includes("all");
      if (includeAll || types.includes("reminder")) {
        const { data: reminders } = await this.supabase
          .from("reminders")
          .select("id, title, status, created_at, updated_at, completed_at")
          .eq("user_id", validatedParams.userId)
          .order("updated_at", { ascending: false })
          .limit(validatedParams.limit || 20);
        if (reminders) {
          reminders.forEach((r) => {
            activities.push({
              id: `reminder-created-${r.id}`,
              type: "reminder",
              action: "created",
              title: r.title,
              timestamp: r.created_at,
            });
            if (r.status === "completed" && r.completed_at) {
              activities.push({
                id: `reminder-completed-${r.id}`,
                type: "reminder",
                action: "completed",
                title: r.title,
                timestamp: r.completed_at,
              });
            }
            if (r.status === "cancelled") {
              activities.push({
                id: `reminder-archived-${r.id}`,
                type: "reminder",
                action: "archived",
                title: r.title,
                timestamp: r.updated_at,
              });
            }
          });
        }
      }
      if (includeAll || types.includes("list")) {
        const { data: lists } = await this.supabase
          .from("lists")
          .select("id, name, is_archived, created_at, updated_at")
          .eq("user_id", validatedParams.userId)
          .order("updated_at", { ascending: false })
          .limit(validatedParams.limit || 20);
        if (lists) {
          lists.forEach((l) => {
            activities.push({
              id: `list-created-${l.id}`,
              type: "list",
              action: "created",
              title: l.name,
              timestamp: l.created_at,
            });
            if (l.is_archived) {
              activities.push({
                id: `list-archived-${l.id}`,
                type: "list",
                action: "archived",
                title: l.name,
                timestamp: l.updated_at,
              });
            }
            if (
              l.updated_at !== l.created_at &&
              new Date(l.updated_at).getTime() >
                new Date(l.created_at).getTime() + 1000
            ) {
              activities.push({
                id: `list-updated-${l.id}`,
                type: "list",
                action: "updated",
                title: l.name,
                timestamp: l.updated_at,
              });
            }
          });
        }
      }
      if (includeAll || types.includes("note")) {
        const { data: notes } = await this.supabase
          .from("user_notes")
          .select("id, title, content, is_archived, created_at, updated_at")
          .eq("user_id", validatedParams.userId)
          .order("updated_at", { ascending: false })
          .limit(validatedParams.limit || 20);
        if (notes) {
          notes.forEach((n) => {
            const noteTitle = n.title || n.content.substring(0, 50) + "...";
            activities.push({
              id: `note-created-${n.id}`,
              type: "note",
              action: "created",
              title: noteTitle,
              timestamp: n.created_at,
            });
            if (n.is_archived) {
              activities.push({
                id: `note-archived-${n.id}`,
                type: "note",
                action: "archived",
                title: noteTitle,
                timestamp: n.updated_at,
              });
            }
            if (
              n.updated_at !== n.created_at &&
              new Date(n.updated_at).getTime() >
                new Date(n.created_at).getTime() + 1000
            ) {
              activities.push({
                id: `note-updated-${n.id}`,
                type: "note",
                action: "updated",
                title: noteTitle,
                timestamp: n.updated_at,
              });
            }
          });
        }
      }
      activities.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      const offset = validatedParams.offset || 0;
      const limit = validatedParams.limit || 20;
      const paginatedActivities = activities.slice(offset, offset + limit);
      logPerformance("getActivityFeed", Date.now() - startTime, {
        count: paginatedActivities.length,
      });
      return {
        activities: paginatedActivities,
        total: activities.length,
        hasMore: activities.length > offset + limit,
      };
    } catch (error) {
      logError("Failed to get activity feed", error, {
        userId: params.userId,
      });
      throw handleServiceError(error, "getActivityFeed");
    }
  }
}
