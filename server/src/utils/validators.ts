import { z } from 'zod';
import { ValidationError } from './errors';

// Common validators
export const uuidSchema = z.string().uuid('Invalid UUID format');
export const nonEmptyStringSchema = z.string().min(1, 'Cannot be empty').max(500, 'Too long');
export const dateStringSchema = z.string().datetime('Invalid ISO 8601 date format');
export const timezoneSchema = z.string().min(1, 'Timezone is required');
export const prioritySchema = z.enum(['low', 'medium', 'high']);
export const statusSchema = z.enum(['pending', 'completed', 'cancelled', 'snoozed']);

// Reminder validation schemas
export const createReminderSchema = z.object({
  userId: uuidSchema,
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  reminderTime: dateStringSchema,
  timezone: timezoneSchema,
  isRecurring: z.boolean(),
  recurrenceRule: z.string().optional(),
  notes: z.string().max(2000, 'Notes too long').optional(),
  priority: prioritySchema.optional().default('medium'),
}).refine(
  (data) => {
    const reminderDate = new Date(data.reminderTime);
    return reminderDate > new Date();
  },
  { message: 'Reminder time must be in the future', path: ['reminderTime'] }
).refine(
  (data) => {
    if (data.isRecurring && !data.recurrenceRule) {
      return false;
    }
    return true;
  },
  { message: 'Recurrence rule is required for recurring reminders', path: ['recurrenceRule'] }
);

export const updateReminderSchema = z.object({
  reminderId: uuidSchema,
  title: z.string().min(1).max(200).optional(),
  reminderTime: dateStringSchema.optional(),
  isRecurring: z.boolean().optional(),
  recurrenceRule: z.string().optional(),
  notes: z.string().max(2000).optional(),
  priority: prioritySchema.optional(),
});

export const deleteReminderSchema = z.object({
  userId: uuidSchema,
  reminderId: uuidSchema.optional(),
  searchQuery: z.string().min(1).max(100).optional(),
}).refine(
  (data) => data.reminderId || data.searchQuery,
  { message: 'Either reminderId or searchQuery must be provided' }
);

export const listRemindersSchema = z.object({
  userId: uuidSchema,
  status: z.enum(['pending', 'completed', 'all']).optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
  sortBy: z.enum(['time', 'priority', 'created']).optional().default('time'),
});

export const snoozeReminderSchema = z.object({
  reminderId: uuidSchema,
  snoozeUntil: dateStringSchema,
  snoozeDuration: z.number().int().min(1).optional(),
}).refine(
  (data) => new Date(data.snoozeUntil) > new Date(),
  { message: 'Snooze time must be in the future', path: ['snoozeUntil'] }
);

export const completeReminderSchema = z.object({
  reminderId: uuidSchema,
});

export const searchRemindersSchema = z.object({
  userId: uuidSchema,
  query: z.string().min(1, 'Search query is required').max(200),
  filters: z.object({
    dateRange: z.object({
      start: dateStringSchema,
      end: dateStringSchema,
    }).optional(),
    priority: prioritySchema.optional(),
    status: z.enum(['pending', 'completed']).optional(),
  }).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export const getUpcomingRemindersSchema = z.object({
  userId: uuidSchema,
  timeframe: z.enum(['today', 'tomorrow', 'week', 'month']),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

export const batchCreateRemindersSchema = z.object({
  userId: uuidSchema,
  reminders: z.array(
    z.object({
      title: z.string().min(1).max(200),
      reminderTime: dateStringSchema,
      isRecurring: z.boolean().optional().default(false),
      recurrenceRule: z.string().optional(),
    })
  ).min(1, 'At least one reminder is required').max(50, 'Maximum 50 reminders per batch'),
});

// List validation schemas
export const createListSchema = z.object({
  userId: uuidSchema,
  name: z.string().min(1, 'List name is required').max(100, 'List name too long'),
  description: z.string().max(500).optional(),
  items: z.array(z.string().min(1).max(500)).max(100).optional(),
});

export const addItemToListSchema = z.object({
  userId: uuidSchema,
  listId: uuidSchema.optional(),
  listName: z.string().min(1).max(100).optional(),
  items: z.array(z.string().min(1, 'Item cannot be empty').max(500, 'Item too long')).min(1, 'At least one item required').max(50, 'Maximum 50 items at once'),
}).refine(
  (data) => data.listId || data.listName,
  { message: 'Either listId or listName must be provided' }
);

export const removeItemFromListSchema = z.object({
  userId: uuidSchema,
  listId: uuidSchema.optional(),
  listName: z.string().min(1).max(100).optional(),
  itemIds: z.array(uuidSchema).optional(),
  itemText: z.string().min(1).max(500).optional(),
}).refine(
  (data) => data.itemIds || data.itemText,
  { message: 'Either itemIds or itemText must be provided' }
);

export const updateListItemSchema = z.object({
  itemId: uuidSchema,
  newContent: z.string().min(1).max(500).optional(),
  isCompleted: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

export const getListsSchema = z.object({
  userId: uuidSchema,
  includeItems: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(100).optional().default(50),
});

export const getListItemsSchema = z.object({
  userId: uuidSchema,
  listId: uuidSchema.optional(),
  listName: z.string().min(1).max(100).optional(),
  includeCompleted: z.boolean().optional().default(false),
}).refine(
  (data) => data.listId || data.listName,
  { message: 'Either listId or listName must be provided' }
);

export const deleteListSchema = z.object({
  userId: uuidSchema,
  listId: uuidSchema.optional(),
  listName: z.string().min(1).max(100).optional(),
}).refine(
  (data) => data.listId || data.listName,
  { message: 'Either listId or listName must be provided' }
);

export const searchListsSchema = z.object({
  userId: uuidSchema,
  query: z.string().min(1, 'Search query is required').max(200),
  searchIn: z.enum(['list-names', 'items', 'both']).optional().default('both'),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

// User settings validation schemas
export const updateUserSettingsSchema = z.object({
  userId: uuidSchema,
  timezone: z.string().optional(),
  language: z.string().length(2).optional(),
  defaultReminderTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)').optional(),
  notificationPreferences: z.object({
    enabled: z.boolean(),
    advanceNotice: z.number().int().min(0).max(1440).optional(),
  }).optional(),
});

export const getUserSettingsSchema = z.object({
  userId: uuidSchema,
});

export const setQuietHoursSchema = z.object({
  userId: uuidSchema,
  enabled: z.boolean(),
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
  endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
  days: z.array(z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])).optional(),
});

// Utility validation schemas
export const parseNaturalLanguageDateSchema = z.object({
  text: z.string().min(1, 'Text is required').max(500),
  timezone: timezoneSchema,
  referenceDate: dateStringSchema.optional(),
});

export const detectIntentSchema = z.object({
  message: z.string().min(1, 'Message is required').max(1000),
  conversationContext: z.array(z.string()).max(10).optional(),
});

export const suggestReminderTimeSchema = z.object({
  taskDescription: z.string().min(1).max(500),
  userSchedule: z.array(
    z.object({
      startTime: dateStringSchema,
      endTime: dateStringSchema,
    })
  ).optional(),
});

// Validation helper function
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      throw new ValidationError('Validation failed', { errors });
    }
    throw error;
  }
}

// Sanitize string to prevent SQL injection
export function sanitizeString(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&').trim();
}
