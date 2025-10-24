import { getSupabaseClient } from "../../lib/supabase";
import {
  Reminder,
  ReminderCreationParams,
  ReminderUpdateParams,
} from "./types";
import {
  validate,
  createReminderSchema,
  updateReminderSchema,
  deleteReminderSchema,
  batchCreateRemindersSchema,
  archiveReminderSchema,
  sanitizeString,
} from "../../utils/validators";
import {
  handleServiceError,
  NotFoundError,
  ValidationError,
} from "../../utils/errors";
import {
  logInfo,
  logError,
  logAudit,
  logPerformance,
} from "../../utils/logger";
import { toUTC } from "../../utils/time-utils";
import { DateTime } from "luxon";
export class ReminderService {
  private supabase = getSupabaseClient();
  async createReminder(params: ReminderCreationParams): Promise<{
    success: boolean;
    reminderId: string;
    message: string;
    scheduledFor: string;
  }> {
    const startTime = Date.now();
    try {
      const validatedParams = validate(createReminderSchema, params);
      logInfo("Creating reminder", {
        userId: params.userId,
        title: params.title,
      });
      try {
        const targetUTC = toUTC(validatedParams.reminderTime);
        const target = DateTime.fromISO(targetUTC, { zone: "utc" });
        const windowStart = target.minus({ minutes: 1 }).toISO();
        const windowEnd = target.plus({ minutes: 1 }).toISO();
        const { data: existing } = await this.supabase
          .from("reminders")
          .select("id, title, reminder_time, status")
          .eq("user_id", validatedParams.userId)
          .eq("status", "pending")
          .gte("reminder_time", windowStart)
          .lte("reminder_time", windowEnd);
        const match = (existing || []).find(
          (r: any) =>
            String(r.title).trim().toLowerCase() ===
            String(validatedParams.title).trim().toLowerCase(),
        );
        if (match) {
          logInfo("Dedup: reusing existing reminder", {
            userId: validatedParams.userId,
            existingReminderId: match.id,
          });
          logPerformance("createReminder", Date.now() - startTime);
          return {
            success: true,
            reminderId: match.id,
            message: `Reminder "${params.title}" already exists around that time`,
            scheduledFor: match.reminder_time,
          };
        }
      } catch (e) {
        logInfo("Dedup check failed, proceeding with insert", {
          error: String(e),
        });
      }
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
  async updateReminder(params: ReminderUpdateParams): Promise<{
    success: boolean;
    message: string;
    updatedReminder: Reminder;
  }> {
    const startTime = Date.now();
    try {
      const validatedParams = validate(updateReminderSchema, params);
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
  }): Promise<{
    success: boolean;
    deletedCount: number;
    message: string;
  }> {
    const startTime = Date.now();
    try {
      const validatedParams = validate(deleteReminderSchema, params);
      let query = this.supabase
        .from("reminders")
        .delete()
        .eq("user_id", validatedParams.userId);
      if (validatedParams.reminderId) {
        query = query.eq("id", validatedParams.reminderId);
      } else if (validatedParams.searchQuery) {
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
      const validatedParams = validate(batchCreateRemindersSchema, params);
      logInfo("Batch creating reminders", {
        userId: params.userId,
        count: validatedParams.reminders.length,
      });
      const results = [];
      let created = 0;
      let failed = 0;
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
  async archiveReminder(params: {
    userId: string;
    reminderId: string;
  }): Promise<{
    success: boolean;
    message: string;
  }> {
    const startTime = Date.now();
    try {
      const validatedParams = validate(archiveReminderSchema, params);
      const { data: existing, error: checkError } = await this.supabase
        .from("reminders")
        .select("id, status, user_id, title")
        .eq("id", validatedParams.reminderId)
        .eq("user_id", validatedParams.userId)
        .single();
      if (checkError || !existing) {
        throw new NotFoundError("Reminder", validatedParams.reminderId);
      }
      const { error } = await this.supabase
        .from("reminders")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", validatedParams.reminderId)
        .eq("user_id", validatedParams.userId);
      if (error) {
        throw error;
      }
      logAudit("ARCHIVE_REMINDER", existing.user_id, "reminder", {
        reminderId: validatedParams.reminderId,
        title: existing.title,
      });
      logPerformance("archiveReminder", Date.now() - startTime);
      return {
        success: true,
        message: "Reminder archived successfully",
      };
    } catch (error) {
      logError("Failed to archive reminder", error, {
        reminderId: params.reminderId,
      });
      throw handleServiceError(error, "archiveReminder");
    }
  }
  async cancelReminder(params: {
    userId: string;
    reminderId: string;
  }): Promise<{
    success: boolean;
    message: string;
  }> {
    const startTime = Date.now();
    try {
      const { userId, reminderId } = params;
      const { data: existing, error: checkError } = await this.supabase
        .from("reminders")
        .select("id, status, user_id")
        .eq("id", reminderId)
        .eq("user_id", userId)
        .single();
      if (checkError || !existing) {
        throw new NotFoundError("Reminder", reminderId);
      }
      const { error } = await this.supabase
        .from("reminders")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", reminderId)
        .eq("user_id", userId);
      if (error) throw error;
      logAudit("CANCEL_REMINDER", existing.user_id, "reminder", { reminderId });
      logPerformance("cancelReminder", Date.now() - startTime);
      return { success: true, message: "Reminder cancelled" };
    } catch (error) {
      logError("Failed to cancel reminder", error, {
        reminderId: params.reminderId,
      });
      throw handleServiceError(error, "cancelReminder");
    }
  }
  async rescheduleReminder(params: {
    userId: string;
    reminderId: string;
    newReminderTime: string;
  }): Promise<{
    success: boolean;
    message: string;
    newTime: string;
  }> {
    const startTime = Date.now();
    try {
      const { userId, reminderId, newReminderTime } = params;
      const { data: existing, error: checkError } = await this.supabase
        .from("reminders")
        .select("id, status, user_id")
        .eq("id", reminderId)
        .eq("user_id", userId)
        .single();
      if (checkError || !existing)
        throw new NotFoundError("Reminder", reminderId);
      if (existing.status === "completed") {
        throw new ValidationError("Cannot reschedule a completed reminder");
      }
      const { data, error } = await this.supabase
        .from("reminders")
        .update({
          reminder_time: toUTC(newReminderTime),
          status: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", reminderId)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) throw error;
      logAudit("RESCHEDULE_REMINDER", userId, "reminder", {
        reminderId,
        newReminderTime,
      });
      logPerformance("rescheduleReminder", Date.now() - startTime);
      return {
        success: true,
        message: "Reminder rescheduled",
        newTime: data.reminder_time,
      };
    } catch (error) {
      logError("Failed to reschedule reminder", error, {
        reminderId: params.reminderId,
      });
      throw handleServiceError(error, "rescheduleReminder");
    }
  }
}
