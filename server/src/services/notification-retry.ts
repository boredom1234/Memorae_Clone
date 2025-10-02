import { getSupabaseClient } from "../lib/supabase";
import { logInfo, logError, logWarn } from "../utils/logger";
import { withRetry } from "../utils/error-handler";

export interface RetryableNotification {
  id: string;
  userId: string;
  type: string;
  content: string;
  reminderId?: string;
  recipientWhatsappId?: string;
  retryCount: number;
  errorMessage?: string;
  createdAt: string;
}

export class NotificationRetryService {
  private supabase = getSupabaseClient();
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private retryIntervalMs: number;
  private maxRetries: number;
  private onRetryCallback?: (notification: RetryableNotification) => Promise<boolean>;

  constructor(
    retryIntervalMs: number = 30000, // Check every 30 seconds
    maxRetries: number = 5
  ) {
    this.retryIntervalMs = retryIntervalMs;
    this.maxRetries = maxRetries;
  }

  /**
   * Set the callback function to be called when retrying a notification
   */
  setRetryCallback(callback: (notification: RetryableNotification) => Promise<boolean>) {
    this.onRetryCallback = callback;
  }

  /**
   * Start the retry service
   */
  start() {
    if (this.isRunning) {
      logWarn("Notification retry service is already running");
      return;
    }

    logInfo("Starting notification retry service", {
      retryIntervalMs: this.retryIntervalMs,
      maxRetries: this.maxRetries,
    });
    this.isRunning = true;

    // Check immediately on start
    this.processFailedNotifications();

    // Then check at regular intervals
    this.intervalId = setInterval(() => {
      this.processFailedNotifications();
    }, this.retryIntervalMs);
  }

  /**
   * Stop the retry service
   */
  stop() {
    if (!this.isRunning) {
      logWarn("Notification retry service is not running");
      return;
    }

    logInfo("Stopping notification retry service");

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
  }

  /**
   * Process failed notifications that need retry
   */
  private async processFailedNotifications() {
    try {
      // Get failed notifications that haven't exceeded max retries
      const { data: failedNotifications, error } = await this.supabase
        .from("notification_history")
        .select("*")
        .eq("status", "failed")
        .lt("retry_count", this.maxRetries)
        .order("created_at", { ascending: true })
        .limit(50);

      if (error) {
        logError("Failed to fetch failed notifications", error);
        return;
      }

      if (!failedNotifications || failedNotifications.length === 0) {
        return;
      }

      logInfo(`Processing ${failedNotifications.length} failed notifications for retry`);

      for (const notification of failedNotifications) {
        await this.retryNotification(notification);
      }
    } catch (error) {
      logError("Error processing failed notifications", error);
    }
  }

  /**
   * Retry a specific notification
   */
  private async retryNotification(notification: any) {
    if (!this.onRetryCallback) {
      logWarn("No retry callback configured, skipping notification retry");
      return;
    }

    try {
      // Calculate exponential backoff delay
      const backoffDelay = Math.pow(2, notification.retry_count) * 1000; // 1s, 2s, 4s, 8s, 16s
      const timeSinceCreated = Date.now() - new Date(notification.created_at).getTime();

      // Skip if not enough time has passed for backoff
      if (timeSinceCreated < backoffDelay) {
        return;
      }

      logInfo(`Retrying notification ${notification.id} (attempt ${notification.retry_count + 1})`);

      // Attempt to send the notification
      const success = await withRetry(
        () => this.onRetryCallback!(notification),
        1, // Single attempt here since we handle retries at service level
        0,
        `notification-retry-${notification.id}`
      );

      if (success) {
        // Mark as sent
        await this.supabase
          .from("notification_history")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", notification.id);

        logInfo(`Successfully retried notification ${notification.id}`);
      } else {
        // Increment retry count
        await this.incrementRetryCount(notification);
      }
    } catch (error) {
      logError(`Failed to retry notification ${notification.id}`, error);
      await this.incrementRetryCount(notification, error);
    }
  }

  /**
   * Increment retry count and update error message
   */
  private async incrementRetryCount(notification: any, error?: any) {
    const newRetryCount = notification.retry_count + 1;
    const errorMessage = error?.message || "Retry failed";

    const updateData: any = {
      retry_count: newRetryCount,
      error_message: errorMessage,
    };

    // If max retries exceeded, mark as permanently failed
    if (newRetryCount >= this.maxRetries) {
      updateData.status = "permanently_failed";
      logWarn(`Notification ${notification.id} permanently failed after ${this.maxRetries} retries`);
    }

    await this.supabase
      .from("notification_history")
      .update(updateData)
      .eq("id", notification.id);
  }

  /**
   * Manually retry a specific notification by ID
   */
  async retryNotificationById(notificationId: string): Promise<boolean> {
    try {
      const { data: notification, error } = await this.supabase
        .from("notification_history")
        .select("*")
        .eq("id", notificationId)
        .single();

      if (error || !notification) {
        logError(`Notification ${notificationId} not found`, error);
        return false;
      }

      if (notification.status === "sent") {
        logWarn(`Notification ${notificationId} already sent`);
        return true;
      }

      if (notification.retry_count >= this.maxRetries) {
        logWarn(`Notification ${notificationId} has exceeded max retries`);
        return false;
      }

      await this.retryNotification(notification);
      return true;
    } catch (error) {
      logError(`Failed to manually retry notification ${notificationId}`, error);
      return false;
    }
  }

  /**
   * Get retry statistics
   */
  async getRetryStats(): Promise<{
    pending: number;
    failed: number;
    permanentlyFailed: number;
    sent: number;
  }> {
    try {
      const { data, error } = await this.supabase
        .from("notification_history")
        .select("status")
        .in("status", ["pending", "failed", "permanently_failed", "sent"]);

      if (error) {
        throw error;
      }

      const stats = {
        pending: 0,
        failed: 0,
        permanentlyFailed: 0,
        sent: 0,
      };

      data?.forEach((row) => {
        switch (row.status) {
          case "pending":
            stats.pending++;
            break;
          case "failed":
            stats.failed++;
            break;
          case "permanently_failed":
            stats.permanentlyFailed++;
            break;
          case "sent":
            stats.sent++;
            break;
        }
      });

      return stats;
    } catch (error) {
      logError("Failed to get retry stats", error);
      return { pending: 0, failed: 0, permanentlyFailed: 0, sent: 0 };
    }
  }

  isRetryServiceRunning(): boolean {
    return this.isRunning;
  }
}
