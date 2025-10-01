import { WhatsAppService, MessageContext } from "./whatsapp";
import { MessageController } from "../controllers/message-handler";
import { config } from "../config/env";
import pino from "pino";

export class WhatsAppManager {
  private whatsappService: WhatsAppService | null = null;
  private messageController: MessageController;
  private logger = pino({ level: "info" });
  private isInitialized = false;

  constructor() {
    this.messageController = new MessageController();
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
      this.isInitialized = true;
      this.logger.info("✅ WhatsApp manager initialized successfully");
    } catch (error) {
      this.logger.error({ error }, "Failed to initialize WhatsApp manager");
      throw error;
    }
  }

  private async handleMessage(context: MessageContext): Promise<void> {
    try {
      // Send typing indicator
      if (this.whatsappService) {
        await this.whatsappService.sendTyping(context.from, true);
      }

      // Process the message
      await this.messageController.handleMessage(context);

      // Auto-reply testing with "."
      //   if (this.whatsappService) {
      //     await this.whatsappService.sendMessage({
      //       to: context.from,
      //       text: '.',
      //     });
      //   }

      // Stop typing indicator
      if (this.whatsappService) {
        await this.whatsappService.sendTyping(context.from, false);
      }
    } catch (error) {
      this.logger.error({ error }, "Error handling message");

      // Send error reaction
      if (this.whatsappService) {
        await this.whatsappService.sendReaction(
          context.from,
          context.messageId,
          "❌",
        );
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
