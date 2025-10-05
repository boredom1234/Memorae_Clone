export interface MessageContext {
  messageId: string; // Changed to string for compatibility with MessageController
  from: string; // Changed to string for compatibility with MessageController
  fromName: string;
  text?: string;
  timestamp: number;
  isGroup: boolean;
  groupId?: string; // Changed to string for compatibility
  messageType:
    | "text"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "voice"
    | "unknown";
  mediaUrl?: string;
  mediaBuffer?: Buffer; // For photo/document OCR processing
  mimeType?: string; // MIME type of media
  quoted?: {
    messageId: string; // Changed to string for compatibility
    text?: string;
  };
  chatId: number; // Telegram chat ID (kept as number for internal use)
}

export interface TelegramServiceConfig {
  botToken: string;
  allowedUsers?: number[]; // List of allowed Telegram user IDs
  onMessage?: (context: MessageContext) => Promise<void>;
  onConnectionUpdate?: (isConnected: boolean) => void;
}

export interface SendMessageOptions {
  chatId: number;
  text: string;
  replyToMessageId?: number;
  parseMode?: "Markdown" | "MarkdownV2" | "HTML";
}

export interface SendMediaOptions {
  chatId: number;
  mediaBuffer: Buffer;
  caption?: string;
  mediaType: "photo" | "audio" | "video" | "document" | "voice";
  replyToMessageId?: number;
}
