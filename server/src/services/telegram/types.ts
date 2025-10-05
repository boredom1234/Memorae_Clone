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
  mediaBuffer?: Buffer;
  mimeType?: string;
  quoted?: {
    messageId: string;
    text?: string;
  };
  chatId: number;
}
export interface TelegramServiceConfig {
  botToken: string;
  allowedUsers?: number[];
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
