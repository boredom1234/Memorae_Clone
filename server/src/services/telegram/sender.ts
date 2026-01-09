import TelegramBot from "node-telegram-bot-api";
import { SendMessageOptions } from "./types";
import { chunkText, needsChunking } from "../../utils/text-chunker";
import {
  convertToTelegramMarkdown,
  stripMarkdown,
} from "../../utils/telegram-markdown";
import pino from "pino";

export class MessageSender {
  private bot: TelegramBot;
  private logger = pino({ level: "info" });

  constructor(bot: TelegramBot) {
    this.bot = bot;
  }

  async sendText(
    options: SendMessageOptions
  ): Promise<TelegramBot.Message | null> {
    try {
      const { chatId, text, replyToMessageId, parseMode } = options;

      // Handle long messages by chunking
      if (needsChunking(text)) {
        return await this.sendChunkedText(
          chatId,
          text,
          replyToMessageId,
          parseMode
        );
      }

      // Send single message
      return await this.sendSingleMessage(
        chatId,
        text,
        replyToMessageId,
        parseMode
      );
    } catch (error) {
      this.logger.error({ error }, "Error sending text message");
      return null;
    }
  }

  private async sendSingleMessage(
    chatId: number,
    text: string,
    replyToMessageId?: number,
    parseMode?: "Markdown" | "MarkdownV2" | "HTML"
  ): Promise<TelegramBot.Message | null> {
    try {
      let sentMessage: TelegramBot.Message | null = null;

      if (parseMode === "Markdown" || parseMode === "MarkdownV2") {
        // Convert standard markdown to Telegram format
        const telegramText = convertToTelegramMarkdown(text);

        try {
          sentMessage = await this.bot.sendMessage(chatId, telegramText, {
            reply_to_message_id: replyToMessageId,
            parse_mode: "Markdown", // Use Markdown (less strict than MarkdownV2)
          });
        } catch (markdownError: any) {
          this.logger.warn(
            `Telegram Markdown parsing failed, trying plain text: ${markdownError.message}`
          );

          // Fallback: Strip all markdown and send as plain text
          const plainText = stripMarkdown(text);
          sentMessage = await this.bot.sendMessage(chatId, plainText, {
            reply_to_message_id: replyToMessageId,
          });
        }
      } else {
        sentMessage = await this.bot.sendMessage(chatId, text, {
          reply_to_message_id: replyToMessageId,
          parse_mode: parseMode,
        });
      }

      this.logger.info(`Message sent to chat ${chatId}`);
      return sentMessage;
    } catch (error) {
      this.logger.error({ error }, "Error sending single message");
      return null;
    }
  }

  private async sendChunkedText(
    chatId: number,
    text: string,
    replyToMessageId?: number,
    parseMode?: "Markdown" | "MarkdownV2" | "HTML"
  ): Promise<TelegramBot.Message | null> {
    const chunks = chunkText(text);
    this.logger.info(
      `Splitting long message into ${chunks.length} chunks for chat ${chatId}`
    );

    let lastMessage: TelegramBot.Message | null = null;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const isFirstChunk = i === 0;

      // Only reply to the original message for the first chunk
      const replyId = isFirstChunk ? replyToMessageId : undefined;

      lastMessage = await this.sendSingleMessage(
        chatId,
        chunk,
        replyId,
        parseMode
      );

      if (!lastMessage) {
        this.logger.warn(`Failed to send chunk ${i + 1}/${chunks.length}`);
        // Continue trying to send remaining chunks
      }

      // Small delay between chunks to avoid rate limiting
      if (i < chunks.length - 1) {
        await this.delay(100);
      }
    }

    return lastMessage;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async sendPhoto(
    chatId: number,
    photoBuffer: Buffer,
    caption?: string,
    replyToMessageId?: number
  ): Promise<TelegramBot.Message | null> {
    try {
      const sentMessage = await this.bot.sendPhoto(chatId, photoBuffer, {
        caption,
        reply_to_message_id: replyToMessageId,
      });
      this.logger.info(`Photo sent to chat ${chatId}`);
      return sentMessage;
    } catch (error) {
      this.logger.error({ error }, "Error sending photo");
      return null;
    }
  }

  async sendAudio(
    chatId: number,
    audioBuffer: Buffer,
    caption?: string,
    replyToMessageId?: number
  ): Promise<TelegramBot.Message | null> {
    try {
      const sentMessage = await this.bot.sendAudio(chatId, audioBuffer, {
        caption,
        reply_to_message_id: replyToMessageId,
      });
      this.logger.info(`Audio sent to chat ${chatId}`);
      return sentMessage;
    } catch (error) {
      this.logger.error({ error }, "Error sending audio");
      return null;
    }
  }

  async sendVoice(
    chatId: number,
    voiceBuffer: Buffer,
    caption?: string,
    replyToMessageId?: number
  ): Promise<TelegramBot.Message | null> {
    try {
      const sentMessage = await this.bot.sendVoice(chatId, voiceBuffer, {
        caption,
        reply_to_message_id: replyToMessageId,
      });
      this.logger.info(`Voice message sent to chat ${chatId}`);
      return sentMessage;
    } catch (error) {
      this.logger.error({ error }, "Error sending voice message");
      return null;
    }
  }

  async sendVideo(
    chatId: number,
    videoBuffer: Buffer,
    caption?: string,
    replyToMessageId?: number
  ): Promise<TelegramBot.Message | null> {
    try {
      const sentMessage = await this.bot.sendVideo(chatId, videoBuffer, {
        caption,
        reply_to_message_id: replyToMessageId,
      });
      this.logger.info(`Video sent to chat ${chatId}`);
      return sentMessage;
    } catch (error) {
      this.logger.error({ error }, "Error sending video");
      return null;
    }
  }

  async sendDocument(
    chatId: number,
    documentBuffer: Buffer,
    filename: string,
    caption?: string,
    replyToMessageId?: number
  ): Promise<TelegramBot.Message | null> {
    try {
      const sentMessage = await this.bot.sendDocument(
        chatId,
        documentBuffer,
        {
          caption,
          reply_to_message_id: replyToMessageId,
        },
        {
          filename,
        }
      );
      this.logger.info(`Document sent to chat ${chatId}`);
      return sentMessage;
    } catch (error) {
      this.logger.error({ error }, "Error sending document");
      return null;
    }
  }

  async sendChatAction(
    chatId: number,
    action: TelegramBot.ChatAction
  ): Promise<void> {
    try {
      await this.bot.sendChatAction(chatId, action);
    } catch (error) {
      this.logger.error({ error }, "Error sending chat action");
    }
  }

  async sendTyping(chatId: number, isTyping: boolean = true): Promise<void> {
    if (isTyping) {
      await this.sendChatAction(chatId, "typing");
    }
  }
}
