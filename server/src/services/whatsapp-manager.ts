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
    this.reminderScheduler = new ReminderScheduler(30000); // Check every 30 seconds
    
    // Set up reminder notification callback
    this.reminderScheduler.setNotificationCallback(async (reminder) => {
      await this.sendReminderNotification(reminder);
    });
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
    priority: 'low' | 'medium' | 'high';
  }): Promise<void> {
    try {
      // Get user's WhatsApp ID from database
      const { data: user, error } = await this.supabase
        .from('users')
        .select('whatsapp_id, phone_number, name')
        .eq('id', reminder.userId)
        .single();

      if (error || !user) {
        this.logger.error({ error, userId: reminder.userId }, 'Failed to get user for reminder notification');
        return;
      }

      // Format the reminder notification message
      const priorityEmoji = {
        high: '🔴',
        medium: '🟡',
        low: '🟢',
      }[reminder.priority];

      let message = `${priorityEmoji} *REMINDER*\n\n`;
      message += `📌 ${reminder.title}\n`;
      
      if (reminder.notes) {
        message += `\n📝 ${reminder.notes}\n`;
      }

      // Send the notification via WhatsApp
      if (this.whatsappService) {
        const whatsappJid = user.whatsapp_id;
        const success = await this.whatsappService.sendMessage({
          to: whatsappJid,
          text: message,
        });

        if (success) {
          this.logger.info({
            reminderId: reminder.id,
            title: reminder.title,
            user: user.name || user.phone_number,
          }, `✅ Reminder notification sent`);
        } else {
          this.logger.error({
            reminderId: reminder.id,
            userId: reminder.userId,
          }, 'Failed to send reminder notification');
        }
      }
    } catch (error) {
      this.logger.error({ error }, 'Error sending reminder notification');
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

      // Get response message
      const responseText = this.messageController.getResponseMessage(result);

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
          text: `❌ Error: ${error.message || 'Something went wrong'}`,
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
