import { getSupabaseClient } from '../lib/supabase';
import { User } from '../models/types';
import { validate, updateUserSettingsSchema, getUserSettingsSchema, setQuietHoursSchema } from '../utils/validators';
import { handleServiceError, NotFoundError } from '../utils/errors';
import { logInfo, logError, logAudit, logPerformance } from '../utils/logger';

export class UserService {
  private supabase = getSupabaseClient();

  async findOrCreateUser(whatsappId: string, phoneNumber: string, name?: string): Promise<User> {
    // Check if user exists
    const { data: existingUser } = await this.supabase
      .from('users')
      .select('*')
      .eq('whatsapp_id', whatsappId)
      .single();

    if (existingUser) {
      // Update last_active_at
      await this.supabase
        .from('users')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', existingUser.id);

      return existingUser;
    }

    // Create new user
    const { data: newUser, error } = await this.supabase
      .from('users')
      .insert({
        whatsapp_id: whatsappId,
        phone_number: phoneNumber,
        name: name || phoneNumber,
        timezone: 'UTC',
        language: 'en',
      })
      .select()
      .single();

    if (error) throw error;
    return newUser;
  }

  async getUserByWhatsAppId(whatsappId: string): Promise<User | null> {
    const { data } = await this.supabase
      .from('users')
      .select('*')
      .eq('whatsapp_id', whatsappId)
      .single();

    return data;
  }

  async updateUserSettings(
    userId: string,
    settings: {
      timezone?: string;
      language?: string;
      defaultReminderTime?: string;
      notificationPreferences?: {
        enabled: boolean;
        advanceNotice?: number;
      };
    }
  ): Promise<{ success: boolean; message: string }> {
    const startTime = Date.now();
    
    try {
      // Validate input
      const validatedParams = validate(updateUserSettingsSchema, { userId, ...settings });
      
      // Check if user exists
      const { data: existing, error: checkError } = await this.supabase
        .from('users')
        .select('id')
        .eq('id', validatedParams.userId)
        .single();

      if (checkError || !existing) {
        throw new NotFoundError('User', validatedParams.userId);
      }

      const updateData: any = {};

      if (settings.timezone) updateData.timezone = settings.timezone;
      if (settings.language) updateData.language = settings.language;
      if (settings.defaultReminderTime) updateData.default_reminder_time = settings.defaultReminderTime;
      if (settings.notificationPreferences) {
        updateData.notification_enabled = settings.notificationPreferences.enabled;
        if (settings.notificationPreferences.advanceNotice !== undefined) {
          updateData.advance_notice_minutes = settings.notificationPreferences.advanceNotice;
        }
      }
      updateData.updated_at = new Date().toISOString();

      const { error } = await this.supabase
        .from('users')
        .update(updateData)
        .eq('id', validatedParams.userId);

      if (error) {
        throw error;
      }

      logAudit('UPDATE_USER_SETTINGS', validatedParams.userId, 'user', { settings: Object.keys(updateData) });
      logPerformance('updateUserSettings', Date.now() - startTime);

      return { success: true, message: 'Settings updated successfully' };
    } catch (error) {
      logError('Failed to update user settings', error, { userId });
      throw handleServiceError(error, 'updateUserSettings');
    }
  }

  async getUserSettings(userId: string) {
    const startTime = Date.now();
    
    try {
      // Validate input
      const validatedParams = validate(getUserSettingsSchema, { userId });
      
      const { data: user, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', validatedParams.userId)
        .single();

      if (error || !user) {
        throw new NotFoundError('User', validatedParams.userId);
      }

      // Get calendar connections with error handling
      let calendarConnections: string[] = [];
      try {
        const { data: calendars, error: calError } = await this.supabase
          .from('calendar_connections')
          .select('provider')
          .eq('user_id', validatedParams.userId);

        if (calError) {
          logError('Failed to fetch calendar connections', calError, { userId: validatedParams.userId });
        } else {
          calendarConnections = calendars?.map((c) => c.provider) || [];
        }
      } catch (error) {
        logError('Error fetching calendar connections', error, { userId: validatedParams.userId });
      }

      logPerformance('getUserSettings', Date.now() - startTime);

      return {
        timezone: user.timezone,
        language: user.language,
        defaultReminderTime: user.default_reminder_time,
        notificationPreferences: {
          enabled: user.notification_enabled,
          advanceNotice: user.advance_notice_minutes,
        },
        calendarConnections,
      };
    } catch (error) {
      logError('Failed to get user settings', error, { userId });
      throw handleServiceError(error, 'getUserSettings');
    }
  }

  async setQuietHours(
    userId: string,
    enabled: boolean,
    startTime: string,
    endTime: string,
    days?: string[]
  ): Promise<{ success: boolean; message: string }> {
    const startTimeMs = Date.now();
    
    try {
      // Validate input
      const validatedParams = validate(setQuietHoursSchema, { userId, enabled, startTime, endTime, days });
      
      // Check if user exists
      const { data: existing, error: checkError } = await this.supabase
        .from('users')
        .select('id')
        .eq('id', validatedParams.userId)
        .single();

      if (checkError || !existing) {
        throw new NotFoundError('User', validatedParams.userId);
      }

      const { error } = await this.supabase
        .from('users')
        .update({
          quiet_hours_enabled: validatedParams.enabled,
          quiet_hours_start: validatedParams.startTime,
          quiet_hours_end: validatedParams.endTime,
          quiet_hours_days: validatedParams.days,
          updated_at: new Date().toISOString(),
        })
        .eq('id', validatedParams.userId);

      if (error) {
        throw error;
      }

      logAudit('SET_QUIET_HOURS', validatedParams.userId, 'user', { enabled: validatedParams.enabled });
      logPerformance('setQuietHours', Date.now() - startTimeMs);

      return { success: true, message: 'Quiet hours updated successfully' };
    } catch (error) {
      logError('Failed to set quiet hours', error, { userId });
      throw handleServiceError(error, 'setQuietHours');
    }
  }
}
