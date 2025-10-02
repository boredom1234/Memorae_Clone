import { getSupabaseClient } from '../lib/supabase';
import { logInfo, logError, logWarn } from '../utils/logger';
import * as chrono from 'chrono-node';

export interface ReminderNotificationCallback {
  (reminder: {
    id: string;
    userId: string;
    title: string;
    notes?: string;
    priority: 'low' | 'medium' | 'high';
    reminderTime: string;
    isRecurring: boolean;
  }): Promise<void>;
}

export class ReminderScheduler {
  private supabase = getSupabaseClient();
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private checkIntervalMs: number;
  private onReminderDue?: ReminderNotificationCallback;

  constructor(checkIntervalMs: number = 30000) { // Default: check every 30 seconds
    this.checkIntervalMs = checkIntervalMs;
  }

  /**
   * Set the callback function to be called when a reminder is due
   */
  setNotificationCallback(callback: ReminderNotificationCallback) {
    this.onReminderDue = callback;
  }

  /**
   * Start the reminder scheduler
   */
  start() {
    if (this.isRunning) {
      logWarn('Reminder scheduler is already running');
      return;
    }

    logInfo('Starting reminder scheduler', { checkIntervalMs: this.checkIntervalMs });
    this.isRunning = true;

    // Check immediately on start
    this.checkDueReminders();

    // Then check at regular intervals
    this.intervalId = setInterval(() => {
      this.checkDueReminders();
    }, this.checkIntervalMs);
  }

  /**
   * Stop the reminder scheduler
   */
  stop() {
    if (!this.isRunning) {
      logWarn('Reminder scheduler is not running');
      return;
    }

    logInfo('Stopping reminder scheduler');
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
  }

