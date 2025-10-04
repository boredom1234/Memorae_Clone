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

  /**
   * Simplified message filtering logic
   * @param filterMode The filter mode (1, 2, or 3)
   * @param isFromMe Whether the message is from the bot user
   * @param isSelfChat Whether this is a self-chat (user messaging themselves)
   * @param chatPartner The phone number of the chat partner
   * @returns Object with accept boolean and reason string
   */
  private shouldProcessMessage(
    filterMode: number,
    isFromMe: boolean,
    isSelfChat: boolean,
    chatPartner: string,
  ): { accept: boolean; reason: string } {
    switch (filterMode) {
      case 1: // Only messages from others (not self)
        if (isFromMe) {
          return {
            accept: false,
            reason: "Ignoring message sent by me (mode 1)",
          };
        }
        if (isSelfChat) {
          return {
            accept: false,
            reason: "Ignoring self-chat message (mode 1)",
          };
        }
        if (!this.isNumberAllowed(chatPartner)) {
          return {
            accept: false,
            reason: `Ignoring message from non-allowed number: ${chatPartner} (mode 1)`,
          };
        }
        return {
          accept: true,
          reason: `Accepting message from ${chatPartner} (mode 1)`,
        };

      case 2: // Only self-chat messages
        if (!isSelfChat) {
          return {
            accept: false,
            reason: `Ignoring message - not self-chat (mode 2). Chat partner: ${chatPartner}`,
          };
        }
        return { accept: true, reason: "Accepting self-chat message (mode 2)" };

      case 3: // All messages (with restrictions)
        if (isFromMe && !isSelfChat) {
          return {
            accept: false,
            reason: "Ignoring message sent by me to others (mode 3)",
          };
        }
        if (!isSelfChat && !this.isNumberAllowed(chatPartner)) {
          return {
            accept: false,
            reason: `Ignoring message from non-allowed number: ${chatPartner} (mode 3)`,
          };
        }
        return { accept: true, reason: "Accepting message (mode 3)" };

      default:
        return { accept: false, reason: `Unknown filter mode: ${filterMode}` };
    }
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
      const isFromMe = Boolean(message.key.fromMe);
      const remoteJid = message.key.remoteJid || "";

      // Extract the phone number from remoteJid (format: "1234567890@s.whatsapp.net")
      const chatPartner = remoteJid.split("@")[0];

      const ownNumber =
        this.connection.getSocket()?.user?.id?.split(":")[0] || "";

      const isSelfChat = chatPartner === ownNumber;

      // Simplified message filtering logic
      const shouldProcessMessage = this.shouldProcessMessage(
        filterMode,
        isFromMe,
        isSelfChat,
        chatPartner,
      );

      if (!shouldProcessMessage.accept) {
        this.logger.debug(shouldProcessMessage.reason);
        return;
      }

      this.logger.debug(`Accepting message: ${shouldProcessMessage.reason}`);

      const context = await this.messageHandler.parseMessage(message as any);
      if (!context) return;

      this.logger.info(`📩 Message from ${context.fromName}: ${context.text}`);

      // Propagate isSelfChat info downstream for defense-in-depth
      (context as any).isSelfChat = isSelfChat;

      // Download media if it's an image, video, or document
      if (
        context.messageType === "image" ||
        context.messageType === "video" ||
        context.messageType === "document"
      ) {
        this.logger.info(
          `Downloading ${context.messageType} media for message ${context.messageId}`,
        );
        try {
          const mediaBuffer = await this.downloadMedia(message);
          if (mediaBuffer) {
            context.mediaBuffer = mediaBuffer;
            // Extract MIME type from message
            const msg = message.message;
            if (msg?.imageMessage) {
              context.mimeType = msg.imageMessage.mimetype || "image/jpeg";
            } else if (msg?.videoMessage) {
              context.mimeType = msg.videoMessage.mimetype || "video/mp4";
            } else if (msg?.documentMessage) {
              context.mimeType =
                msg.documentMessage.mimetype || "application/pdf";
            }
            this.logger.info(
              `Media downloaded: ${mediaBuffer.length} bytes, MIME: ${context.mimeType}`,
            );
          } else {
            this.logger.warn("Failed to download media");
          }
        } catch (error) {
          this.logger.error({ error }, "Error downloading media");
        }
      }

      // Mark as read
      if (this.sender && context.messageId) {
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
