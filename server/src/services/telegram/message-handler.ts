import TelegramBot from "node-telegram-bot-api";
import { MessageContext } from "./types";
import pino from "pino";

export class MessageHandler {
  private logger = pino({ level: "info" });

  async parseMessage(
    message: TelegramBot.Message,
  ): Promise<MessageContext | null> {
    try {
      if (!message.from) {
        this.logger.warn("Message has no 'from' field");
        return null;
      }

      const messageType = this.getMessageType(message);
      const text = this.extractText(message);
      const fromName =
        message.from.username ||
        `${message.from.first_name || ""} ${message.from.last_name || ""}`.trim() ||
        message.from.id.toString();

      const context: MessageContext = {
        messageId: message.message_id.toString(),
        from: message.from.id.toString(),
        fromName,
        text,
        timestamp: message.date,
        isGroup:
          message.chat.type === "group" || message.chat.type === "supergroup",
        groupId:
          message.chat.type === "group" || message.chat.type === "supergroup"
            ? message.chat.id.toString()
            : undefined,
        messageType,
        chatId: message.chat.id,
      };

      // Handle quoted/replied messages
      if (message.reply_to_message) {
        context.quoted = {
          messageId: message.reply_to_message.message_id.toString(),
          text: this.extractText(message.reply_to_message),
        };
      }

      return context;
    } catch (error) {
      this.logger.error({ error }, "Error parsing Telegram message");
      return null;
    }
  }

  private getMessageType(
    message: TelegramBot.Message,
  ): MessageContext["messageType"] {
    if (message.text) return "text";
    if (message.photo) return "image"; // Changed from "photo" to "image" for compatibility
    if (message.audio) return "audio";
    if (message.video) return "video";
    if (message.document) return "document";
    if (message.voice) return "voice";
    return "unknown";
  }

  private extractText(message: TelegramBot.Message): string | undefined {
    return message.text || message.caption || undefined;
  }

  async downloadMedia(
    bot: TelegramBot,
    message: TelegramBot.Message,
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    try {
      let fileId: string | undefined;
      let mimeType = "application/octet-stream";

      if (message.photo && message.photo.length > 0) {
        // Get the largest photo
        fileId = message.photo[message.photo.length - 1].file_id;
        mimeType = "image/jpeg";
      } else if (message.video) {
        fileId = message.video.file_id;
        mimeType = message.video.mime_type || "video/mp4";
      } else if (message.audio) {
        fileId = message.audio.file_id;
        mimeType = message.audio.mime_type || "audio/mpeg";
      } else if (message.voice) {
        fileId = message.voice.file_id;
        mimeType = message.voice.mime_type || "audio/ogg";
      } else if (message.document) {
        fileId = message.document.file_id;
        mimeType = message.document.mime_type || "application/octet-stream";
      }

      if (!fileId) {
        return null;
      }

      // Get file link using bot's public method
      const fileLink = await bot.getFileLink(fileId);

      // Download file from the link
      const response = await fetch(fileLink);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      return { buffer, mimeType };
    } catch (error) {
      this.logger.error({ error }, "Error downloading Telegram media");
      return null;
    }
  }

  isCommand(text: string | undefined): boolean {
    return text?.startsWith("/") || false;
  }

  extractCommand(text: string): { command: string; args: string[] } {
    const parts = text.trim().split(/\s+/);
    const command = parts[0].toLowerCase().replace(/^\//, "");
    const args = parts.slice(1);
    return { command, args };
  }
}
