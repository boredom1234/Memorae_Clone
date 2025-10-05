import TelegramBot from "node-telegram-bot-api";
import { TelegramConnection } from "./connection";
import { MessageHandler } from "./message-handler";
import { MessageSender } from "./sender";
import {
  TelegramServiceConfig,
  MessageContext,
  SendMessageOptions,
} from "./types";
import pino from "pino";
import { config } from "../../config/env";
export class TelegramService {
  private connection: TelegramConnection;
  private messageHandler: MessageHandler;
  private sender: MessageSender | null = null;
  private logger = pino({ level: "info" });
  private onMessageCallback?: (context: MessageContext) => Promise<void>;
  private bot: TelegramBot | null = null;
  private isUserAllowed(userId: number): boolean {
    const allowedUsers = config.telegram.allowedUsers;
    if (allowedUsers.length === 0) {
      return true;
    }
    return allowedUsers.includes(userId);
  }
  constructor(config: TelegramServiceConfig) {
    this.connection = new TelegramConnection(config);
    this.messageHandler = new MessageHandler();
    this.onMessageCallback = config.onMessage;
  }
  async initialize(): Promise<void> {
    try {
      this.logger.info("Initializing Telegram service...");
      this.bot = await this.connection.connect();
      this.sender = new MessageSender(this.bot);
      this.bot.on("message", async (message) => {
        await this.handleIncomingMessage(message);
      });
      this.logger.info("✅ Telegram service initialized");
    } catch (error) {
      this.logger.error({ error }, "Failed to initialize Telegram service");
      throw error;
    }
  }
  private async handleIncomingMessage(
    message: TelegramBot.Message,
  ): Promise<void> {
    try {
      this.logger.info(`📩 New Telegram message: ${message.message_id}`);
      if (message.from && !this.isUserAllowed(message.from.id)) {
        this.logger.warn(
          `⚠️ Ignoring message from non-allowed user: ${message.from.id}`,
        );
        return;
      }
      const context = await this.messageHandler.parseMessage(message);
      if (!context) {
        this.logger.warn("⚠️ Failed to parse message context");
        return;
      }
      this.logger.info(
        `📩 Message from ${context.fromName}: ${context.text || `[${context.messageType}]`}`,
      );
      if (
        context.messageType === "image" ||
        context.messageType === "video" ||
        context.messageType === "audio" ||
        context.messageType === "voice" ||
        context.messageType === "document"
      ) {
        this.logger.info(
          `Downloading ${context.messageType} media for message ${context.messageId}`,
        );
        try {
          if (this.bot) {
            const mediaData = await this.messageHandler.downloadMedia(
              this.bot,
              message,
            );
            if (mediaData) {
              context.mediaBuffer = mediaData.buffer;
              context.mimeType = mediaData.mimeType;
              this.logger.info(
                `Media downloaded: ${mediaData.buffer.length} bytes, MIME: ${mediaData.mimeType}`,
              );
            } else {
              this.logger.warn("Failed to download media");
            }
          }
        } catch (error) {
          this.logger.error({ error }, "Error downloading media");
        }
      }
      if (this.onMessageCallback) {
        await this.onMessageCallback(context);
      }
    } catch (error) {
      this.logger.error({ error }, "Error handling incoming Telegram message");
    }
  }
  async sendMessage(options: SendMessageOptions): Promise<boolean> {
    if (!this.sender) {
      this.logger.error("Sender not initialized");
      return false;
    }
    const result = await this.sender.sendText(options);
    return result !== null;
  }
  async sendTyping(chatId: number, isTyping: boolean = true): Promise<void> {
    if (this.sender) {
      await this.sender.sendTyping(chatId, isTyping);
    }
  }
  isConnected(): boolean {
    return this.connection.isConnectedStatus();
  }
  async disconnect(): Promise<void> {
    await this.connection.disconnect();
  }
  getSender(): MessageSender | null {
    return this.sender;
  }
  getBot(): TelegramBot | null {
    return this.bot;
  }
}
export * from "./types";
export { MessageHandler } from "./message-handler";
export { MessageSender } from "./sender";
