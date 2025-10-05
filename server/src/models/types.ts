// Database Types
export interface User {
  id: string;
  whatsapp_id?: string | null;
  telegram_id?: string | null;
  phone_number?: string | null;
  name?: string;
  timezone: string;
  language: string;
  default_reminder_time: string;
  notification_enabled: boolean;
  advance_notice_minutes: number;
  quiet_hours_enabled: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  quiet_hours_days?: string[];
  created_at: string;
  updated_at: string;
  last_active_at: string;
}

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

export interface List {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  is_archived: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ListItem {
  id: string;
  list_id: string;
  content: string;
  notes?: string;
  is_completed: boolean;
  completed_at?: string;
  position: number;
  reminder_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CalendarConnection {
  id: string;
  user_id: string;
  provider: "google" | "outlook" | "apple";
  provider_account_id?: string;
  provider_account_email?: string;
  access_token?: string;
  refresh_token?: string;
  token_expires_at?: string;
  calendar_id?: string;
  sync_enabled: boolean;
  auto_import_events: boolean;
  connected_at: string;
  last_synced_at?: string;
}

export interface NotificationHistory {
  id: string;
  user_id: string;
  type: "reminder" | "shared" | "system" | "calendar";
  content: string;
  reminder_id?: string;
  list_id?: string;
  recipient_whatsapp_id?: string;
  status: "pending" | "sent" | "failed" | "delivered";
  error_message?: string;
  retry_count: number;
  sent_at?: string;
  delivered_at?: string;
  created_at: string;
}

export interface ConversationContext {
  id: string;
  user_id: string;
  message_history: any[];
  current_intent?: string;
  pending_action?: any;
  session_id?: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface MediaAttachment {
  id: string;
  user_id: string;
  media_type: "image" | "audio" | "video" | "document";
  file_url: string;
  file_size?: number;
  mime_type?: string;
  transcription?: string;
  extracted_text?: string;
  extracted_data?: any;
  reminder_id?: string;
  list_item_id?: string;
  created_at: string;
  processed_at?: string;
}
