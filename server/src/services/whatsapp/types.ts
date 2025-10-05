import { proto } from "@whiskeysockets/baileys";

export interface MessageContext {
  messageId: string;
  from: string;
  fromName: string;
  text?: string;
  timestamp: number;
  isGroup: boolean;
  groupId?: string;
  messageType:
    | "text"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "voice"
    | "unknown";
  mediaUrl?: string;
  mediaBuffer?: Buffer; // For image/document OCR processing
  mimeType?: string; // MIME type of media (e.g., image/jpeg, image/png)
  quoted?: {
    messageId: string;
    text?: string;
  };
  // Propagated by WhatsAppService after filtering to avoid accidental
  // processing (e.g., creating users) in downstream layers.
  isSelfChat?: boolean;
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
