import { getSupabaseClient } from "../lib/supabase";
import { Reminder } from "../models/types";
import {
  validate,
  createReminderSchema,
  updateReminderSchema,
  deleteReminderSchema,
  listRemindersSchema,
  snoozeReminderSchema,
  completeReminderSchema,
  searchRemindersSchema,
  getUpcomingRemindersSchema,
  batchCreateRemindersSchema,
  sanitizeString,
} from "../utils/validators";
import {
  handleServiceError,
  NotFoundError,
  ValidationError,
} from "../utils/errors";
import { logInfo, logError, logAudit, logPerformance } from "../utils/logger";
import { toUTC } from "../utils/time-utils";
import { DateTime } from "luxon";

export class ReminderService {
  private supabase = getSupabaseClient();

  async createReminder(params: {
    userId: string;
    title: string;
    reminderTime: string;
    timezone: string;
    isRecurring: boolean;
    recurrenceRule?: string;
    notes?: string;
    priority?: "low" | "medium" | "high";
  }): Promise<{
    success: boolean;
    reminderId: string;
    message: string;
    scheduledFor: string;
  }> {
    const startTime = Date.now();

    try {
      // Validate input (timezone presence enforced by schema)
      const validatedParams = validate(createReminderSchema, params);

      logInfo("Creating reminder", {
        userId: params.userId,
        title: params.title,
      });

      const { data, error } = await this.supabase
        .from("reminders")
        .insert({
          user_id: validatedParams.userId,
          title: validatedParams.title,
          reminder_time: toUTC(validatedParams.reminderTime),
          is_recurring: validatedParams.isRecurring,
          recurrence_rule: validatedParams.recurrenceRule,
          notes: validatedParams.notes,
          priority: validatedParams.priority || "medium",
          status: "pending",
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error("No data returned from insert operation");
      }

      logAudit("CREATE_REMINDER", params.userId, "reminder", {
        reminderId: data.id,
        title: data.title,
      });
      logPerformance("createReminder", Date.now() - startTime);

      return {
        success: true,
        reminderId: data.id,
        message: `Reminder "${params.title}" created successfully`,
        scheduledFor: data.reminder_time,
      };
    } catch (error) {
      logError("Failed to create reminder", error, {
        userId: params.userId,
        title: params.title,
      });
      throw handleServiceError(error, "createReminder");
    }
  }

  async updateReminder(params: {
    userId: string;
    reminderId: string;
    title?: string;
    reminderTime?: string;
    isRecurring?: boolean;
    recurrenceRule?: string;
    notes?: string;
    priority?: "low" | "medium" | "high";
  }): Promise<{
    success: boolean;
    message: string;
    updatedReminder: Reminder;
  }> {
    const startTime = Date.now();

    try {
      // Validate input
      const validatedParams = validate(updateReminderSchema, params);

      // Check if reminder exists
      const { data: existing, error: checkError } = await this.supabase
        .from("reminders")
        .select("id, status, user_id")
        .eq("id", validatedParams.reminderId)
        .eq("user_id", validatedParams.userId)
        .single();

      if (checkError || !existing) {
        throw new NotFoundError("Reminder", validatedParams.reminderId);
      }

      if (existing.status === "completed") {
        throw new ValidationError("Cannot update a completed reminder");
      }

      const updateData: any = {};
      if (validatedParams.title) updateData.title = validatedParams.title;
      if (validatedParams.reminderTime)
        updateData.reminder_time = toUTC(validatedParams.reminderTime);
      if (validatedParams.isRecurring !== undefined)
        updateData.is_recurring = validatedParams.isRecurring;
      if (validatedParams.recurrenceRule)
        updateData.recurrence_rule = validatedParams.recurrenceRule;
      if (validatedParams.notes !== undefined)
        updateData.notes = validatedParams.notes;
      if (validatedParams.priority)
        updateData.priority = validatedParams.priority;
      updateData.updated_at = new Date().toISOString();

      const { data, error } = await this.supabase
        .from("reminders")
        .update(updateData)
        .eq("id", validatedParams.reminderId)
        .eq("user_id", validatedParams.userId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new NotFoundError("Reminder", validatedParams.reminderId);
      }

      logAudit("UPDATE_REMINDER", data.user_id, "reminder", {
        reminderId: data.id,
      });
      logPerformance("updateReminder", Date.now() - startTime);

      return {
        success: true,
        message: "Reminder updated successfully",
        updatedReminder: data,
      };
    } catch (error) {
      logError("Failed to update reminder", error, {
        reminderId: params.reminderId,
      });
      throw handleServiceError(error, "updateReminder");
    }
  }

  async deleteReminder(params: {
    userId: string;
    reminderId?: string;
    searchQuery?: string;
  }): Promise<{ success: boolean; deletedCount: number; message: string }> {
    const startTime = Date.now();

    try {
      // Validate input
      const validatedParams = validate(deleteReminderSchema, params);

      let query = this.supabase
        .from("reminders")
        .delete()
        .eq("user_id", validatedParams.userId);

      if (validatedParams.reminderId) {
        query = query.eq("id", validatedParams.reminderId);
      } else if (validatedParams.searchQuery) {
        // Sanitize search query to prevent SQL injection
        const sanitized = sanitizeString(validatedParams.searchQuery);
        query = query.ilike("title", `%${sanitized}%`);
      }

      const { data, error } = await query.select();

      if (error) {
        throw error;
      }

      const deletedCount = data?.length || 0;

      if (deletedCount === 0) {
        throw new NotFoundError("Reminder");
      }

      logAudit("DELETE_REMINDER", validatedParams.userId, "reminder", {
        deletedCount,
        reminderId: validatedParams.reminderId,
        searchQuery: validatedParams.searchQuery,
      });
      logPerformance("deleteReminder", Date.now() - startTime);

      return {
        success: true,
        deletedCount,
        message: `${deletedCount} reminder(s) deleted successfully`,
      };
    } catch (error) {
      logError("Failed to delete reminder", error, { userId: params.userId });
      throw handleServiceError(error, "deleteReminder");
    }
  }

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
      // Validate input
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

      // Sorting
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

      const reminders = (data || []).map((r) => ({
        id: r.id,
        title: r.title,
        reminderTime: r.reminder_time,
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

  async snoozeReminder(params: {
    userId: string;
    reminderId: string;
    snoozeUntil: string;
    snoozeDuration?: number;
  }): Promise<{ success: boolean; newReminderTime: string; message: string }> {
    const startTime = Date.now();

    try {
      // Validate input
      const validatedParams = validate(snoozeReminderSchema, params);

      // Check if reminder exists and is not completed
      const { data: existing, error: checkError } = await this.supabase
        .from("reminders")
        .select("id, status, snooze_count, user_id")
        .eq("id", validatedParams.reminderId)
        .eq("user_id", validatedParams.userId)
        .single();

      if (checkError || !existing) {
        throw new NotFoundError("Reminder", validatedParams.reminderId);
      }

      if (existing.status === "completed") {
        throw new ValidationError("Cannot snooze a completed reminder");
      }

      // Fix snooze flow: move reminder_time forward and keep status pending
      const { data, error } = await this.supabase
        .from("reminders")
        .update({
          status: "pending",
          reminder_time: toUTC(validatedParams.snoozeUntil),
          snooze_count: (existing.snooze_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", validatedParams.reminderId)
        .eq("user_id", validatedParams.userId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new NotFoundError("Reminder", validatedParams.reminderId);
      }

      logAudit("SNOOZE_REMINDER", existing.user_id, "reminder", {
        reminderId: data.id,
      });
      logPerformance("snoozeReminder", Date.now() - startTime);

      return {
        success: true,
        newReminderTime: validatedParams.snoozeUntil,
        message: `Reminder snoozed until ${validatedParams.snoozeUntil}`,
      };
    } catch (error) {
      logError("Failed to snooze reminder", error, {
        reminderId: params.reminderId,
      });
      throw handleServiceError(error, "snoozeReminder");
    }
  }

  async completeReminder(params: {
    userId: string;
    reminderId: string;
  }): Promise<{ success: boolean; message: string }> {
    const startTime = Date.now();

    try {
      // Validate input
      const validatedParams = validate(completeReminderSchema, params);

      // Check if reminder exists
      const { data: existing, error: checkError } = await this.supabase
        .from("reminders")
        .select("id, status, user_id")
        .eq("id", validatedParams.reminderId)
        .eq("user_id", validatedParams.userId)
        .single();

      if (checkError || !existing) {
        throw new NotFoundError("Reminder", validatedParams.reminderId);
      }

      if (existing.status === "completed") {
        return {
          success: true,
          message: "Reminder is already completed",
        };
      }

      const { error } = await this.supabase
        .from("reminders")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", validatedParams.reminderId)
        .eq("user_id", validatedParams.userId);

      if (error) {
        throw error;
      }

      logAudit("COMPLETE_REMINDER", existing.user_id, "reminder", {
        reminderId: validatedParams.reminderId,
      });
      logPerformance("completeReminder", Date.now() - startTime);

      return {
        success: true,
        message: "Reminder marked as completed",
      };
    } catch (error) {
      logError("Failed to complete reminder", error, {
        reminderId: params.reminderId,
      });
      throw handleServiceError(error, "completeReminder");
    }
  }

  async getUpcomingReminders(params: {
    userId: string;
    timeframe: "today" | "tomorrow" | "week" | "month";
    limit?: number;
  }): Promise<{
    reminders: Array<{
      id: string;
      title: string;
      reminderTime: string;
      timeUntil: string;
    }>;
    total: number;
  }> {
    const startTime = Date.now();

    try {
      // Validate input
      const validatedParams = validate(getUpcomingRemindersSchema, params);

      // Fetch user's timezone
      const { data: userTzRow } = await this.supabase
        .from("users")
        .select("timezone")
        .eq("id", validatedParams.userId)
        .single();
      const tz = userTzRow?.timezone || "UTC";

      // Compute window in user's timezone, then convert to UTC
      const zoneNow = DateTime.now().setZone(tz);
      let start = zoneNow;
      let end: DateTime;
      switch (validatedParams.timeframe) {
        case "today":
          // From now until end of day
          end = zoneNow.endOf("day");
          break;
        case "tomorrow":
          // Only tomorrow's day window
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
      dateRange?: { start: string; end: string };
      priority?: "low" | "medium" | "high";
      status?: "pending" | "completed";
    };
    limit?: number;
  }): Promise<{
    results: Array<{
      id: string;
      title: string;
      reminderTime: string;
      relevanceScore: number;
    }>;
    total: number;
  }> {
    const startTime = Date.now();

    try {
      // Validate input
      const validatedParams = validate(searchRemindersSchema, params);

      // Sanitize search query
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
        relevanceScore: 1.0, // TODO: Implement proper relevance scoring
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

  async batchCreateReminders(params: {
    userId: string;
    reminders: Array<{
      title: string;
      reminderTime: string;
      isRecurring?: boolean;
      recurrenceRule?: string;
    }>;
  }): Promise<{
    success: boolean;
    created: number;
    failed: number;
    results: Array<{
      title: string;
      success: boolean;
      reminderId?: string;
      error?: string;
    }>;
  }> {
    const startTime = Date.now();

    try {
      // Validate input
      const validatedParams = validate(batchCreateRemindersSchema, params);

      logInfo("Batch creating reminders", {
        userId: params.userId,
        count: validatedParams.reminders.length,
      });

      const results = [];
      let created = 0;
      let failed = 0;

      // Process reminders with error isolation
      for (const reminder of validatedParams.reminders) {
        try {
          const result = await this.createReminder({
            userId: validatedParams.userId,
            title: reminder.title,
            reminderTime: reminder.reminderTime,
            timezone: "UTC",
            isRecurring: reminder.isRecurring || false,
            recurrenceRule: reminder.recurrenceRule,
          });

          results.push({
            title: reminder.title,
            success: true,
            reminderId: result.reminderId,
          });
          created++;
        } catch (error: any) {
          logError("Failed to create reminder in batch", error, {
            title: reminder.title,
          });
          results.push({
            title: reminder.title,
            success: false,
            error: error.message || "Unknown error",
          });
          failed++;
        }
      }

      logAudit("BATCH_CREATE_REMINDERS", validatedParams.userId, "reminder", {
        created,
        failed,
      });
      logPerformance("batchCreateReminders", Date.now() - startTime, {
        created,
        failed,
      });

      return {
        success: created > 0,
        created,
        failed,
        results,
      };
    } catch (error) {
      logError("Failed to batch create reminders", error, {
        userId: params.userId,
      });
      throw handleServiceError(error, "batchCreateReminders");
    }
  }
}
