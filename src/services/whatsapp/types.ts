import { proto } from "@whiskeysockets/baileys";

export interface MessageContext {
  messageId: string;
  from: string;
  fromName: string;
  text?: string;
  timestamp: number;
  isGroup: boolean;
  groupId?: string;
  messageType: "text" | "image" | "audio" | "video" | "document" | "unknown";
  mediaUrl?: string;
  quoted?: {
    messageId: string;
    text?: string;
  };
}

export interface WhatsAppMessage {
  key: proto.IMessageKey;
  message?: proto.IMessage;
  messageTimestamp?: number | Long;
}

export interface WhatsAppServiceConfig {
  sessionPath: string;
  printQRInTerminal?: boolean;
  onMessage?: (context: MessageContext) => Promise<void>;
  onConnectionUpdate?: (isConnected: boolean) => void;
}

export interface SendMessageOptions {
  to: string;
  text: string;
  quotedMessageId?: string;
}

export interface SendMediaOptions {
  to: string;
  mediaUrl: string;
  caption?: string;
  mediaType: "image" | "audio" | "video" | "document";
}
