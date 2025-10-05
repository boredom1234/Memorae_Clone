import { getSupabaseClient } from "../lib/supabase";
import { logInfo, logError, logWarn } from "../utils/logger";
export interface ReminderNotificationCallback {
  (reminder: {
    id: string;
    userId: string;
    title: string;
    notes?: string;
    priority: "low" | "medium" | "high";
    reminderTime: string;
    isRecurring: boolean;
  }): Promise<void>;
}
export class ReminderScheduler {
  private supabase = getSupabaseClient();
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private checkIntervalMs: number;
  private onReminderDue?: ReminderNotificationCallback;
  constructor(checkIntervalMs: number = 5000) {
    this.checkIntervalMs = checkIntervalMs;
  }
  setNotificationCallback(callback: ReminderNotificationCallback) {
    this.onReminderDue = callback;
  }
  start() {
    if (this.isRunning) {
      logWarn("Reminder scheduler is already running");
      return;
    }
    logInfo("Starting reminder scheduler", {
      checkIntervalMs: this.checkIntervalMs,
    });
    this.isRunning = true;
    this.checkDueReminders();
    this.intervalId = setInterval(() => {
      this.checkDueReminders();
    }, this.checkIntervalMs);
  }
  stop() {
    if (!this.isRunning) {
      logWarn("Reminder scheduler is not running");
      return;
    }
    logInfo("Stopping reminder scheduler");
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }
  private async checkDueReminders() {
    try {
      const now = new Date().toISOString();
      let dueReminders: any[] | null = null;
      let usedRpc = false;
      try {
        const { data: claimed, error: rpcError } = await this.supabase.rpc(
          "claim_due_reminders",
          { now_ts: now, batch_size: 50 },
        );
        if (!rpcError && Array.isArray(claimed)) {
          dueReminders = claimed as any[];
          usedRpc = true;
        }
      } catch (e) {
        logWarn("RPC claim_due_reminders not available, falling back", { e });
      }
      if (!dueReminders) {
        const { data, error } = await this.supabase
          .from("reminders")
          .select(
            "id, user_id, title, notes, priority, reminder_time, is_recurring, recurrence_rule, recurrence_end_date",
          )
          .eq("status", "pending")
          .lte("reminder_time", now)
          .order("reminder_time", { ascending: true })
          .limit(50);
        if (error) {
          logError("Failed to fetch due reminders (fallback)", error);
          return;
        }
        dueReminders = data || [];
      }
      if (!dueReminders || dueReminders.length === 0) {
        return;
      }
      logInfo(`Found ${dueReminders.length} due reminder(s)`, {
        count: dueReminders.length,
      });
      for (const reminder of dueReminders) {
        try {
          if (!usedRpc) {
            const claim = await this.supabase
              .from("reminders")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", reminder.id)
              .eq("status", "pending")
              .lte("reminder_time", now)
              .select("id")
              .single();
            if (claim.error || !claim.data) {
              continue;
            }
          }
          if (this.onReminderDue) {
            await this.onReminderDue({
              id: reminder.id,
              userId: reminder.user_id,
              title: reminder.title,
              notes: reminder.notes,
              priority: reminder.priority,
              reminderTime: reminder.reminder_time,
              isRecurring: reminder.is_recurring,
            });
          }
          if (reminder.is_recurring && reminder.recurrence_rule) {
            const nextOccurrence = this.calculateNextOccurrence(
              reminder.reminder_time,
              reminder.recurrence_rule,
              reminder.recurrence_end_date,
            );
            if (nextOccurrence) {
              await this.supabase
                .from("reminders")
                .update({
                  reminder_time: nextOccurrence.toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq("id", reminder.id);
              logInfo(`Recurring reminder updated with next occurrence`, {
                reminderId: reminder.id,
                title: reminder.title,
                nextOccurrence: nextOccurrence.toISOString(),
              });
            } else {
              await this.supabase
                .from("reminders")
                .update({
                  status: "completed",
                  completed_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq("id", reminder.id);
              logInfo(`Recurring reminder completed (no more occurrences)`, {
                reminderId: reminder.id,
                title: reminder.title,
              });
            }
          } else {
            await this.supabase
              .from("reminders")
              .update({
                status: "completed",
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", reminder.id);
            logInfo(`One-time reminder marked as completed`, {
              reminderId: reminder.id,
              title: reminder.title,
            });
          }
        } catch (error) {
          logError(`Failed to process reminder ${reminder.id}`, error, {
            reminderId: reminder.id,
            title: reminder.title,
          });
        }
      }
    } catch (error) {
      logError("Error in checkDueReminders", error);
    }
  }
  async triggerCheck() {
    await this.checkDueReminders();
  }
  isSchedulerRunning(): boolean {
    return this.isRunning;
  }
  private calculateNextOccurrence(
    currentTime: string,
    recurrenceRule: string,
    endDate?: string | null,
  ): Date | null {
    try {
      const current = new Date(currentTime);
      const now = new Date();
      let next: Date | null = null;
      const rule = recurrenceRule.toLowerCase().trim();
      if (rule.startsWith("freq=")) {
        return this.parseRRULE(rule, current, endDate);
      }
      if (rule === "daily" || rule === "every day") {
        next = new Date(current);
        next.setDate(next.getDate() + 1);
      } else if (rule === "weekly" || rule === "every week") {
        next = new Date(current);
        next.setDate(next.getDate() + 7);
      } else if (rule === "monthly" || rule === "every month") {
        next = new Date(current);
        next.setMonth(next.getMonth() + 1);
      } else if (rule === "yearly" || rule === "every year") {
        next = new Date(current);
        next.setFullYear(next.getFullYear() + 1);
      } else if (rule.match(/^every (\d+) days?$/)) {
        const match = rule.match(/^every (\d+) days?$/);
        const days = parseInt(match![1], 10);
        next = new Date(current);
        next.setDate(next.getDate() + days);
      } else if (rule.match(/^every (\d+) weeks?$/)) {
        const match = rule.match(/^every (\d+) weeks?$/);
        const weeks = parseInt(match![1], 10);
        next = new Date(current);
        next.setDate(next.getDate() + weeks * 7);
      } else if (rule.match(/^every (\d+) months?$/)) {
        const match = rule.match(/^every (\d+) months?$/);
        const months = parseInt(match![1], 10);
        next = new Date(current);
        next.setMonth(next.getMonth() + months);
      } else if (rule.match(/^every (\d+) hours?$/)) {
        const match = rule.match(/^every (\d+) hours?$/);
        const hours = parseInt(match![1], 10);
        next = new Date(current);
        next.setHours(next.getHours() + hours);
      } else if (rule.match(/^every (\d+) minutes?$/)) {
        const match = rule.match(/^every (\d+) minutes?$/);
        const minutes = parseInt(match![1], 10);
        next = new Date(current);
        next.setMinutes(next.getMinutes() + minutes);
      } else if (rule.match(/^every (\d+) seconds?$/)) {
        const match = rule.match(/^every (\d+) seconds?$/);
        const seconds = parseInt(match![1], 10);
        next = new Date(current);
        next.setSeconds(next.getSeconds() + seconds);
      } else if (rule.match(/weekdays?/)) {
        next = new Date(current);
        do {
          next.setDate(next.getDate() + 1);
        } while (next.getDay() === 0 || next.getDay() === 6);
      } else if (rule.match(/weekends?/)) {
        next = new Date(current);
        next.setDate(next.getDate() + 1);
        while (next.getDay() !== 0 && next.getDay() !== 6) {
          next.setDate(next.getDate() + 1);
        }
      } else {
        logWarn(
          `Unknown recurrence rule: ${recurrenceRule}, attempting natural language parse`,
        );
        next = new Date(current);
        next.setDate(next.getDate() + 1);
      }
      if (next && next <= now) {
        return this.calculateNextOccurrence(
          next.toISOString(),
          recurrenceRule,
          endDate,
        );
      }
      if (next && endDate) {
        const end = new Date(endDate);
        if (next > end) {
          logInfo("Next occurrence exceeds recurrence end date", {
            nextOccurrence: next.toISOString(),
            endDate: endDate,
          });
          return null;
        }
      }
      return next;
    } catch (error) {
      logError("Failed to calculate next occurrence", error, {
        currentTime,
        recurrenceRule,
      });
      return null;
    }
  }
  private parseRRULE(
    rrule: string,
    current: Date,
    endDate?: string | null,
  ): Date | null {
    try {
      const now = new Date();
      let next = new Date(current);
      const parts = rrule.split(";").reduce(
        (acc, part) => {
          const [key, value] = part.split("=");
          acc[key.toLowerCase()] = value.toLowerCase();
          return acc;
        },
        {} as Record<string, string>,
      );
      const freq = parts["freq"];
      const interval = parseInt(parts["interval"] || "1", 10);
      const byDayStr = parts["byday"];
      const bySetPosStr = parts["bysetpos"];
      const dayMap: Record<string, number> = {
        su: 0,
        mo: 1,
        tu: 2,
        we: 3,
        th: 4,
        fr: 5,
        sa: 6,
      };
      const byDays: number[] | undefined = byDayStr
        ? byDayStr
            .split(",")
            .map((d) => d.trim())
            .filter(Boolean)
            .map((d) => dayMap[d])
            .filter((n) => n !== undefined)
        : undefined;
      const bySetPos: number[] | undefined = bySetPosStr
        ? bySetPosStr
            .split(",")
            .map((p) => parseInt(p.trim(), 10))
            .filter((n) => !isNaN(n) && n !== 0)
        : undefined;
      const cloneWithTime = (
        base: Date,
        year: number,
        month: number,
        day: number,
      ) => {
        const d = new Date(base);
        d.setFullYear(year, month, day);
        return d;
      };
      const nextFromWeeklyByDay = (): Date | null => {
        if (!byDays || byDays.length === 0) return null;
        const candidates: Date[] = [];
        const base = new Date(current);
        const searchStart = new Date(
          Math.max(base.getTime() + 60000, Date.now()),
        );
        const weeksToScan = Math.max(4, interval * 4);
        for (let w = 0; w < weeksToScan; w++) {
          const weekStart = new Date(base);
          weekStart.setDate(weekStart.getDate() + w * 7 * interval);
          for (const day of byDays) {
            const diff = (day - weekStart.getDay() + 7) % 7;
            const candidate = new Date(weekStart);
            candidate.setDate(weekStart.getDate() + diff);
            candidate.setHours(
              base.getHours(),
              base.getMinutes(),
              base.getSeconds(),
              base.getMilliseconds(),
            );
            if (candidate > searchStart) candidates.push(candidate);
          }
        }
        if (candidates.length === 0) return null;
        candidates.sort((a, b) => a.getTime() - b.getTime());
        return candidates[0];
      };
      const nthWeekdayOfMonth = (
        year: number,
        month: number,
        weekday: number,
        n: number,
        baseTime: Date,
      ): Date | null => {
        if (n > 0) {
          const firstOfMonth = new Date(year, month, 1);
          const firstWeekdayDiff = (weekday - firstOfMonth.getDay() + 7) % 7;
          const day = 1 + firstWeekdayDiff + (n - 1) * 7;
          const candidate = cloneWithTime(baseTime, year, month, day);
          if (candidate.getMonth() !== month) return null;
          return candidate;
        } else {
          const lastOfMonth = new Date(year, month + 1, 0);
          const lastWeekdayDiff = (lastOfMonth.getDay() - weekday + 7) % 7;
          const day = lastOfMonth.getDate() - lastWeekdayDiff + (n + 1) * 7;
          const candidate = cloneWithTime(baseTime, year, month, day);
          if (candidate.getMonth() !== month) return null;
          return candidate;
        }
      };
      const nextFromMonthlyByDayAndSetPos = (): Date | null => {
        if (
          !byDays ||
          byDays.length === 0 ||
          !bySetPos ||
          bySetPos.length === 0
        )
          return null;
        const base = new Date(current);
        const start = new Date(Math.max(base.getTime() + 60000, Date.now()));
        for (let m = 0; m <= 12; m++) {
          const date = new Date(base);
          date.setMonth(date.getMonth() + m * interval);
          const year = date.getFullYear();
          const month = date.getMonth();
          const candidates: Date[] = [];
          for (const wd of byDays) {
            for (const pos of bySetPos) {
              const cand = nthWeekdayOfMonth(year, month, wd, pos, base);
              if (cand && cand > start) candidates.push(cand);
            }
          }
          if (candidates.length > 0) {
            candidates.sort((a, b) => a.getTime() - b.getTime());
            return candidates[0];
          }
        }
        return null;
      };
      switch (freq) {
        case "secondly":
          next.setSeconds(next.getSeconds() + interval);
          break;
        case "minutely":
          next.setMinutes(next.getMinutes() + interval);
          break;
        case "hourly":
          next.setHours(next.getHours() + interval);
          break;
        case "daily":
          next.setDate(next.getDate() + interval);
          break;
        case "weekly": {
          const candidate = nextFromWeeklyByDay();
          if (candidate) next = candidate;
          else next.setDate(next.getDate() + interval * 7);
          break;
        }
        case "monthly": {
          const candidate = nextFromMonthlyByDayAndSetPos();
          if (candidate) next = candidate;
          else next.setMonth(next.getMonth() + interval);
          break;
        }
        case "yearly":
          next.setFullYear(next.getFullYear() + interval);
          break;
        default:
          logWarn(`Unknown RRULE frequency: ${freq}`);
          return null;
      }
      if (next <= now) {
        return this.parseRRULE(rrule, next, endDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        if (next > end) {
          return null;
        }
      }
      return next;
    } catch (error) {
      logError("Failed to parse RRULE", error, { rrule });
      return null;
    }
  }
}