  /**
   * Check for due reminders and trigger notifications
   */
  private async checkDueReminders() {
    try {
      const now = new Date().toISOString();

      // Query for reminders that are:
      // 1. Status is 'pending'
      // 2. Reminder time is in the past or now
      const { data: dueReminders, error } = await this.supabase
        .from('reminders')
        .select('id, user_id, title, notes, priority, reminder_time, is_recurring, recurrence_rule, recurrence_end_date')
        .eq('status', 'pending')
        .lte('reminder_time', now)
        .order('reminder_time', { ascending: true })
        .limit(50); // Process max 50 reminders per check

      if (error) {
        logError('Failed to fetch due reminders', error);
        return;
      }

      if (!dueReminders || dueReminders.length === 0) {
        return; // No due reminders
      }

      logInfo(`Found ${dueReminders.length} due reminder(s)`, { count: dueReminders.length });

      // Process each due reminder
      for (const reminder of dueReminders) {
        try {
          // Send notification
          if (this.onReminderDue) {
            await this.onReminderDue({
              id: reminder.id,
              userId: reminder.user_id,
              title: reminder.title,
              notes: reminder.notes,
              priority: reminder.priority,
              reminderTime: reminder.reminder_time,
              isRecurring: reminder.is_recurring,
            });
          }

          // Handle recurring vs one-time reminders
          if (reminder.is_recurring && reminder.recurrence_rule) {
            // Calculate next occurrence
            const nextOccurrence = this.calculateNextOccurrence(
              reminder.reminder_time,
              reminder.recurrence_rule,
              reminder.recurrence_end_date
            );

            if (nextOccurrence) {
              // Update reminder with next occurrence time
              await this.supabase
                .from('reminders')
                .update({
                  reminder_time: nextOccurrence.toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', reminder.id);

              logInfo(`Recurring reminder updated with next occurrence`, {
                reminderId: reminder.id,
                title: reminder.title,
                nextOccurrence: nextOccurrence.toISOString(),
              });
            } else {
              // No more occurrences (reached end date or invalid rule)
              await this.supabase
                .from('reminders')
                .update({
                  status: 'completed',
                  completed_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', reminder.id);

              logInfo(`Recurring reminder completed (no more occurrences)`, {
                reminderId: reminder.id,
                title: reminder.title,
              });
            }
          } else {
            // One-time reminder - mark as completed
            await this.supabase
              .from('reminders')
              .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', reminder.id);

            logInfo(`One-time reminder marked as completed`, {
              reminderId: reminder.id,
              title: reminder.title,
            });
          }
        } catch (error) {
          logError(`Failed to process reminder ${reminder.id}`, error, {
            reminderId: reminder.id,
            title: reminder.title,
          });
        }
      }
    } catch (error) {
      logError('Error in checkDueReminders', error);
    }
  }

  /**
   * Manually trigger a check for due reminders
   */
  async triggerCheck() {
    await this.checkDueReminders();
  }

  /**
   * Check if scheduler is running
   */
  isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Calculate the next occurrence of a recurring reminder
   * @param currentTime - Current reminder time
   * @param recurrenceRule - Recurrence rule (e.g., "daily", "weekly", "monthly", "every 2 days")
   * @param endDate - Optional end date for recurrence
   * @returns Next occurrence date or null if no more occurrences
   */
  private calculateNextOccurrence(
    currentTime: string,
    recurrenceRule: string,
    endDate?: string | null
  ): Date | null {
    try {
      const current = new Date(currentTime);
      const now = new Date();
      let next: Date | null = null;

      // Normalize the recurrence rule
      const rule = recurrenceRule.toLowerCase().trim();

      // Parse common recurrence patterns
      if (rule === 'daily' || rule === 'every day') {
        next = new Date(current);
        next.setDate(next.getDate() + 1);
      } else if (rule === 'weekly' || rule === 'every week') {
        next = new Date(current);
        next.setDate(next.getDate() + 7);
      } else if (rule === 'monthly' || rule === 'every month') {
        next = new Date(current);
        next.setMonth(next.getMonth() + 1);
      } else if (rule === 'yearly' || rule === 'every year') {
        next = new Date(current);
        next.setFullYear(next.getFullYear() + 1);
      } else if (rule.match(/^every (\d+) days?$/)) {
        // Pattern: "every N days" or "every N day"
        const match = rule.match(/^every (\d+) days?$/);
        const days = parseInt(match![1], 10);
        next = new Date(current);
        next.setDate(next.getDate() + days);
      } else if (rule.match(/^every (\d+) weeks?$/)) {
        // Pattern: "every N weeks" or "every N week"
        const match = rule.match(/^every (\d+) weeks?$/);
        const weeks = parseInt(match![1], 10);
        next = new Date(current);
        next.setDate(next.getDate() + (weeks * 7));
      } else if (rule.match(/^every (\d+) months?$/)) {
        // Pattern: "every N months" or "every N month"
        const match = rule.match(/^every (\d+) months?$/);
        const months = parseInt(match![1], 10);
        next = new Date(current);
        next.setMonth(next.getMonth() + months);
      } else if (rule.match(/^every (\d+) hours?$/)) {
        // Pattern: "every N hours" or "every N hour"
        const match = rule.match(/^every (\d+) hours?$/);
        const hours = parseInt(match![1], 10);
        next = new Date(current);
        next.setHours(next.getHours() + hours);
      } else if (rule.match(/weekdays?/)) {
        // Weekdays only (Monday-Friday)
        next = new Date(current);
        do {
          next.setDate(next.getDate() + 1);
        } while (next.getDay() === 0 || next.getDay() === 6); // Skip Saturday (6) and Sunday (0)
      } else if (rule.match(/weekends?/)) {
        // Weekends only (Saturday-Sunday)
        next = new Date(current);
        next.setDate(next.getDate() + 1);
        while (next.getDay() !== 0 && next.getDay() !== 6) {
          next.setDate(next.getDate() + 1);
        }
      } else {
        // Try to parse as a natural language expression
        logWarn(`Unknown recurrence rule: ${recurrenceRule}, attempting natural language parse`);
        // Default to daily if we can't parse
        next = new Date(current);
        next.setDate(next.getDate() + 1);
      }

      // Ensure next occurrence is in the future
      if (next && next <= now) {
        // If calculated next is still in the past, recursively calculate again
        return this.calculateNextOccurrence(next.toISOString(), recurrenceRule, endDate);
      }

      // Check if next occurrence exceeds end date
      if (next && endDate) {
        const end = new Date(endDate);
        if (next > end) {
          logInfo('Next occurrence exceeds recurrence end date', {
            nextOccurrence: next.toISOString(),
            endDate: endDate,
          });
          return null;
        }
      }

      return next;
    } catch (error) {
      logError('Failed to calculate next occurrence', error, {
        currentTime,
        recurrenceRule,
      });
      return null;
    }
  }
}
