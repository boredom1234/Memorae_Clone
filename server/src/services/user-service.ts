import { getSupabaseClient } from '../lib/supabase';
import { User } from '../models/types';

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

    const { error } = await this.supabase
      .from('users')
      .update(updateData)
      .eq('id', userId);

    if (error) throw error;

    return { success: true, message: 'Settings updated successfully' };
  }

  async getUserSettings(userId: string) {
    const { data: user, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;

    const { data: calendars } = await this.supabase
      .from('calendar_connections')
      .select('provider')
      .eq('user_id', userId);

    return {
      timezone: user.timezone,
      language: user.language,
      defaultReminderTime: user.default_reminder_time,
      notificationPreferences: {
        enabled: user.notification_enabled,
        advanceNotice: user.advance_notice_minutes,
      },
      calendarConnections: calendars?.map((c) => c.provider) || [],
    };
  }

  async setQuietHours(
    userId: string,
    enabled: boolean,
    startTime: string,
    endTime: string,
    days?: string[]
  ): Promise<{ success: boolean; message: string }> {
    const { error } = await this.supabase
      .from('users')
      .update({
        quiet_hours_enabled: enabled,
        quiet_hours_start: startTime,
        quiet_hours_end: endTime,
        quiet_hours_days: days,
      })
      .eq('id', userId);

    if (error) throw error;

    return { success: true, message: 'Quiet hours updated successfully' };
  }
}
