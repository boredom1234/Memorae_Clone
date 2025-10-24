import { getSupabaseClient } from "../../lib/supabase";
import { UpcomingReminder, SearchResult } from "./types";
import {
  validate,
  listRemindersSchema,
  getUpcomingRemindersSchema,
  searchRemindersSchema,
  sanitizeString,
} from "../../utils/validators";
import { handleServiceError } from "../../utils/errors";
import { formatInZone } from "../../utils/time-utils";
import { logError, logPerformance } from "../../utils/logger";
import { DateTime } from "luxon";
export class ReminderQueryService {
  private supabase = getSupabaseClient();
  async listReminders(params: {
    userId: string;
    status?: "pending" | "completed" | "all";
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
    sortBy?: "time" | "priority" | "created";
  }): Promise<{
    reminders: Array<{
      id: string;
      title: string;
      reminderTime: string;
      isRecurring: boolean;
      priority: string;
      createdAt: string;
    }>;
    total: number;
    hasMore: boolean;
  }> {
    const startTime = Date.now();
    try {
      const validatedParams = validate(listRemindersSchema, params);
      let query = this.supabase
        .from("reminders")
        .select("*", { count: "exact" })
        .eq("user_id", validatedParams.userId);
      if (validatedParams.status && validatedParams.status !== "all") {
        query = query.eq("status", validatedParams.status);
      }
      if (validatedParams.startDate) {
        query = query.gte("reminder_time", validatedParams.startDate);
      }
      if (validatedParams.endDate) {
        query = query.lte("reminder_time", validatedParams.endDate);
      }
      const sortBy = validatedParams.sortBy || "time";
      if (sortBy === "time") {
        query = query.order("reminder_time", { ascending: true });
      } else if (sortBy === "priority") {
        query = query.order("priority", { ascending: false });
      } else if (sortBy === "created") {
        query = query.order("created_at", { ascending: false });
      }
      const limit = validatedParams.limit || 50;
      const offset = validatedParams.offset || 0;
      query = query.range(offset, offset + limit - 1);
      const { data, error, count } = await query;
      if (error) {
        throw error;
      }
      const { data: userTzRow } = await this.supabase
        .from("users")
        .select("timezone")
        .eq("id", validatedParams.userId)
        .single();
      const tz = userTzRow?.timezone || "UTC";
      const reminders = (data || []).map((r) => ({
        id: r.id,
        title: r.title,
        reminderTime: r.reminder_time,
        reminderTimeFormatted: formatInZone(
          r.reminder_time,
          tz,
          "MMM d, yyyy 'at' h:mm a",
        ),
        isRecurring: r.is_recurring,
        priority: r.priority,
        createdAt: r.created_at,
      }));
      logPerformance("listReminders", Date.now() - startTime, {
        count: reminders.length,
      });
      return {
        reminders,
        total: count || 0,
        hasMore: (count || 0) > offset + limit,
      };
    } catch (error) {
      logError("Failed to list reminders", error, { userId: params.userId });
      throw handleServiceError(error, "listReminders");
    }
  }
  async getUpcomingReminders(params: {
    userId: string;
    timeframe: "today" | "tomorrow" | "week" | "month";
    limit?: number;
  }): Promise<{
    reminders: UpcomingReminder[];
    total: number;
  }> {
    const startTime = Date.now();
    try {
      const validatedParams = validate(getUpcomingRemindersSchema, params);
      const { data: userTzRow } = await this.supabase
        .from("users")
        .select("timezone")
        .eq("id", validatedParams.userId)
        .single();
      const tz = userTzRow?.timezone || "UTC";
      const zoneNow = DateTime.now().setZone(tz);
      let start = zoneNow;
      let end: DateTime;
      switch (validatedParams.timeframe) {
        case "today":
          end = zoneNow.endOf("day");
          break;
        case "tomorrow":
          start = zoneNow.plus({ days: 1 }).startOf("day");
          end = zoneNow.plus({ days: 1 }).endOf("day");
          break;
        case "week":
          end = zoneNow.plus({ days: 7 });
          break;
        case "month":
          end = zoneNow.plus({ months: 1 });
          break;
      }
      const startUTC = start.toUTC().toISO()!;
      const endUTC = end.toUTC().toISO()!;
      const { data, error } = await this.supabase
        .from("reminders")
        .select("*")
        .eq("user_id", validatedParams.userId)
        .eq("status", "pending")
        .gte("reminder_time", startUTC)
        .lte("reminder_time", endUTC)
        .order("reminder_time", { ascending: true })
        .limit(validatedParams.limit || 10);
      if (error) {
        throw error;
      }
      const reminders = (data || []).map((r) => {
        const rt = DateTime.fromISO(r.reminder_time, { setZone: true }).toUTC();
        const nowUTC = DateTime.utc();
        const diffMs = rt.toMillis() - nowUTC.toMillis();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        let timeUntil: string;
        if (diffDays > 0) {
          timeUntil = `${diffDays} day${diffDays > 1 ? "s" : ""}`;
        } else if (diffHours > 0) {
          timeUntil = `${diffHours} hour${diffHours > 1 ? "s" : ""}`;
        } else {
          timeUntil = `${diffMins} minute${diffMins > 1 ? "s" : ""}`;
        }
        return {
          id: r.id,
          title: r.title,
          reminderTime: r.reminder_time,
          reminderTimeFormatted: formatInZone(
            r.reminder_time,
            tz,
            "MMM d, yyyy 'at' h:mm a",
          ),
          timeUntil,
        };
      });
      logPerformance("getUpcomingReminders", Date.now() - startTime, {
        count: reminders.length,
      });
      return {
        reminders,
        total: reminders.length,
      };
    } catch (error) {
      logError("Failed to get upcoming reminders", error, {
        userId: params.userId,
      });
      throw handleServiceError(error, "getUpcomingReminders");
    }
  }
  async searchReminders(params: {
    userId: string;
    query: string;
    filters?: {
      dateRange?: {
        start: string;
        end: string;
      };
      priority?: "low" | "medium" | "high";
      status?: "pending" | "completed";
    };
    limit?: number;
  }): Promise<{
    results: SearchResult[];
    total: number;
  }> {
    const startTime = Date.now();
    try {
      const validatedParams = validate(searchRemindersSchema, params);
      const sanitizedQuery = sanitizeString(validatedParams.query);
      let query = this.supabase
        .from("reminders")
        .select("*")
        .eq("user_id", validatedParams.userId)
        .or(`title.ilike.%${sanitizedQuery}%,notes.ilike.%${sanitizedQuery}%`);
      if (validatedParams.filters?.dateRange) {
        query = query
          .gte("reminder_time", validatedParams.filters.dateRange.start)
          .lte("reminder_time", validatedParams.filters.dateRange.end);
      }
      if (validatedParams.filters?.priority) {
        query = query.eq("priority", validatedParams.filters.priority);
      }
      if (validatedParams.filters?.status) {
        query = query.eq("status", validatedParams.filters.status);
      }
      query = query.limit(validatedParams.limit || 20);
      const { data, error } = await query;
      if (error) {
        throw error;
      }
      const results = (data || []).map((r) => ({
        id: r.id,
        title: r.title,
        reminderTime: r.reminder_time,
        relevanceScore: 1.0,
      }));
      logPerformance("searchReminders", Date.now() - startTime, {
        count: results.length,
      });
      return {
        results,
        total: results.length,
      };
    } catch (error) {
      logError("Failed to search reminders", error, { userId: params.userId });
      throw handleServiceError(error, "searchReminders");
    }
  }
  async listOverdueReminders(params: {
    userId: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    reminders: any[];
    total: number;
  }> {
    try {
      const nowISO = new Date().toISOString();
      const limit = params.limit ?? 50;
      const offset = params.offset ?? 0;
      const { data, error, count } = await this.supabase
        .from("reminders")
        .select("*", { count: "exact" })
        .eq("user_id", params.userId)
        .eq("status", "pending")
        .lt("reminder_time", nowISO)
        .order("reminder_time", { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      return { reminders: data || [], total: count || 0 };
    } catch (error) {
      logError("Failed to list overdue reminders", error, {
        userId: params.userId,
      });
      throw handleServiceError(error, "listOverdueReminders");
    }
  }
}
