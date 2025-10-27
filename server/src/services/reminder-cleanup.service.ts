import cron from 'node-cron';
import { getSupabaseClient } from '../lib/supabase';
import { logInfo, logError, logWarn } from '../utils/logger';

export class ReminderCleanupService {
  private supabase = getSupabaseClient();
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning = false;

  /**
   * Start the cleanup cron job
   * Runs every 3 seconds to delete completed reminders
   */
  start() {
    if (this.isRunning) {
      logWarn('Reminder cleanup service is already running');
      return;
    }

    logInfo('Starting reminder cleanup service (runs every 3 seconds)');
    
    // Cron pattern for every 3 seconds: "*/3 * * * * *"
    this.cronJob = cron.schedule('*/3 * * * * *', async () => {
      await this.cleanupCompletedReminders();
    });

    this.isRunning = true;
  }

  /**
   * Stop the cleanup cron job
   */
  stop() {
    if (!this.isRunning) {
      logWarn('Reminder cleanup service is not running');
      return;
    }

    logInfo('Stopping reminder cleanup service');
    
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }

    this.isRunning = false;
  }

  /**
   * Delete all completed reminders from the database
   */
  private async cleanupCompletedReminders() {
    try {
      const { data, error } = await this.supabase
        .from('reminders')
        .delete()
        .eq('status', 'completed')
        .select('id, title, user_id');

      if (error) {
        logError('Failed to cleanup completed reminders', error);
        return;
      }

      if (data && data.length > 0) {
        logInfo(`Cleaned up ${data.length} completed reminder(s)`, {
          count: data.length,
          reminderIds: data.map(r => r.id),
        });
      }
    } catch (error) {
      logError('Error in cleanup completed reminders', error);
    }
  }

  /**
   * Manually trigger cleanup (for testing or on-demand cleanup)
   */
  async manualCleanup(): Promise<{ success: boolean; deletedCount: number; message: string }> {
    try {
      const { data, error } = await this.supabase
        .from('reminders')
        .delete()
        .eq('status', 'completed')
        .select('id');

      if (error) {
        throw error;
      }

      const deletedCount = data?.length || 0;
      
      return {
        success: true,
        deletedCount,
        message: `Successfully deleted ${deletedCount} completed reminder(s)`,
      };
    } catch (error) {
      logError('Manual cleanup failed', error);
      return {
        success: false,
        deletedCount: 0,
        message: `Failed to cleanup: ${error}`,
      };
    }
  }

  /**
   * Get count of completed reminders pending cleanup
   */
  async getCompletedCount(): Promise<number> {
    try {
      const { count, error } = await this.supabase
        .from('reminders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed');

      if (error) {
        logError('Failed to get completed reminders count', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      logError('Error getting completed count', error);
      return 0;
    }
  }
}
