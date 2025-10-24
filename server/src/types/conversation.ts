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
  summary?: string;
  onboarding?: {
    step: number;
    collected: {
      name?: string;
      timezone?: string;
      defaultReminderTime?: string;
      notificationEnabled?: boolean;
      advanceNoticeMinutes?: number;
      quietHoursEnabled?: boolean;
      quietHoursStart?: string;
      quietHoursEnd?: string;
      quietHoursDays?: string[];
      language?: string;
    };
  };
  lastReminderSearch?: {
    query: string;
    results: any[];
    timestamp: Date;
  };
  lastListSearch?: {
    query: string;
    results: any[];
    timestamp: Date;
  };
  pendingAction?: {
    type: "delete" | "update" | "complete" | "snooze";
    targetType: "reminder" | "list" | "note";
    targetId?: string;
    params?: any;
    timestamp: Date;
  };
  candidateItems?: Array<{
    id: string;
    title: string;
    description?: string;
    type: "reminder" | "list" | "note";
  }>;
  needsConfirmation?: {
    action: string;
    summary: string;
    targetId: string;
    timestamp: Date;
  };
}
export interface ConversationManager {
  getContext(userId: string): ConversationContext;
  addMessage(userId: string, message: ConversationMessage): void;
  clearContext(userId: string): void;
  cleanup(): void;
}
