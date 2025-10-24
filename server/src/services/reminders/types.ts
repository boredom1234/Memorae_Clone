export interface Reminder {
  id: string;
  user_id: string;
  title: string;
  notes?: string;
  reminder_time: string;
  is_recurring: boolean;
  recurrence_rule?: string;
  recurrence_end_date?: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "completed" | "cancelled" | "snoozed";
  snoozed_until?: string;
  snooze_count: number;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ReminderCreationParams {
    userId: string;
    title: string;
    reminderTime: string;
    timezone: string;
    isRecurring: boolean;
    recurrenceRule?: string;
    notes?: string;
    priority?: "low" | "medium" | "high";
}

export interface ReminderUpdateParams {
    userId: string;
    reminderId: string;
    title?: string;
    reminderTime?: string;
    isRecurring?: boolean;
    recurrenceRule?: string;
    notes?: string;
    priority?: "low" | "medium" | "high";
}

export interface UpcomingReminder {
    id: string;
    title: string;
    reminderTime: string;
    timeUntil: string;
}

export interface SearchResult {
    id: string;
    title: string;
    reminderTime: string;
    relevanceScore: number;
}
