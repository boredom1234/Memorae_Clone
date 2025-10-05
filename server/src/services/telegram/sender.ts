import TelegramBot from "node-telegram-bot-api";
import { SendMessageOptions } from "./types";
import pino from "pino";
export class MessageSender {
  private bot: TelegramBot;
  private logger = pino({ level: "info" });
  constructor(bot: TelegramBot) {
    this.bot = bot;
  }
  async sendText(
    options: SendMessageOptions,
  ): Promise<TelegramBot.Message | null> {
    try {
      const { chatId, text, replyToMessageId, parseMode } = options;
      let sentMessage: TelegramBot.Message | null = null;
      if (parseMode === "Markdown" || parseMode === "MarkdownV2") {
        try {
          sentMessage = await this.bot.sendMessage(chatId, text, {
            reply_to_message_id: replyToMessageId,
            parse_mode: parseMode,
          });
        } catch (markdownError: any) {
          this.logger.warn(
            `Markdown parsing failed, sending as plain text: ${markdownError.message}`,
          );
          sentMessage = await this.bot.sendMessage(chatId, text, {
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
      this.logger.error({ error }, "Error sending text message");
      return null;
    }
  }
  async sendPhoto(
    chatId: number,
    photoBuffer: Buffer,
    caption?: string,
    replyToMessageId?: number,
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
    replyToMessageId?: number,
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
    replyToMessageId?: number,
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
    replyToMessageId?: number,
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
    replyToMessageId?: number,
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
        },
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
    action: TelegramBot.ChatAction,
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
