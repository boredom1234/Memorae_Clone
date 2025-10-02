import { WhatsAppService, MessageContext } from "./whatsapp";
import { MessageController } from "../controllers/message-handler";
import { ReminderScheduler } from "./reminder-scheduler";
import { config } from "../config/env";
import { getSupabaseClient } from "../lib/supabase";
import pino from "pino";

export class WhatsAppManager {
  private whatsappService: WhatsAppService | null = null;
  private messageController: MessageController;
  private reminderScheduler: ReminderScheduler;
  private logger = pino({ level: "info" });
  private isInitialized = false;
  private supabase = getSupabaseClient();

  constructor() {
    this.messageController = new MessageController();
    this.reminderScheduler = new ReminderScheduler(5000); // Check every 5 seconds

    // Set up reminder notification callback
    this.reminderScheduler.setNotificationCallback(async (reminder) => {
      await this.sendReminderNotification(reminder);
    });
  }

  // Public status
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

      // Start the reminder scheduler
      this.reminderScheduler.start();
      this.logger.info("✅ Reminder scheduler started");

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
      // Get user's WhatsApp ID from database
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

      // De-duplication: skip if already sent around this reminder time
      try {
        const { data: existingNotifs } = (await this.supabase
          .from("notification_history")
          .select("id")
          .eq("reminder_id", reminder.id)
          .in("status", ["sent", "delivered"])) as any;
        // Optionally filter by sent_at >= windowStart if available
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

      // Format the reminder notification message
      const priorityEmoji = {
        high: "🔴",
        medium: "🟡",
        low: "🟢",
      }[reminder.priority];

      const priorityText = {
        high: "High Priority",
        medium: "Medium Priority",
        low: "Low Priority",
      }[reminder.priority];

      // Format the reminder time in user's timezone
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

      let message = `*REMINDER NOTIFICATION*\n\n`;
      message += `*Task:* ${reminder.title}\n\n`;

      if (reminder.notes) {
        message += `*Details:* ${reminder.notes}\n\n`;
      }

      message += `*Scheduled Time:* ${dateStr} at ${timeStr}\n`;
      message += `*Priority Level:* ${priorityText}\n`;

      if (reminder.isRecurring) {
        message += `*Type:* Recurring Reminder\n`;
      }

      message += `\n---\nMemorae Reminder Service`;

      // Respect notification_enabled and quiet hours
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
          const localNow = new Date(
            new Date().toLocaleString("en-US", { timeZone: tz }),
          );
          const dayNames = [
            "sunday",
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
          ];
          if (
            Array.isArray(user.quiet_hours_days) &&
            user.quiet_hours_days.length > 0
          ) {
            const today = dayNames[localNow.getDay()];
            if (!user.quiet_hours_days.includes(today)) return false;
          }
          const start = user.quiet_hours_start || "22:00";
          const end = user.quiet_hours_end || "07:00";
          const [sh, sm] = start.split(":").map((n: string) => parseInt(n, 10));
          const [eh, em] = end.split(":").map((n: string) => parseInt(n, 10));
          const startD = new Date(localNow);
          startD.setHours(sh, sm, 0, 0);
          const endD = new Date(localNow);
          endD.setHours(eh, em, 0, 0);
          if (startD <= endD) {
            return localNow >= startD && localNow <= endD;
          } else {
            // overnight window
            return localNow >= startD || localNow <= endD;
          }
        } catch {
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

      // Send the notification via WhatsApp
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
      // Send typing indicator
      if (this.whatsappService) {
        await this.whatsappService.sendTyping(context.from, true);
      }

      // Process the message and get result
      const result = await this.messageController.handleMessage(context);

      // Get response message (prefer pre-rendered text with user's timezone)
      const responseText =
        result && result.renderedText
          ? result.renderedText
          : this.messageController.getResponseMessage(result);

      // Send response
      if (this.whatsappService && responseText) {
        await this.whatsappService.sendMessage({
          to: context.from,
          text: responseText,
        });
      }

      // Stop typing indicator
      if (this.whatsappService) {
        await this.whatsappService.sendTyping(context.from, false);
      }
    } catch (error: any) {
      this.logger.error({ error }, "Error handling message");

      // Send error message to user
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
    // Stop the reminder scheduler
    this.reminderScheduler.stop();
    this.logger.info("Reminder scheduler stopped");

    if (this.whatsappService) {
      await this.whatsappService.disconnect();
      this.isInitialized = false;
      this.logger.info("WhatsApp manager shut down");
    }
  }

  getService(): WhatsAppService | null {
    return this.whatsappService;
  }
}
