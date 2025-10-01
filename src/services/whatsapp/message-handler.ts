import { WASocket, proto, downloadMediaMessage } from '@whiskeysockets/baileys';
import { MessageContext, WhatsAppMessage } from './types';
import pino from 'pino';

export class MessageHandler {
  private logger = pino({ level: 'info' });

  async parseMessage(message: WhatsAppMessage): Promise<MessageContext | null> {
    try {
      const { key, message: msg, messageTimestamp } = message;

      if (!msg || !key.remoteJid) {
        return null;
      }

      const from = key.remoteJid;
      const messageId = key.id || '';
      const isGroup = from.endsWith('@g.us');
      const timestamp = typeof messageTimestamp === 'number' 
        ? messageTimestamp 
        : Number(messageTimestamp);

      // Extract message content
      const messageType = this.getMessageType(msg);
      const text = this.extractText(msg);
      const fromName = (key as any).pushName || from.split('@')[0];

      const context: MessageContext = {
        messageId,
        from,
        fromName,
        text,
        timestamp,
        isGroup,
        groupId: isGroup ? from : undefined,
        messageType,
      };

      // Handle quoted messages
      if (msg.extendedTextMessage?.contextInfo?.quotedMessage) {
        context.quoted = {
          messageId: msg.extendedTextMessage.contextInfo.stanzaId || '',
          text: this.extractText(msg.extendedTextMessage.contextInfo.quotedMessage),
        };
      }

      return context;
    } catch (error) {
      this.logger.error({ error }, 'Error parsing message');
      return null;
    }
  }

  private getMessageType(msg: proto.IMessage): MessageContext['messageType'] {
    if (msg.conversation || msg.extendedTextMessage) return 'text';
    if (msg.imageMessage) return 'image';
    if (msg.audioMessage) return 'audio';
    if (msg.videoMessage) return 'video';
    if (msg.documentMessage) return 'document';
    return 'unknown';
  }

  private extractText(msg: proto.IMessage | undefined): string | undefined {
    if (!msg) return undefined;
    
    return (
      msg.conversation ||
      msg.extendedTextMessage?.text ||
      msg.imageMessage?.caption ||
      msg.videoMessage?.caption ||
      msg.documentMessage?.caption ||
      undefined
    );
  }

  async downloadMedia(
    message: WhatsAppMessage,
    socket: WASocket
  ): Promise<Buffer | null> {
    try {
      if (!message.message) return null;

      const buffer = await downloadMediaMessage(
        message as any,
        'buffer',
        {},
        {
          logger: this.logger as any,
          reuploadRequest: socket.updateMediaMessage,
        }
      );

      return buffer as Buffer;
    } catch (error) {
      this.logger.error({ error }, 'Error downloading media');
      return null;
    }
  }

  isCommand(text: string | undefined): boolean {
    return text?.startsWith('/') || text?.startsWith('!') || false;
  }

  extractCommand(text: string): { command: string; args: string[] } {
    const parts = text.trim().split(/\s+/);
    const command = parts[0].toLowerCase().replace(/^[/!]/, '');
    const args = parts.slice(1);
    return { command, args };
  }
}
