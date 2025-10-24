
import { tool } from "ai";
import { z } from "zod";
import {
  DedupeFunction,
  ToolServices,
} from "../tool-definitions";

export function createUserAITools(
  userId: string,
  services: ToolServices,
  dedupe: DedupeFunction
) {
  const { userService } = services;

  return {
    getUserSettings: tool({
      description:
        "Get user profile/settings (name, timezone, language, notifications). Triggers: my settings, who am I, my name.",
      inputSchema: z.object({}),
      execute: dedupe("getUserSettings", async () => {
        return await userService.getUserSettings(userId);
      }),
    }),
    updateUserSettings: tool({
      description:
        "Update settings (name, timezone, language, notifications, quiet hours). Triggers: change, set, update, configure.",
      inputSchema: z.object({
        name: z
          .string()
          .min(1)
          .max(255)
          .optional()
          .describe("User's display name"),
        timezone: z
          .string()
          .optional()
          .describe(
            'Timezone (e.g., "America/New_York", "UTC", "Asia/Kolkata")'
          ),
        language: z
          .string()
          .length(2)
          .optional()
          .describe('Language code (e.g., "en", "es", "fr")'),
        defaultReminderTime: z
          .string()
          .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
          .optional()
          .describe('Default reminder time in HH:MM format (e.g., "09:00")'),
        notificationEnabled: z
          .boolean()
          .optional()
          .describe("Enable or disable notifications"),
        advanceNoticeMinutes: z
          .number()
          .int()
          .min(0)
          .max(1440)
          .optional()
          .describe("Advance notice in minutes (0-1440)"),
        quietHoursEnabled: z
          .boolean()
          .optional()
          .describe("Enable or disable quiet hours"),
        quietHoursStart: z
          .string()
          .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
          .nullable()
          .optional()
          .describe(
            'Quiet hours start time in HH:MM (e.g., "22:00"). Set to null to clear.'
          ),
        quietHoursEnd: z
          .string()
          .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
          .nullable()
          .optional()
          .describe(
            'Quiet hours end time in HH:MM (e.g., "07:00"). Set to null to clear.'
          ),
        quietHoursDays: z
          .array(
            z.enum([
              "monday",
              "tuesday",
              "wednesday",
              "thursday",
              "friday",
              "saturday",
              "sunday",
            ])
          )
          .nullable()
          .optional()
          .describe(
            'Days for quiet hours (e.g., ["monday", "tuesday"]). Set to null to clear.'
          ),
      }),
      execute: dedupe("updateUserSettings", async (params) => {
        return await userService.updateUserSettings(userId, params);
      }),
    }),
    setQuietHours: tool({
      description:
        "Set do-not-disturb windows. Triggers: quiet hours, do not disturb, DND, silent hours.",
      inputSchema: z.object({
        enabled: z.boolean().describe("Enable or disable quiet hours"),
        startTime: z
          .string()
          .optional()
          .describe('Start time in HH:MM format (e.g., "22:00")'),
        endTime: z
          .string()
          .optional()
          .describe('End time in HH:MM format (e.g., "07:00")'),
        days: z
          .array(z.string())
          .optional()
          .describe('Days of week (e.g., ["monday", "tuesday"])'),
      }),
      execute: dedupe("setQuietHours", async (params) => {
        return await userService.setQuietHours(
          userId,
          params.enabled,
          params.startTime || "22:00",
          params.endTime || "07:00",
          params.days
        );
      }),
    }),
  };
}
