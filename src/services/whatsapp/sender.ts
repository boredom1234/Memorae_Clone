import { WASocket, proto } from '@whiskeysockets/baileys';
import { SendMessageOptions } from './types';
import pino from 'pino';

export class MessageSender {
  private socket: WASocket;
  private logger = pino({ level: 'info' });

  constructor(socket: WASocket) {
    this.socket = socket;
  }

  async sendText(options: SendMessageOptions): Promise<proto.WebMessageInfo | null> {
    try {
      const { to, text, quotedMessageId } = options;

      const sentMessage = await this.socket.sendMessage(to, { text }, {
        quoted: quotedMessageId
          ? { key: { id: quotedMessageId, remoteJid: to } }
          : undefined,
      });

      this.logger.info(`Message sent to ${to}`);
      return sentMessage ?? null;
    } catch (error) {
      this.logger.error({ error }, 'Error sending text message');
      return null;
    }
  }

  async sendImage(to: string, imageBuffer: Buffer, caption?: string): Promise<proto.WebMessageInfo | null> {
    try {
      const sentMessage = await this.socket.sendMessage(to, {
        image: imageBuffer,
        caption,
      });

      this.logger.info(`Image sent to ${to}`);
      return sentMessage ?? null;
    } catch (error) {
      this.logger.error({ error }, 'Error sending image');
      return null;
    }
  }

  async sendAudio(to: string, audioBuffer: Buffer): Promise<proto.WebMessageInfo | null> {
    try {
      const sentMessage = await this.socket.sendMessage(to, {
        audio: audioBuffer,
        mimetype: 'audio/mp4',
        ptt: true, // Push to talk (voice note)
      });

      this.logger.info(`Audio sent to ${to}`);
      return sentMessage ?? null;
    } catch (error) {
      this.logger.error({ error }, 'Error sending audio');
      return null;
    }
  }

  async sendDocument(
    to: string,
    documentBuffer: Buffer,
    filename: string,
    mimetype: string
  ): Promise<proto.WebMessageInfo | null> {
    try {
      const sentMessage = await this.socket.sendMessage(to, {
        document: documentBuffer,
        fileName: filename,
        mimetype,
      });

      this.logger.info(`Document sent to ${to}`);
      return sentMessage ?? null;
    } catch (error) {
      this.logger.error({ error }, 'Error sending document');
      return null;
    }
  }

  async sendReaction(to: string, messageId: string, emoji: string): Promise<void> {
    try {
      await this.socket.sendMessage(to, {
        react: {
          text: emoji,
          key: { id: messageId, remoteJid: to },
        },
      });

      this.logger.info(`Reaction sent to ${to}`);
    } catch (error) {
      this.logger.error({ error }, 'Error sending reaction');
    }
  }

  async markAsRead(to: string, messageId: string): Promise<void> {
    try {
      await this.socket.readMessages([{ remoteJid: to, id: messageId, participant: undefined }]);
      this.logger.debug(`Message marked as read: ${messageId}`);
    } catch (error) {
      this.logger.error({ error }, 'Error marking message as read');
    }
  }

  async sendTyping(to: string, isTyping: boolean = true): Promise<void> {
    try {
      await this.socket.sendPresenceUpdate(isTyping ? 'composing' : 'paused', to);
    } catch (error) {
      this.logger.error({ error }, 'Error sending typing indicator');
    }
  }
}
