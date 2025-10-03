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
  // Optional onboarding state for first-time user setup
  onboarding?: {
    step: number;
    collected: {
      name?: string;
      timezone?: string;
      defaultReminderTime?: string; // HH:MM
      notificationEnabled?: boolean;
      advanceNoticeMinutes?: number;
      quietHoursEnabled?: boolean;
      quietHoursStart?: string; // HH:MM
      quietHoursEnd?: string; // HH:MM
      quietHoursDays?: string[]; // monday..sunday
      language?: string; // 2-letter code
    };
  };
}

export interface ConversationManager {
  getContext(userId: string): ConversationContext;
  addMessage(userId: string, message: ConversationMessage): void;
  clearContext(userId: string): void;
  cleanup(): void;
}
