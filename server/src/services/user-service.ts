import { getSupabaseClient } from "../lib/supabase";
import { User } from "../models/types";
import {
  validate,
  updateUserSettingsSchema,
  getUserSettingsSchema,
  setQuietHoursSchema,
} from "../utils/validators";
import { handleServiceError, NotFoundError } from "../utils/errors";
import { logError, logAudit, logPerformance } from "../utils/logger";
export class UserService {
  private supabase = getSupabaseClient();
  async findOrCreateUser(
    whatsappId: string,
    phoneNumber: string,
    name?: string,
  ): Promise<{
    user: User;
    isNew: boolean;
  }> {
    const { data: existingUser } = await this.supabase
      .from("users")
      .select("*")
      .eq("whatsapp_id", whatsappId)
      .single();
    if (existingUser) {
      await this.supabase
        .from("users")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", existingUser.id);
      return { user: existingUser, isNew: false };
    }
    const { data: newUser, error } = await this.supabase
      .from("users")
      .insert({
        whatsapp_id: whatsappId,
        phone_number: phoneNumber,
        name: name || phoneNumber,
        timezone: "UTC",
        language: "en",
      })
      .select()
      .single();
    if (error) throw error;
    return { user: newUser, isNew: true };
  }
  async findOrCreateTelegramUser(
    telegramId: string,
    name?: string,
    phoneNumber?: string,
  ): Promise<{
    user: User;
    isNew: boolean;
  }> {
    const { data: existingUser } = await this.supabase
      .from("users")
      .select("*")
      .eq("telegram_id", telegramId)
      .single();
    if (existingUser) {
      await this.supabase
        .from("users")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", existingUser.id);
      return { user: existingUser, isNew: false };
    }
    if (phoneNumber) {
      const { data: whatsappUser } = await this.supabase
        .from("users")
        .select("*")
        .eq("phone_number", phoneNumber)
        .is("telegram_id", null)
        .single();
      if (whatsappUser) {
        const { data: linkedUser, error: updateError } = await this.supabase
          .from("users")
          .update({
            telegram_id: telegramId,
            last_active_at: new Date().toISOString(),
          })
          .eq("id", whatsappUser.id)
          .select()
          .single();
        if (updateError) throw updateError;
        return { user: linkedUser, isNew: false };
      }
    }
    const { data: newUser, error } = await this.supabase
      .from("users")
      .insert({
        telegram_id: telegramId,
        phone_number: phoneNumber || null,
        name: name || `Telegram User ${telegramId}`,
        timezone: "UTC",
        language: "en",
      })
      .select()
      .single();
    if (error) throw error;
    return { user: newUser, isNew: true };
  }
  async getUserByWhatsAppId(whatsappId: string): Promise<User | null> {
    const { data } = await this.supabase
      .from("users")
      .select("*")
      .eq("whatsapp_id", whatsappId)
      .single();
    return data;
  }
  async getUserByTelegramId(telegramId: string): Promise<User | null> {
    const { data } = await this.supabase
      .from("users")
      .select("*")
      .eq("telegram_id", telegramId)
      .single();
    return data;
  }
  async linkTelegramToUser(
    userId: string,
    telegramId: string,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const { data: existingTelegram } = await this.supabase
        .from("users")
        .select("id")
        .eq("telegram_id", telegramId)
        .single();
      if (existingTelegram && existingTelegram.id !== userId) {
        return {
          success: false,
          message: "This Telegram account is already linked to another user",
        };
      }
      const { error } = await this.supabase
        .from("users")
        .update({
          telegram_id: telegramId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (error) throw error;
      return {
        success: true,
        message: "Telegram account linked successfully",
      };
    } catch (error) {
      logError("Failed to link Telegram account", error, {
        userId,
        telegramId,
      });
      throw handleServiceError(error, "linkTelegramToUser");
    }
  }
  async linkWhatsAppToUser(
    userId: string,
    whatsappId: string,
    phoneNumber: string,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const { data: existingWhatsApp } = await this.supabase
        .from("users")
        .select("id")
        .eq("whatsapp_id", whatsappId)
        .single();
      if (existingWhatsApp && existingWhatsApp.id !== userId) {
        return {
          success: false,
          message: "This WhatsApp account is already linked to another user",
        };
      }
      const { error } = await this.supabase
        .from("users")
        .update({
          whatsapp_id: whatsappId,
          phone_number: phoneNumber,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (error) throw error;
      return {
        success: true,
        message: "WhatsApp account linked successfully",
      };
    } catch (error) {
      logError("Failed to link WhatsApp account", error, {
        userId,
        whatsappId,
      });
      throw handleServiceError(error, "linkWhatsAppToUser");
    }
  }
  async updateUserSettings(
    userId: string,
    settings: {
      name?: string;
      timezone?: string;
      language?: string;
      defaultReminderTime?: string;
      notificationEnabled?: boolean;
      advanceNoticeMinutes?: number;
      quietHoursEnabled?: boolean;
      quietHoursStart?: string | null;
      quietHoursEnd?: string | null;
      quietHoursDays?: string[] | null;
      notificationPreferences?: {
        enabled: boolean;
        advanceNotice?: number;
      };
    },
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    const startTime = Date.now();
    try {
      const validatedParams = validate(updateUserSettingsSchema, {
        userId,
        ...settings,
      });
      const { data: existing, error: checkError } = await this.supabase
        .from("users")
        .select("id")
        .eq("id", validatedParams.userId)
        .single();
      if (checkError || !existing) {
        throw new NotFoundError("User", validatedParams.userId);
      }
      const updateData: any = {};
      if (settings.name !== undefined) updateData.name = settings.name;
      if (settings.timezone !== undefined)
        updateData.timezone = settings.timezone;
      if (settings.language !== undefined)
        updateData.language = settings.language;
      if (settings.defaultReminderTime !== undefined)
        updateData.default_reminder_time = settings.defaultReminderTime;
      if (settings.notificationEnabled !== undefined)
        updateData.notification_enabled = settings.notificationEnabled;
      if (settings.advanceNoticeMinutes !== undefined)
        updateData.advance_notice_minutes = settings.advanceNoticeMinutes;
      if (settings.quietHoursEnabled !== undefined)
        updateData.quiet_hours_enabled = settings.quietHoursEnabled;
      if (settings.quietHoursStart !== undefined)
        updateData.quiet_hours_start = settings.quietHoursStart;
      if (settings.quietHoursEnd !== undefined)
        updateData.quiet_hours_end = settings.quietHoursEnd;
      if (settings.quietHoursDays !== undefined)
        updateData.quiet_hours_days = settings.quietHoursDays;
      if (settings.notificationPreferences) {
        updateData.notification_enabled =
          settings.notificationPreferences.enabled;
        if (settings.notificationPreferences.advanceNotice !== undefined) {
          updateData.advance_notice_minutes =
            settings.notificationPreferences.advanceNotice;
        }
      }
      updateData.updated_at = new Date().toISOString();
      const { error } = await this.supabase
        .from("users")
        .update(updateData)
        .eq("id", validatedParams.userId);
      if (error) {
        throw error;
      }
      logAudit("UPDATE_USER_SETTINGS", validatedParams.userId, "user", {
        settings: Object.keys(updateData),
      });
      logPerformance("updateUserSettings", Date.now() - startTime);
      return { success: true, message: "Settings updated successfully" };
    } catch (error) {
      logError("Failed to update user settings", error, { userId });
      throw handleServiceError(error, "updateUserSettings");
    }
  }
  async getUserSettings(userId: string) {
    const startTime = Date.now();
    try {
      const validatedParams = validate(getUserSettingsSchema, { userId });
      const { data: user, error } = await this.supabase
        .from("users")
        .select("*")
        .eq("id", validatedParams.userId)
        .single();
      if (error || !user) {
        throw new NotFoundError("User", validatedParams.userId);
      }
      let calendarConnections: string[] = [];
      try {
        const { data: calendars, error: calError } = await this.supabase
          .from("calendar_connections")
          .select("provider")
          .eq("user_id", validatedParams.userId);
        if (calError) {
          logError("Failed to fetch calendar connections", calError, {
            userId: validatedParams.userId,
          });
        } else {
          calendarConnections = calendars?.map((c) => c.provider) || [];
        }
      } catch (error) {
        logError("Error fetching calendar connections", error, {
          userId: validatedParams.userId,
        });
      }
      logPerformance("getUserSettings", Date.now() - startTime);
      return {
        id: user.id,
        name: user.name,
        phoneNumber: user.phone_number,
        whatsappId: user.whatsapp_id,
        timezone: user.timezone,
        language: user.language,
        defaultReminderTime: user.default_reminder_time,
        notificationPreferences: {
          enabled: user.notification_enabled,
          advanceNotice: user.advance_notice_minutes,
        },
        quietHours: {
          enabled: user.quiet_hours_enabled,
          startTime: user.quiet_hours_start,
          endTime: user.quiet_hours_end,
          days: user.quiet_hours_days,
        },
        calendarConnections,
      };
    } catch (error) {
      logError("Failed to get user settings", error, { userId });
      throw handleServiceError(error, "getUserSettings");
    }
  }
  async setQuietHours(
    userId: string,
    enabled: boolean,
    startTime: string,
    endTime: string,
    days?: string[],
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    const startTimeMs = Date.now();
    try {
      const validatedParams = validate(setQuietHoursSchema, {
        userId,
        enabled,
        startTime,
        endTime,
        days,
      });
      const { data: existing, error: checkError } = await this.supabase
        .from("users")
        .select("id")
        .eq("id", validatedParams.userId)
        .single();
      if (checkError || !existing) {
        throw new NotFoundError("User", validatedParams.userId);
      }
      const { error } = await this.supabase
        .from("users")
        .update({
          quiet_hours_enabled: validatedParams.enabled,
          quiet_hours_start: validatedParams.startTime,
          quiet_hours_end: validatedParams.endTime,
          quiet_hours_days: validatedParams.days,
          updated_at: new Date().toISOString(),
        })
        .eq("id", validatedParams.userId);
      if (error) {
        throw error;
      }
      logAudit("SET_QUIET_HOURS", validatedParams.userId, "user", {
        enabled: validatedParams.enabled,
      });
      logPerformance("setQuietHours", Date.now() - startTimeMs);
      return { success: true, message: "Quiet hours updated successfully" };
    } catch (error) {
      logError("Failed to set quiet hours", error, { userId });
      throw handleServiceError(error, "setQuietHours");
    }
  }
}
