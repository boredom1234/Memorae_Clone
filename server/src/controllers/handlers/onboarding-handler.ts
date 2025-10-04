import { MessageContext } from "../../services/whatsapp";
import { User } from "../../models/types";
import { ConversationContext } from "../../types/conversation";
import { UserService } from "../../services/user-service";

/**
 * Onboarding Handler Module
 * Manages user onboarding flow
 */

export class OnboardingHandler {
  private userService: UserService;

  constructor(userService: UserService) {
    this.userService = userService;
  }

  /**
   * Handle onboarding flow for new or in-progress users
   */
  async handleOnboardingFlow(
    context: MessageContext,
    user: User,
    userInput: string,
    conversationContext: ConversationContext,
  ): Promise<string | null> {
    const onboarding = (conversationContext.onboarding =
      conversationContext.onboarding || {
        step: 0,
        collected: {},
      });

    const lower = (userInput || "").trim().toLowerCase();

    // Helpers
    const isYes = (s: string) => /^(y|yes|yeah|yup|true|1)$/i.test(s.trim());
    const isNo = (s: string) => /^(n|no|nope|false|0)$/i.test(s.trim());
    const timeRegex = /^([0-1]?\d|2[0-3]):[0-5]\d$/;
    const parseDays = (s: string): string[] | null => {
      const allDays = [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ];
      const val = s.trim().toLowerCase();
      if (val === "weekdays") return allDays.slice(0, 5);
      if (val === "weekends") return ["saturday", "sunday"];
      if (val === "all") return allDays;
      const parts = val
        .split(/[\s,]+/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length === 0) return [];
      const valid = parts.filter((p) => allDays.includes(p));
      return valid.length > 0 ? valid : null;
    };

    // Step machine
    switch (onboarding.step) {
      case 0: {
        onboarding.step = 1;
        return (
          `👋 Hi ${context.fromName || user.phone_number}! Welcome to Memorae.\n\n` +
          `I'll set up your preferences. You can type 'skip' to accept defaults.\n\n` +
          `1) What's your name?`
        );
      }
      case 1: {
        if (lower !== "skip" && userInput.trim().length > 0) {
          onboarding.collected.name = userInput.trim();
          await this.userService.updateUserSettings(user.id, {
            name: onboarding.collected.name,
          });
        }
        onboarding.step = 2;
        return (
          `2) What's your timezone? (e.g., Asia/Kolkata, America/New_York)\n` +
          `Type 'skip' to keep ${user.timezone || "UTC"}.`
        );
      }
      case 2: {
        if (lower !== "skip" && userInput.trim().length > 0) {
          onboarding.collected.timezone = userInput.trim();
          await this.userService.updateUserSettings(user.id, {
            timezone: onboarding.collected.timezone,
          });
        }
        onboarding.step = 3;
        return (
          `3) Default reminder time (24h HH:MM).\n` +
          `For example, 09:00. Type 'skip' to keep ${
            user.default_reminder_time || "09:00"
          }.`
        );
      }
      case 3: {
        if (lower !== "skip") {
          if (!timeRegex.test(userInput.trim())) {
            return `Please provide time in HH:MM (24h), e.g., 09:00.`;
          }
          onboarding.collected.defaultReminderTime = userInput.trim();
          await this.userService.updateUserSettings(user.id, {
            defaultReminderTime: onboarding.collected.defaultReminderTime,
          });
        }
        onboarding.step = 4;
        return `4) Enable notifications? (yes/no)\nType 'yes' to receive reminder notifications.`;
      }
      case 4: {
        const enableNotifs = isYes(userInput);
        if (!isYes(userInput) && !isNo(userInput)) {
          return `Please reply 'yes' or 'no' for notifications.`;
        }
        onboarding.collected.notificationEnabled = enableNotifs;
        await this.userService.updateUserSettings(user.id, {
          notificationPreferences: { enabled: enableNotifs },
        });
        onboarding.step = 5;
        return (
          `5) Advance notice before reminders in minutes (e.g., 15).\n` +
          `Type 'skip' to keep ${user.advance_notice_minutes ?? 15}.`
        );
      }
      case 5: {
        if (lower !== "skip") {
          const n = parseInt(userInput.trim(), 10);
          if (isNaN(n) || n < 0 || n > 1440) {
            return `Please enter a number of minutes between 0 and 1440, or 'skip'.`;
          }
          onboarding.collected.advanceNoticeMinutes = n;
          await this.userService.updateUserSettings(user.id, {
            notificationPreferences: {
              enabled:
                onboarding.collected.notificationEnabled ??
                (user as any).notification_enabled ??
                true,
              advanceNotice: n,
            },
          });
        }
        onboarding.step = 6;
        return `6) Set quiet hours (do-not-disturb)? (yes/no)`;
      }
      case 6: {
        if (!isYes(userInput) && !isNo(userInput)) {
          return `Please reply 'yes' or 'no' for quiet hours.`;
        }
        const enabled = isYes(userInput);
        onboarding.collected.quietHoursEnabled = enabled;
        if (!enabled) {
          await this.userService.setQuietHours(
            user.id,
            false,
            "22:00",
            "07:00",
          );
          onboarding.step = 9;
          return `7) Language preference? (2-letter, e.g., en, es, fr)\nType 'skip' to keep ${user.language || "en"}.`;
        }
        onboarding.step = 7;
        return `7) Quiet hours start time (HH:MM), e.g., 22:00`;
      }
      case 7: {
        if (!timeRegex.test(userInput.trim())) {
          return `Please provide time in HH:MM (24h), e.g., 22:00.`;
        }
        onboarding.collected.quietHoursStart = userInput.trim();
        onboarding.step = 8;
        return `8) Quiet hours end time (HH:MM), e.g., 07:00`;
      }
      case 8: {
        if (!timeRegex.test(userInput.trim())) {
          return `Please provide time in HH:MM (24h), e.g., 07:00.`;
        }
        onboarding.collected.quietHoursEnd = userInput.trim();
        onboarding.step = 8.5 as any;
        return `Optional: Quiet days (e.g., weekdays, weekends, all, or comma-separated days like monday,tuesday).\nType 'skip' to apply every day.`;
      }
      case 8.5 as any: {
        let days: string[] | undefined;
        if (lower !== "skip") {
          const parsed = parseDays(userInput);
          if (parsed === null) {
            return `Please provide days as 'weekdays', 'weekends', 'all', or comma-separated day names (e.g., monday,tuesday), or 'skip'.`;
          }
          days = parsed;
        }
        await this.userService.setQuietHours(
          user.id,
          true,
          onboarding.collected.quietHoursStart || "22:00",
          onboarding.collected.quietHoursEnd || "07:00",
          days,
        );
        onboarding.step = 9;
        return `9) Language preference? (2-letter, e.g., en, es, fr)\nType 'skip' to keep ${user.language || "en"}.`;
      }
      case 9: {
        if (lower !== "skip" && /^[a-z]{2}$/i.test(userInput.trim())) {
          onboarding.collected.language = userInput.trim().toLowerCase();
          await this.userService.updateUserSettings(user.id, {
            language: onboarding.collected.language,
          });
        } else if (lower !== "skip") {
          return `Please provide a 2-letter language code (e.g., en, es, fr), or 'skip'.`;
        }

        // Done
        const summary = this.buildOnboardingSummary(onboarding);
        conversationContext.onboarding = undefined;
        return (
          `✅ Setup complete! You're all set.\n\n` +
          summary +
          `\n\nYou can now ask me to create reminders, manage lists, or save notes. Try: "remind me to pay bills at 6pm"`
        );
      }
      default:
        return null;
    }
  }

