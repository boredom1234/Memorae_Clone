import { getSupabaseClient } from '../lib/supabase';
import { logInfo, logError, logWarn } from '../utils/logger';

export interface ReminderNotificationCallback {
  (reminder: {
    id: string;
    userId: string;
    title: string;
    notes?: string;
    priority: 'low' | 'medium' | 'high';
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
      // 3. Not yet notified (we'll add a 'notified' flag)
      const { data: dueReminders, error } = await this.supabase
        .from('reminders')
        .select('id, user_id, title, notes, priority, reminder_time')
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
            });
          }

          // Mark reminder as completed (or you could add a 'notified' status)
          await this.supabase
            .from('reminders')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', reminder.id);

          logInfo(`Reminder notification sent and marked as completed`, {
            reminderId: reminder.id,
            title: reminder.title,
          });
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
}
