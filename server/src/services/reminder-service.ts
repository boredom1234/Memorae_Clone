import { getSupabaseClient } from '../lib/supabase';
import { Reminder } from '../models/types';

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
    priority?: 'low' | 'medium' | 'high';
  }): Promise<{ success: boolean; reminderId: string; message: string; scheduledFor: string }> {
    const { data, error } = await this.supabase
      .from('reminders')
      .insert({
        user_id: params.userId,
        title: params.title,
        reminder_time: params.reminderTime,
        is_recurring: params.isRecurring,
        recurrence_rule: params.recurrenceRule,
        notes: params.notes,
        priority: params.priority || 'medium',
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      reminderId: data.id,
      message: `Reminder "${params.title}" created successfully`,
      scheduledFor: data.reminder_time,
    };
  }

  async updateReminder(params: {
    reminderId: string;
    title?: string;
    reminderTime?: string;
    isRecurring?: boolean;
    recurrenceRule?: string;
    notes?: string;
    priority?: 'low' | 'medium' | 'high';
  }): Promise<{ success: boolean; message: string; updatedReminder: Reminder }> {
    const updateData: any = {};
    if (params.title) updateData.title = params.title;
    if (params.reminderTime) updateData.reminder_time = params.reminderTime;
    if (params.isRecurring !== undefined) updateData.is_recurring = params.isRecurring;
    if (params.recurrenceRule) updateData.recurrence_rule = params.recurrenceRule;
    if (params.notes !== undefined) updateData.notes = params.notes;
    if (params.priority) updateData.priority = params.priority;

    const { data, error } = await this.supabase
      .from('reminders')
      .update(updateData)
      .eq('id', params.reminderId)
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      message: 'Reminder updated successfully',
      updatedReminder: data,
    };
  }

  async deleteReminder(params: {
    userId: string;
    reminderId?: string;
    searchQuery?: string;
  }): Promise<{ success: boolean; deletedCount: number; message: string }> {
    let query = this.supabase.from('reminders').delete().eq('user_id', params.userId);

    if (params.reminderId) {
      query = query.eq('id', params.reminderId);
    } else if (params.searchQuery) {
      query = query.ilike('title', `%${params.searchQuery}%`);
    }

    const { data, error } = await query.select();

    if (error) throw error;

    return {
      success: true,
      deletedCount: data?.length || 0,
      message: `${data?.length || 0} reminder(s) deleted successfully`,
    };
  }

  async listReminders(params: {
    userId: string;
    status?: 'pending' | 'completed' | 'all';
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
    sortBy?: 'time' | 'priority' | 'created';
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
    let query = this.supabase.from('reminders').select('*', { count: 'exact' }).eq('user_id', params.userId);

    if (params.status && params.status !== 'all') {
      query = query.eq('status', params.status);
    }

    if (params.startDate) {
      query = query.gte('reminder_time', params.startDate);
    }

    if (params.endDate) {
      query = query.lte('reminder_time', params.endDate);
    }

    // Sorting
    const sortBy = params.sortBy || 'time';
    if (sortBy === 'time') {
      query = query.order('reminder_time', { ascending: true });
    } else if (sortBy === 'priority') {
      query = query.order('priority', { ascending: false });
    } else if (sortBy === 'created') {
      query = query.order('created_at', { ascending: false });
    }

    const limit = params.limit || 50;
    const offset = params.offset || 0;

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    const reminders = (data || []).map((r) => ({
      id: r.id,
      title: r.title,
      reminderTime: r.reminder_time,
      isRecurring: r.is_recurring,
      priority: r.priority,
      createdAt: r.created_at,
    }));

    return {
      reminders,
      total: count || 0,
      hasMore: (count || 0) > offset + limit,
    };
  }

  async snoozeReminder(params: {
    reminderId: string;
    snoozeUntil: string;
    snoozeDuration?: number;
  }): Promise<{ success: boolean; newReminderTime: string; message: string }> {
    const { data, error } = await this.supabase
      .from('reminders')
      .update({
        status: 'snoozed',
        snoozed_until: params.snoozeUntil,
        snooze_count: this.supabase.rpc('increment', { x: 1 }),
      })
      .eq('id', params.reminderId)
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      newReminderTime: params.snoozeUntil,
      message: `Reminder snoozed until ${params.snoozeUntil}`,
    };
  }

  async completeReminder(params: {
    reminderId: string;
  }): Promise<{ success: boolean; message: string }> {
    const { error } = await this.supabase
      .from('reminders')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', params.reminderId);

    if (error) throw error;

    return {
      success: true,
      message: 'Reminder marked as completed',
    };
  }

  async getUpcomingReminders(params: {
    userId: string;
    timeframe: 'today' | 'tomorrow' | 'week' | 'month';
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
    const now = new Date();
    let endDate: Date;

    switch (params.timeframe) {
      case 'today':
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'tomorrow':
        endDate = new Date(now);
        endDate.setDate(endDate.getDate() + 1);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'week':
        endDate = new Date(now);
        endDate.setDate(endDate.getDate() + 7);
        break;
      case 'month':
        endDate = new Date(now);
        endDate.setMonth(endDate.getMonth() + 1);
        break;
    }

    const { data, error } = await this.supabase
      .from('reminders')
      .select('*')
      .eq('user_id', params.userId)
      .eq('status', 'pending')
      .gte('reminder_time', now.toISOString())
      .lte('reminder_time', endDate.toISOString())
      .order('reminder_time', { ascending: true })
      .limit(params.limit || 10);

    if (error) throw error;

    const reminders = (data || []).map((r) => {
      const reminderTime = new Date(r.reminder_time);
      const diffMs = reminderTime.getTime() - now.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      let timeUntil: string;
      if (diffDays > 0) {
        timeUntil = `${diffDays} day${diffDays > 1 ? 's' : ''}`;
      } else if (diffHours > 0) {
        timeUntil = `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
      } else {
        timeUntil = `${diffMins} minute${diffMins > 1 ? 's' : ''}`;
      }

      return {
        id: r.id,
        title: r.title,
        reminderTime: r.reminder_time,
        timeUntil,
      };
    });

    return {
      reminders,
      total: reminders.length,
    };
  }

  async searchReminders(params: {
    userId: string;
    query: string;
    filters?: {
      dateRange?: { start: string; end: string };
      priority?: 'low' | 'medium' | 'high';
      status?: 'pending' | 'completed';
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
    let query = this.supabase
      .from('reminders')
      .select('*')
      .eq('user_id', params.userId)
      .or(`title.ilike.%${params.query}%,notes.ilike.%${params.query}%`);

    if (params.filters?.dateRange) {
      query = query.gte('reminder_time', params.filters.dateRange.start).lte('reminder_time', params.filters.dateRange.end);
    }

    if (params.filters?.priority) {
      query = query.eq('priority', params.filters.priority);
    }

    if (params.filters?.status) {
      query = query.eq('status', params.filters.status);
    }

    query = query.limit(params.limit || 20);

    const { data, error } = await query;

    if (error) throw error;

    const results = (data || []).map((r) => ({
      id: r.id,
      title: r.title,
      reminderTime: r.reminder_time,
      relevanceScore: 1.0, // TODO: Implement proper relevance scoring
    }));

    return {
      results,
      total: results.length,
    };
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
    const results = [];
    let created = 0;
    let failed = 0;

    for (const reminder of params.reminders) {
      try {
        const result = await this.createReminder({
          userId: params.userId,
          title: reminder.title,
          reminderTime: reminder.reminderTime,
          timezone: 'UTC',
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
        results.push({
          title: reminder.title,
          success: false,
          error: error.message,
        });
        failed++;
      }
    }

    return {
      success: created > 0,
      created,
      failed,
      results,
    };
  }
}
