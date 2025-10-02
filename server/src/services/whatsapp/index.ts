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

  /**
   * Check if a phone number is allowed based on the allowedNumbers configuration
   * @param phoneNumber The phone number to check
   * @returns true if the number is allowed, false otherwise
   */
  private isNumberAllowed(phoneNumber: string): boolean {
    const allowedNumbers = config.whatsapp.allowedNumbers;

    // If no allowed numbers configured, allow all
    if (allowedNumbers.length === 0) {
      return true;
    }

    // If "all" is in the allowed numbers, allow all
    if (allowedNumbers.some((num) => num.toLowerCase() === "all")) {
      return true;
    }

    // Check if the phone number matches any of the allowed numbers
    return allowedNumbers.some(
      (allowedNum) =>
        phoneNumber.includes(allowedNum) || allowedNum.includes(phoneNumber),
    );
  }

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
      const remoteJid = message.key.remoteJid || "";

      // Extract the phone number from remoteJid (format: "1234567890@s.whatsapp.net")
      const chatPartner = remoteJid.split("@")[0];

      // Get own number from the connection
      const ownNumber =
        this.connection.getSocket()?.user?.id?.split(":")[0] || "";

      const isSelfChat = chatPartner === ownNumber;

      // Mode 1: Only accept messages FROM others TO you (not messages you send)
      if (filterMode === 1) {
        // Ignore messages sent by you (isFromMe = true)
        if (isFromMe) {
          this.logger.debug("Ignoring message sent by me (mode 1)");
          return;
        }

        // Ignore self-chat messages (when someone messages themselves)
        if (isSelfChat) {
          this.logger.debug("Ignoring self-chat message (mode 1)");
          return;
        }

        // Check if number is allowed
        if (!this.isNumberAllowed(chatPartner)) {
          this.logger.debug(
            `Ignoring message from non-allowed number: ${chatPartner} (mode 1)`,
          );
          return;
        }

        this.logger.debug(`Accepting message from ${chatPartner} (mode 1)`);
      }

      // Mode 2: Only accept messages when chatting with yourself (100 <-> 100)
      if (filterMode === 2) {
        if (!isSelfChat) {
          this.logger.debug(
            `Ignoring message - not self-chat (mode 2). Chat partner: ${chatPartner}, Own: ${ownNumber}`,
          );
          return;
        }
        this.logger.debug("Accepting self-chat message (mode 2)");
      }

      // Mode 3: Accept all messages (combination of mode 1 and mode 2)
      if (filterMode === 3) {
        // If it's a message you sent to someone else (not self-chat), ignore it
        if (isFromMe && !isSelfChat) {
          this.logger.debug("Ignoring message sent by me to others (mode 3)");
          return;
        }

        // If it's not self-chat, check if number is allowed
        if (!isSelfChat && !this.isNumberAllowed(chatPartner)) {
          this.logger.debug(
            `Ignoring message from non-allowed number: ${chatPartner} (mode 3)`,
          );
          return;
        }

        this.logger.debug("Accepting message (mode 3)");
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
