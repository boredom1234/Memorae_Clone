import { TelegramService, MessageContext } from "./telegram";
import { MessageController } from "../controllers/message-handler";
import { ReminderScheduler } from "./reminder-scheduler";
import { NotificationRetryService } from "./notification-retry";
import { config } from "../config/env";
import { getSupabaseClient } from "../lib/supabase";
import { isWithinQuietHours } from "../utils/time-utils";
import pino from "pino";
export class TelegramManager {
  private telegramService: TelegramService | null = null;
  private messageController: MessageController;
  private reminderScheduler: ReminderScheduler;
  private notificationRetryService: NotificationRetryService;
  private logger = pino({ level: "info" });
  private isInitialized = false;
  private supabase = getSupabaseClient();
  constructor() {
    this.messageController = new MessageController();
    this.reminderScheduler = new ReminderScheduler(5000);
    this.notificationRetryService = new NotificationRetryService(30000, 5);
    this.reminderScheduler.setNotificationCallback(async (reminder) => {
      await this.sendReminderNotification(reminder);
    });
    this.notificationRetryService.setRetryCallback(async (notification) => {
      return await this.retryFailedNotification(notification);
    });
  }
  isSchedulerRunning(): boolean {
    return this.reminderScheduler.isSchedulerRunning();
  }
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn("Telegram manager already initialized");
      return;
    }
    try {
      this.telegramService = new TelegramService({
        botToken: config.telegram.botToken,
        allowedUsers: config.telegram.allowedUsers,
        onMessage: this.handleMessage.bind(this),
        onConnectionUpdate: this.handleConnectionUpdate.bind(this),
      });
      await this.telegramService.initialize();
      this.reminderScheduler.start();
      this.logger.info("✅ Reminder scheduler started");
      this.notificationRetryService.start();
      this.logger.info("✅ Notification retry service started");
      this.isInitialized = true;
      this.logger.info("✅ Telegram manager initialized successfully");
    } catch (error) {
      this.logger.error({ error }, "Failed to initialize Telegram manager");
      throw error;
    }
  }
  private async sendReminderNotification(reminder: {
    id: string;
    userId: string;
    title: string;
    notes?: string;
    priority: "low" | "medium" | "high";
    reminderTime: string;
    isRecurring: boolean;
  }): Promise<void> {
    try {
      const { data: user, error } = await this.supabase
        .from("users")
        .select(
          "telegram_id, phone_number, name, timezone, notification_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, quiet_hours_days",
        )
        .eq("id", reminder.userId)
        .single();
      if (error || !user) {
        this.logger.error(
          { error, userId: reminder.userId },
          "Failed to get user for reminder notification",
        );
        return;
      }
      try {
        const { data: existingNotifs } = (await this.supabase
          .from("notification_history")
          .select("id")
          .eq("reminder_id", reminder.id)
          .in("status", ["sent", "delivered"])) as any;
        if (existingNotifs && existingNotifs.length > 0) {
          this.logger.info(
            { reminderId: reminder.id },
            "Skipping notification - already sent",
          );
          return;
        }
      } catch (e) {
        this.logger.warn({ e }, "De-duplication check failed, proceeding");
      }
      const reminderTime = new Date(reminder.reminderTime);
      const now = new Date();
      const timeStr = reminderTime.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: user.timezone || "UTC",
      });
      const dateStr = reminderTime.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year:
          reminderTime.getFullYear() !== now.getFullYear()
            ? "numeric"
            : undefined,
        timeZone: user.timezone || "UTC",
      });
      let message = `🔔 Hey! Time for: *${reminder.title}*\n\n`;
      if (reminder.notes) {
        message += `${reminder.notes}\n\n`;
      }
      message += `⏰ Scheduled for ${dateStr} at ${timeStr}`;
      if (reminder.priority === "high") {
        message += ` 🔥`;
      } else if (reminder.priority === "medium") {
        message += ` ⚡`;
      }
      if (reminder.isRecurring) {
        message += `\n🔁 This is a recurring reminder`;
      }
      const notificationsEnabled = user.notification_enabled !== false;
      if (!notificationsEnabled) {
        this.logger.info(
          { userId: reminder.userId },
          "Notifications disabled for user, skipping",
        );
        await this.supabase.from("notification_history").insert({
          user_id: reminder.userId,
          type: "reminder",
          content: message,
          reminder_id: reminder.id,
          status: "pending",
          error_message: "Notifications disabled",
        });
        return;
      }
      const withinQuietHours = (() => {
        if (!user.quiet_hours_enabled) return false;
        try {
          const tz = user.timezone || "UTC";
          const start = user.quiet_hours_start || "22:00";
          const end = user.quiet_hours_end || "07:00";
          return isWithinQuietHours(
            tz,
            start,
            end,
            user.quiet_hours_days as string[] | undefined,
          );
        } catch (e) {
          this.logger.warn({ e }, "Quiet hours check failed");
          return false;
        }
      })();
      if (withinQuietHours) {
        this.logger.info(
          { userId: reminder.userId },
          "Within quiet hours, deferring notification",
        );
        await this.supabase.from("notification_history").insert({
          user_id: reminder.userId,
          type: "reminder",
          content: message,
          reminder_id: reminder.id,
          status: "pending",
          error_message: "Deferred due to quiet hours",
        });
        return;
      }
      if (this.telegramService && user.telegram_id) {
        const success = await this.telegramService.sendMessage({
          chatId: parseInt(user.telegram_id),
          text: message,
          parseMode: "Markdown",
        });
        if (success) {
          await this.supabase.from("notification_history").insert({
            user_id: reminder.userId,
            type: "reminder",
            content: message,
            reminder_id: reminder.id,
            recipient_telegram_id: user.telegram_id,
            status: "sent",
            sent_at: new Date().toISOString(),
          });
          try {
            await this.supabase
              .from("shared_reminders")
              .update({ status: "sent", sent_at: new Date().toISOString() })
              .eq("reminder_id", reminder.id)
              .eq("recipient_telegram_id", user.telegram_id);
          } catch {}
          this.logger.info(
            {
              reminderId: reminder.id,
              title: reminder.title,
              user: user.name || user.phone_number,
            },
            `✅ Reminder notification sent`,
          );
        } else {
          await this.supabase.from("notification_history").insert({
            user_id: reminder.userId,
            type: "reminder",
            content: message,
            reminder_id: reminder.id,
            recipient_telegram_id: user.telegram_id,
            status: "failed",
            error_message: "Failed to send via Telegram",
            retry_count: 0,
          });
          try {
            await this.supabase
              .from("shared_reminders")
              .update({ status: "failed" })
              .eq("reminder_id", reminder.id)
              .eq("recipient_telegram_id", user.telegram_id);
          } catch {}
          this.logger.error(
            {
              reminderId: reminder.id,
              userId: reminder.userId,
            },
            "Failed to send reminder notification",
          );
        }
      }
    } catch (error) {
      this.logger.error({ error }, "Error sending reminder notification");
    }
  }
  private async handleMessage(context: MessageContext): Promise<void> {
    try {
      if (this.telegramService) {
        await this.telegramService.sendTyping(context.chatId, true);
      }
      const result = await this.messageController.handleMessage(context);
      const responseText =
        result && result.renderedText
          ? result.renderedText
          : this.messageController.getResponseMessage(result);
      if (this.telegramService && responseText) {
        await this.telegramService.sendMessage({
          chatId: context.chatId,
          text: responseText,
          parseMode: "Markdown",
        });
      }
    } catch (error: any) {
      this.logger.error({ error }, "Error handling message");
      if (this.telegramService) {
        await this.telegramService.sendMessage({
          chatId: context.chatId,
          text: `We apologize, but an error occurred while processing your request. Please try again later or contact support if the issue persists.`,
        });
      }
    }
  }
  private handleConnectionUpdate(isConnected: boolean): void {
    if (isConnected) {
      this.logger.info("✅ Telegram connected");
    } else {
      this.logger.warn("⚠️ Telegram disconnected");
    }
  }
  async sendMessage(chatId: number, text: string): Promise<boolean> {
    if (!this.telegramService) {
      this.logger.error("Telegram service not initialized");
      return false;
    }
    return this.telegramService.sendMessage({ chatId, text });
  }
  isConnected(): boolean {
    return this.telegramService?.isConnected() ?? false;
  }
  async shutdown(): Promise<void> {
    this.reminderScheduler.stop();
    this.logger.info("Reminder scheduler stopped");
    this.notificationRetryService.stop();
    this.logger.info("Notification retry service stopped");
    this.messageController.cleanup();
    this.logger.info("Message controller cleaned up");
    if (this.telegramService) {
      await this.telegramService.disconnect();
      this.isInitialized = false;
      this.logger.info("Telegram manager shut down");
    }
  }
  private async retryFailedNotification(notification: any): Promise<boolean> {
    try {
      if (!this.telegramService) {
        this.logger.error("Telegram service not available for retry");
        return false;
      }
      let chatId: number;
      if (notification.recipient_telegram_id) {
        chatId = parseInt(notification.recipient_telegram_id);
      } else {
        const { data: user } = await this.supabase
          .from("users")
          .select("telegram_id")
          .eq("id", notification.user_id)
          .single();
        if (!user?.telegram_id) {
          this.logger.error(
            `No Telegram ID found for user ${notification.user_id} in notification ${notification.id}`,
          );
          return false;
        }
        chatId = parseInt(user.telegram_id);
      }
      if (isNaN(chatId) || chatId <= 0) {
        this.logger.error(
          `Invalid chat ID: ${chatId} for notification ${notification.id}`,
        );
        return false;
      }
      const success = await this.telegramService.sendMessage({
        chatId,
        text: notification.content,
        parseMode: "Markdown",
      });
      if (success) {
        this.logger.info(
          `Successfully retried notification ${notification.id}`,
        );
        try {
          if (notification.reminder_id && notification.recipient_telegram_id) {
            await this.supabase
              .from("shared_reminders")
              .update({ status: "sent", sent_at: new Date().toISOString() })
              .eq("reminder_id", notification.reminder_id)
              .eq("recipient_telegram_id", notification.recipient_telegram_id);
          }
        } catch {}
        return true;
      } else {
        this.logger.warn(`Failed to retry notification ${notification.id}`);
        try {
          if (notification.reminder_id && notification.recipient_telegram_id) {
            await this.supabase
              .from("shared_reminders")
              .update({ status: "failed" })
              .eq("reminder_id", notification.reminder_id)
              .eq("recipient_telegram_id", notification.recipient_telegram_id);
          }
        } catch {}
        return false;
      }
    } catch (error) {
      this.logger.error(
        { error },
        `Error retrying notification ${notification.id}`,
      );
      return false;
    }
  }
  getService(): TelegramService | null {
    return this.telegramService;
  }
}
