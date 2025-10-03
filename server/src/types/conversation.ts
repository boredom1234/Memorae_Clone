export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  messageId?: string;
}

export interface ConversationContext {
  userId: string;
  messages: ConversationMessage[];
  lastActivity: Date;
  maxMessages: number;
}

export interface ConversationManager {
  getContext(userId: string): ConversationContext;
  addMessage(userId: string, message: ConversationMessage): void;
  clearContext(userId: string): void;
  cleanup(): void;
}
