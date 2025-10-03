import { FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "../utils/errors";

/**
 * Sanitize user input to prevent XSS and injection attacks
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== "string") return "";

  return input
    .trim()
    .replace(/[<>]/g, "") // Remove potential HTML tags
    .replace(/javascript:/gi, "") // Remove javascript: protocol
    .replace(/on\w+=/gi, "") // Remove event handlers
    .substring(0, 10000); // Limit length to prevent DoS
}

/**
 * Validate WhatsApp message input
 */
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

/**
 * Validate reminder creation input
 */
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

/**
 * Validate list creation input
 */
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

/**
 * Validate search query input
 */
export const searchSchema = z.object({
  query: z
    .string()
    .min(1, "Search query is required")
    .max(200, "Search query too long")
    .transform(sanitizeInput),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

/**
 * Validate user settings input
 */
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

/**
 * Generic validation middleware factory
 */
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
          "VALIDATION_ERROR",
        );
      }
      throw error;
    }
  };
}

/**
 * Validate query parameters
 */
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
          "VALIDATION_ERROR",
        );
      }
      throw error;
    }
  };
}

/**
 * Rate limiting per user
 */
export const userRateLimit = new Map<
  string,
  { count: number; resetTime: number }
>();

export function rateLimitByUser(
  maxRequests: number = 60,
  windowMs: number = 60000,
) {
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
        "RATE_LIMIT_EXCEEDED",
      );
    }

    userLimit.count++;
  };
}

/**
 * Validate WhatsApp ID format
 */
export function validateWhatsAppId(id: string): boolean {
  const whatsappIdRegex = /^\+?[1-9]\d{1,14}@s\.whatsapp\.net$/;
  return whatsappIdRegex.test(id);
}

/**
 * Validate phone number format
 */
export function validatePhoneNumber(phone: string): boolean {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone);
}

/**
 * Validate ISO datetime string
 */
export function validateDateTime(datetime: string): boolean {
  try {
    const date = new Date(datetime);
    return !isNaN(date.getTime()) && datetime.includes("T");
  } catch {
    return false;
  }
}

/**
 * Validate timezone string
 */
export function validateTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Clean and validate text input for AI processing
 */
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
