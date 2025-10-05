import { getSupabaseClient } from "../lib/supabase";
import { getWhatsAppManager } from "./runtime";
import { UserService } from "./user-service";
import { ReminderService } from "./reminder-service";
import pino from "pino";
export type SendReminderToContactParams = {
  senderUserId: string;
  recipientNumber: string;
  recipientName?: string;
  reminderText: string;
  reminderTime: string;
  fromUserName?: string;
};
export type SendReminderToContactResponse = {
  success: boolean;
  messageId: string;
  message: string;
};
export type GetNotificationHistoryParams = {
  limit?: number;
  offset?: number;
  type?: "reminder" | "shared" | "all";
  userId?: string;
};
export type NotificationHistoryItem = {
  id: string;
  type: string;
  sentAt: string;
  recipient?: string;
  content: string;
  status: "sent" | "failed" | "pending";
};
export type GetNotificationHistoryResponse = {
  notifications: NotificationHistoryItem[];
  total: number;
};
export type SendCustomMessageParams = {
  message: string;
  formatting?: "plain" | "markdown";
  buttons?: Array<{
    id: string;
    label: string;
  }>;
};
export type SendCustomMessageResponse = {
  success: boolean;
  messageId: string;
};
function normalizePhoneNumber(num: string): string {
  const trimmed = num.trim();
  if (trimmed.startsWith("+")) return trimmed;
  return "+" + trimmed.replace(/[^0-9]/g, "");
}
function toWhatsAppJid(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  return `${digits}@s.whatsapp.net`;
}
export class NotificationService {
  private supabase = getSupabaseClient();
  private userService = new UserService();
  private reminderService = new ReminderService();
  private logger = pino({ level: "info" });
  async sendReminderToContact(
    params: SendReminderToContactParams,
  ): Promise<SendReminderToContactResponse> {
    if (!params.senderUserId) {
      throw new Error("senderUserId is required to create a shared reminder");
    }
    const phone = normalizePhoneNumber(params.recipientNumber);
    const jid = toWhatsAppJid(phone);
    const { user } = await this.userService.findOrCreateUser(jid, phone);
    let tz = "UTC";
    try {
      const settings = await this.userService.getUserSettings(user.id);
      tz = settings?.timezone || "UTC";
    } catch {}
    const create = await this.reminderService.createReminder({
      userId: user.id,
      title: params.reminderText,
      reminderTime: params.reminderTime,
      timezone: tz,
      isRecurring: false,
      notes: params.fromUserName ? `From: ${params.fromUserName}` : undefined,
      priority: "medium",
    });
    let sharedId: string | undefined;
    try {
      const { data: sharedIns, error: sharedErr } = await this.supabase
        .from("shared_reminders")
        .insert({
          reminder_id: create.reminderId,
          sender_user_id: params.senderUserId,
          recipient_whatsapp_id: jid,
          recipient_name: params.recipientName || null,
          status: "pending",
        })
        .select("id")
        .single();
      if (sharedErr) throw sharedErr;
      sharedId = sharedIns.id;
    } catch (e) {
      this.logger.warn({ e }, "Failed to persist shared_reminders (pending)");
    }
    try {
      const rt = new Date(params.reminderTime).getTime();
      const now = Date.now();
      const shouldSendNow = !isNaN(rt) && rt - now <= 30000;
      if (shouldSendNow) {
        const manager = getWhatsAppManager();
        if (manager && manager.isConnected()) {
          const text = `*REMINDER*\n\n${params.reminderText}`;
          const ok: boolean = await manager.sendMessage(jid, text);
          await this.supabase.from("notification_history").insert({
            user_id: user.id,
            type: "reminder",
            content: text,
            reminder_id: create.reminderId,
            status: ok ? "sent" : "failed",
            sent_at: ok ? new Date().toISOString() : null,
            recipient_whatsapp_id: jid,
          });
          if (sharedId) {
            try {
              await this.supabase
                .from("shared_reminders")
                .update({
                  status: ok ? "sent" : "failed",
                  sent_at: ok ? new Date().toISOString() : null,
                })
                .eq("id", sharedId);
            } catch (e) {
              this.logger.warn(
                { e },
                "Failed to update shared_reminders status",
              );
            }
          }
        }
      }
    } catch (e) {
      this.logger.warn({ e }, "Immediate send fallback failed");
    }
    return {
      success: true,
      messageId: create.reminderId,
      message: create.message,
    };
  }
  async getNotificationHistory(
    params: GetNotificationHistoryParams,
  ): Promise<GetNotificationHistoryResponse> {
    const limit = params.limit ?? 20;
    const offset = params.offset ?? 0;
    let query = this.supabase
      .from("notification_history")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (params.userId) {
      query = query.eq("user_id", params.userId);
    }
    if (params.type && params.type !== "all") {
      query = query.eq("type", params.type);
    }
    const { data, error, count } = await query;
    if (error) throw error;
    const notifications: NotificationHistoryItem[] = (data || []).map(
      (row: any) => {
        const status: NotificationHistoryItem["status"] =
          row.status === "delivered"
            ? "sent"
            : row.status === "permanently_failed"
              ? "failed"
              : (row.status as any);
        let recipient: string | undefined;
        if (row.recipient_whatsapp_id) {
          const digit = String(row.recipient_whatsapp_id).split("@")[0];
          recipient = "+" + digit;
        }
        return {
          id: row.id,
          type: row.type,
          sentAt: row.sent_at || row.created_at,
          recipient,
          content: row.content,
          status,
        };
      },
    );
    return { notifications, total: count || 0 };
  }
  async sendCustomMessage(
    userId: string,
    params: SendCustomMessageParams,
  ): Promise<SendCustomMessageResponse> {
    const { data: user, error } = await this.supabase
      .from("users")
      .select("whatsapp_id, id")
      .eq("id", userId)
      .single();
    if (error || !user) {
      throw new Error("Target user not found");
    }
    const jid = user.whatsapp_id as string;
    let text = params.message;
    if (params.buttons && params.buttons.length > 0) {
      const lines = params.buttons.map((b) => `- ${b.label}`);
      text = `${text}\n\nOptions:\n${lines.join("\n")}`;
    }
    const manager = getWhatsAppManager();
    if (!manager || !manager.isConnected()) {
      throw new Error("WhatsApp is not connected");
    }
    const ok: boolean = await manager.sendMessage(jid, text);
    const { data: inserted, error: insErr } = await this.supabase
      .from("notification_history")
      .insert({
        user_id: user.id,
        type: "shared",
        content: text,
        status: ok ? "sent" : "failed",
        sent_at: ok ? new Date().toISOString() : null,
        recipient_whatsapp_id: jid,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;
    return { success: ok, messageId: inserted.id };
  }
}