  /**
   * Build summary of collected onboarding data
   */
  private buildOnboardingSummary(
    onb: NonNullable<ConversationContext["onboarding"]>,
  ): string {
    const c = onb.collected;
    const lines = [
      c.name ? `• Name: ${c.name}` : undefined,
      c.timezone ? `• Timezone: ${c.timezone}` : undefined,
      c.defaultReminderTime
        ? `• Default reminder time: ${c.defaultReminderTime}`
        : undefined,
      c.notificationEnabled !== undefined
        ? `• Notifications: ${c.notificationEnabled ? "enabled" : "disabled"}`
        : undefined,
      c.advanceNoticeMinutes !== undefined
        ? `• Advance notice: ${c.advanceNoticeMinutes} min`
        : undefined,
      c.quietHoursEnabled !== undefined
        ? `• Quiet hours: ${
            c.quietHoursEnabled
              ? `${c.quietHoursStart || "22:00"} - ${c.quietHoursEnd || "07:00"}${
                  c.quietHoursDays && c.quietHoursDays.length
                    ? ` (${c.quietHoursDays.join(", ")})`
                    : ""
                }`
              : "disabled"
          }`
        : undefined,
      c.language ? `• Language: ${c.language}` : undefined,
    ].filter(Boolean);
    return lines.length ? lines.join("\n") : "";
  }
}
