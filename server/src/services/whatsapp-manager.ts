import { WhatsAppService, MessageContext } from "./whatsapp";
import { MessageController } from "../controllers/message-handler";
import { ReminderScheduler } from "./reminder-scheduler";
import { NotificationRetryService } from "./notification-retry";
import { config } from "../config/env";
import { getSupabaseClient } from "../lib/supabase";
import { isWithinQuietHours } from "../utils/time-utils";
import pino from "pino";
export class WhatsAppManager {
  private whatsappService: WhatsAppService | null = null;
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
      this.logger.warn("WhatsApp manager already initialized");
      return;
    }
    try {
      this.whatsappService = new WhatsAppService({
        sessionPath: config.whatsapp.sessionPath,
        printQRInTerminal: true,
        onMessage: this.handleMessage.bind(this),
        onConnectionUpdate: this.handleConnectionUpdate.bind(this),
      });
      await this.whatsappService.initialize();
      this.reminderScheduler.start();
      this.logger.info("✅ Reminder scheduler started");
      this.notificationRetryService.start();
      this.logger.info("✅ Notification retry service started");
      this.isInitialized = true;
      this.logger.info("✅ WhatsApp manager initialized successfully");
    } catch (error) {
      this.logger.error({ error }, "Failed to initialize WhatsApp manager");
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
          "whatsapp_id, phone_number, name, timezone, notification_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, quiet_hours_days",
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
      if (this.whatsappService) {
        const whatsappJid = user.whatsapp_id;
        const success = await this.whatsappService.sendMessage({
          to: whatsappJid,
          text: message,
        });
        if (success) {
          await this.supabase.from("notification_history").insert({
            user_id: reminder.userId,
            type: "reminder",
            content: message,
            reminder_id: reminder.id,
            status: "sent",
            sent_at: new Date().toISOString(),
          });
          try {
            await this.supabase
              .from("shared_reminders")
              .update({ status: "sent", sent_at: new Date().toISOString() })
              .eq("reminder_id", reminder.id)
              .eq("recipient_whatsapp_id", user.whatsapp_id);
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
            status: "failed",
            error_message: "Failed to send via WhatsApp",
            retry_count: 0,
          });
          try {
            await this.supabase
              .from("shared_reminders")
              .update({ status: "failed" })
              .eq("reminder_id", reminder.id)
              .eq("recipient_whatsapp_id", user.whatsapp_id);
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
      if (this.whatsappService) {
        await this.whatsappService.sendTyping(context.from, true);
      }
      const result = await this.messageController.handleMessage(context);
      const responseText =
        result && result.renderedText
          ? result.renderedText
          : this.messageController.getResponseMessage(result);
      if (this.whatsappService && responseText) {
        await this.whatsappService.sendMessage({
          to: context.from,
          text: responseText,
        });
      }
      if (this.whatsappService) {
        await this.whatsappService.sendTyping(context.from, false);
      }
    } catch (error: any) {
      this.logger.error({ error }, "Error handling message");
      if (this.whatsappService) {
        await this.whatsappService.sendMessage({
          to: context.from,
          text: `We apologize, but an error occurred while processing your request. Please try again later or contact support if the issue persists.`,
        });
      }
    }
  }
  private handleConnectionUpdate(isConnected: boolean): void {
    if (isConnected) {
      this.logger.info("✅ WhatsApp connected");
    } else {
      this.logger.warn("⚠️ WhatsApp disconnected");
    }
  }
  async sendMessage(to: string, text: string): Promise<boolean> {
    if (!this.whatsappService) {
      this.logger.error("WhatsApp service not initialized");
      return false;
    }
    return this.whatsappService.sendMessage({ to, text });
  }
  isConnected(): boolean {
    return this.whatsappService?.isConnected() ?? false;
  }
  async shutdown(): Promise<void> {
    this.reminderScheduler.stop();
    this.logger.info("Reminder scheduler stopped");
    this.notificationRetryService.stop();
    this.logger.info("Notification retry service stopped");
    this.messageController.cleanup();
    this.logger.info("Message controller cleaned up");
    if (this.whatsappService) {
      await this.whatsappService.disconnect();
      this.isInitialized = false;
      this.logger.info("WhatsApp manager shut down");
    }
  }
  private async retryFailedNotification(notification: any): Promise<boolean> {
    try {
      if (!this.whatsappService) {
        this.logger.error("WhatsApp service not available for retry");
        return false;
      }
      const success = await this.whatsappService.sendMessage({
        to: notification.recipient_whatsapp_id || notification.user_id,
        text: notification.content,
      });
      if (success) {
        this.logger.info(
          `Successfully retried notification ${notification.id}`,
        );
        try {
          if (notification.reminder_id && notification.recipient_whatsapp_id) {
            await this.supabase
              .from("shared_reminders")
              .update({ status: "sent", sent_at: new Date().toISOString() })
              .eq("reminder_id", notification.reminder_id)
              .eq("recipient_whatsapp_id", notification.recipient_whatsapp_id);
          }
        } catch {}
        return true;
      } else {
        this.logger.warn(`Failed to retry notification ${notification.id}`);
        try {
          if (notification.reminder_id && notification.recipient_whatsapp_id) {
            await this.supabase
              .from("shared_reminders")
              .update({ status: "failed" })
              .eq("reminder_id", notification.reminder_id)
              .eq("recipient_whatsapp_id", notification.recipient_whatsapp_id);
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
  getService(): WhatsAppService | null {
    return this.whatsappService;
  }
}
