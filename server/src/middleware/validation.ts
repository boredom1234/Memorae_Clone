import { FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "../utils/errors";
export function sanitizeInput(input: string): string {
  if (typeof input !== "string") return "";
  return input
    .trim()
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+=/gi, "")
    .substring(0, 10000);
}
export const whatsappMessageSchema = z.object({
  to: z
    .string()
    .min(1, "Recipient is required")
    .regex(/^\+?[1-9]\d{1,14}@s\.whatsapp\.net$/, "Invalid WhatsApp ID format"),
  message: z
    .string()
    .min(1, "Message is required")
    .max(4096, "Message too long")
    .transform(sanitizeInput),
});
export const reminderSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(500, "Title too long")
    .transform(sanitizeInput),
  reminderTime: z.string().datetime("Invalid datetime format"),
  notes: z
    .string()
    .max(2000, "Notes too long")
    .transform(sanitizeInput)
    .optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  isRecurring: z.boolean().optional(),
  recurrenceRule: z
    .string()
    .max(200, "Recurrence rule too long")
    .transform(sanitizeInput)
    .optional(),
});
export const listSchema = z.object({
  name: z
    .string()
    .min(1, "List name is required")
    .max(200, "List name too long")
    .transform(sanitizeInput),
  description: z
    .string()
    .max(1000, "Description too long")
    .transform(sanitizeInput)
    .optional(),
  items: z.array(z.string().max(500).transform(sanitizeInput)).optional(),
});
export const searchSchema = z.object({
  query: z
    .string()
    .min(1, "Search query is required")
    .max(200, "Search query too long")
    .transform(sanitizeInput),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});
export const userSettingsSchema = z.object({
  timezone: z
    .string()
    .max(50, "Timezone too long")
    .regex(/^[A-Za-z_\/]+$/, "Invalid timezone format")
    .optional(),
  language: z
    .string()
    .max(10, "Language code too long")
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Invalid language format")
    .optional(),
  defaultReminderTime: z
    .string()
    .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format")
    .optional(),
  notificationEnabled: z.boolean().optional(),
});
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return async (request: FastifyRequest) => {
    try {
      const validatedData = schema.parse(request.body);
      request.body = validatedData;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors
          .map((err) => `${err.path.join(".")}: ${err.message}`)
          .join(", ");
        throw new AppError(
          `Validation failed: ${errorMessages}`,
          400,
          "VALIDATION_ERROR"
        );
      }
      throw error;
    }
  };
}
export function validateQuery<T>(schema: z.ZodSchema<T>) {
  return async (request: FastifyRequest) => {
    try {
      const validatedData = schema.parse(request.query);
      request.query = validatedData;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors
          .map((err) => `${err.path.join(".")}: ${err.message}`)
          .join(", ");
        throw new AppError(
          `Query validation failed: ${errorMessages}`,
          400,
          "VALIDATION_ERROR"
        );
      }
      throw error;
    }
  };
}
export const userRateLimit = new Map<
  string,
  {
    count: number;
    resetTime: number;
  }
>();
export let rateLimitCleanupInterval: NodeJS.Timeout | null = null;

export function rateLimitByUser(
  maxRequests: number = 60,
  windowMs: number = 60000
) {
  // Start cleanup interval if not already running
  if (!rateLimitCleanupInterval) {
    rateLimitCleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, value] of userRateLimit.entries()) {
        if (now > value.resetTime) {
          userRateLimit.delete(key);
        }
      }
    }, 60000 * 5); // Clean up every 5 minutes
  }

  return async (request: FastifyRequest) => {
    const userId =
      (request.headers["x-user-id"] as string) ||
      (request.body as any)?.userId ||
      request.ip;
    const now = Date.now();
    const userLimit = userRateLimit.get(userId);
    if (!userLimit || now > userLimit.resetTime) {
      userRateLimit.set(userId, { count: 1, resetTime: now + windowMs });
      return;
    }
    if (userLimit.count >= maxRequests) {
      throw new AppError(
        "Rate limit exceeded. Please try again later.",
        429,
        "RATE_LIMIT_EXCEEDED"
      );
    }
    userLimit.count++;
  };
}
export function validateWhatsAppId(id: string): boolean {
  const whatsappIdRegex = /^\+?[1-9]\d{1,14}@s\.whatsapp\.net$/;
  return whatsappIdRegex.test(id);
}
export function validatePhoneNumber(phone: string): boolean {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone);
}
export function validateDateTime(datetime: string): boolean {
  try {
    const date = new Date(datetime);
    return !isNaN(date.getTime()) && datetime.includes("T");
  } catch {
    return false;
  }
}
export function validateTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
export function validateAIInput(text: string): string {
  if (typeof text !== "string") {
    throw new AppError("Input must be a string", 400, "INVALID_INPUT");
  }
  const cleaned = sanitizeInput(text);
  if (cleaned.length === 0) {
    throw new AppError("Input cannot be empty", 400, "EMPTY_INPUT");
  }
  if (cleaned.length > 4000) {
    throw new AppError("Input too long", 400, "INPUT_TOO_LONG");
  }
  return cleaned;
}
export const sendReminderToContactSchema = z.object({
  recipientNumber: z
    .string()
    .min(1, "Recipient number is required")
    .refine(validatePhoneNumber, "Invalid phone number format"),
  reminderText: z
    .string()
    .min(1, "Reminder text is required")
    .max(1000, "Reminder text too long")
    .transform(sanitizeInput),
  reminderTime: z
    .string()
    .refine(validateDateTime, "Invalid datetime format (ISO 8601 required)"),
  recipientName: z.string().max(100).transform(sanitizeInput).optional(),
  fromUserName: z.string().max(100).transform(sanitizeInput).optional(),
});
export const getNotificationHistoryQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  type: z.enum(["reminder", "shared", "all"]).optional(),
});
export const sendCustomMessageSchema = z.object({
  message: z
    .string()
    .min(1, "Message is required")
    .max(4000, "Message too long")
    .transform(sanitizeInput),
  formatting: z.enum(["plain", "markdown"]).optional(),
  buttons: z
    .array(
      z.object({
        id: z.string().min(1).max(64).transform(sanitizeInput),
        label: z.string().min(1).max(100).transform(sanitizeInput),
      })
    )
    .optional(),
});
