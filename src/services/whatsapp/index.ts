import { WhatsAppConnection } from "./connection";
import { MessageHandler } from "./message-handler";
import { MessageSender } from "./sender";
import {
  WhatsAppServiceConfig,
  MessageContext,
  SendMessageOptions,
} from "./types";
import { proto } from "@whiskeysockets/baileys";
import pino from "pino";
import { config } from "../../config/env";

export class WhatsAppService {
  private connection: WhatsAppConnection;
  private messageHandler: MessageHandler;
  private sender: MessageSender | null = null;
  private logger = pino({ level: "info" });
  private onMessageCallback?: (context: MessageContext) => Promise<void>;

  constructor(config: WhatsAppServiceConfig) {
    this.connection = new WhatsAppConnection(config);
    this.messageHandler = new MessageHandler();
    this.onMessageCallback = config.onMessage;
  }

  async initialize(): Promise<void> {
    try {
      this.logger.info("Initializing WhatsApp service...");
      const socket = await this.connection.connect();
      this.sender = new MessageSender(socket);

      // Listen for incoming messages
      socket.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;

        for (const message of messages) {
          await this.handleIncomingMessage(message);
        }
      });

      this.logger.info("✅ WhatsApp service initialized");
    } catch (error) {
      this.logger.error({ error }, "Failed to initialize WhatsApp service");
      throw error;
    }
  }

  private async handleIncomingMessage(
    message: proto.IWebMessageInfo,
  ): Promise<void> {
    try {
      this.logger.info(`📩 New message: ${message.key.id}`);

      // Apply message filter based on config
      const filterMode = config.whatsapp.messageFilterMode;
      const isFromMe = message.key.fromMe;

      // Mode 1: Only accept messages from others
      if (filterMode === 1 && isFromMe) {
        this.logger.debug("Ignoring message from self (mode 1)");
        return;
      }

      // Mode 2: Only accept messages from self
      if (filterMode === 2 && !isFromMe) {
        this.logger.debug("Ignoring message from others (mode 2)");
        return;
      }

      // Mode 3: Accept all messages (no filter)
      if (filterMode === 3) {
        this.logger.debug("Accepting all messages (mode 3)");
      }

      const context = await this.messageHandler.parseMessage(message as any);
      if (!context) return;

      this.logger.info(`📩 Message from ${context.fromName}: ${context.text}`);

      // Mark as read
      if (this.sender) {
        await this.sender.markAsRead(context.from, context.messageId);
      }

      // Call the message handler callback
      if (this.onMessageCallback) {
        await this.onMessageCallback(context);
      }
    } catch (error) {
      this.logger.error({ error }, "Error handling incoming message");
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

  async sendTyping(to: string, isTyping: boolean = true): Promise<void> {
    if (this.sender) {
      await this.sender.sendTyping(to, isTyping);
    }
  }

  async sendReaction(
    to: string,
    messageId: string,
    emoji: string,
  ): Promise<void> {
    if (this.sender) {
      await this.sender.sendReaction(to, messageId, emoji);
    }
  }

  async downloadMedia(message: any): Promise<Buffer | null> {
    const socket = this.connection.getSocket();
    if (!socket) return null;
    return this.messageHandler.downloadMedia(message, socket);
  }

  isConnected(): boolean {
    return this.connection.isSocketConnected();
  }

  async disconnect(): Promise<void> {
    await this.connection.disconnect();
  }

  getSender(): MessageSender | null {
    return this.sender;
  }
}

export * from "./types";
export { MessageHandler } from "./message-handler";
export { MessageSender } from "./sender";
