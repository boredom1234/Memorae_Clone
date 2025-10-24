import { getSupabaseClient } from "../../lib/supabase";
import {
  validate,
  snoozeReminderSchema,
  completeReminderSchema,
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
import { UtilityService } from "../utility-service";
export class ReminderActionsService {
  private supabase = getSupabaseClient();
  private util = new UtilityService();
  async snoozeReminder(params: {
    userId: string;
    reminderId: string;
    snoozeUntil: string;
    snoozeDuration?: number;
  }): Promise<{
    success: boolean;
    newReminderTime: string;
    message: string;
  }> {
    const startTime = Date.now();
    try {
      const validatedParams = validate(snoozeReminderSchema, params);
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
  }): Promise<{
    success: boolean;
    message: string;
  }> {
    const startTime = Date.now();
    try {
      const validatedParams = validate(completeReminderSchema, params);
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
  async snoozeReminderByText(params: {
    userId: string;
    reminderId: string;
    text: string;
    timezone: string;
  }): Promise<{
    success: boolean;
    newReminderTime: string;
    message: string;
  }> {
    try {
      const parsed = this.util.parseNaturalLanguageDate({
        text: params.text,
        timezone: params.timezone,
      });
      const best = this.util.pickBestDate(parsed.extractedDates);
      if (!best) {
        throw new ValidationError(
          "Could not parse a valid future time from text",
        );
      }
      const ensured = this.util.ensureFuture(best, params.timezone);
      return await this.snoozeReminder({
        userId: params.userId,
        reminderId: params.reminderId,
        snoozeUntil: ensured,
      });
    } catch (error) {
      logError("Failed to snooze by text", error, {
        reminderId: params.reminderId,
      });
      throw handleServiceError(error, "snoozeReminderByText");
    }
  }
  async bulkUpdateStatus(params: {
    userId: string;
    reminderIds: string[];
    status: "completed" | "cancelled" | "pending";
  }): Promise<{
    success: boolean;
    updated: number;
  }> {
    try {
      if (!params.reminderIds || params.reminderIds.length === 0) {
        throw new ValidationError("reminderIds required");
      }
      const updateData: any = {
        status: params.status,
        updated_at: new Date().toISOString(),
      };
      if (params.status === "completed")
        updateData.completed_at = new Date().toISOString();
      if (params.status !== "completed") updateData.completed_at = null;
      const { data, error } = await this.supabase
        .from("reminders")
        .update(updateData)
        .eq("user_id", params.userId)
        .in("id", params.reminderIds)
        .select("id");
      if (error) throw error;
      return { success: true, updated: data?.length || 0 };
    } catch (error) {
      logError("Failed to bulk update reminder status", error, {
        userId: params.userId,
      });
      throw handleServiceError(error, "bulkUpdateStatus");
    }
  }
}
