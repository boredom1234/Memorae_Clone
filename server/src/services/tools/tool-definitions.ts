import { UserService } from "../user-service";
import { ReminderService } from "../reminders/reminder.service";
import { ReminderActionsService } from "../reminders/actions.service";
import { ReminderQueryService } from "../reminders/query.service";
import { ListService } from "../list/list.service";
import { ListItemService } from "../list/item.service";
import { ListQueryService } from "../list/query.service";
import { UtilityService } from "../utility-service";
import { NotesService } from "../notes/notes.service";
import { NotesQueryService } from "../notes/query.service";
import { NotificationService } from "../notification-service";
import { MediaAttachmentService } from "../media-attachment-service";
import { ActivityService } from "../activity-service";
import { createReminderAITools } from "./definitions/reminder";
import { createListAITools } from "./definitions/list";
import { createNotesAITools } from "./definitions/notes";
import { createUserAITools } from "./definitions/user";
import { createUtilityAITools } from "./definitions/utility";
import { createNotificationAITools } from "./definitions/notification";
import { createMediaAITools } from "./definitions/media";
import { createActivityAITools } from "./definitions/activity";

export interface ToolServices {
  userService: UserService;
  reminderService: ReminderService;
  reminderActionsService: ReminderActionsService;
  reminderQueryService: ReminderQueryService;
  listService: ListService;
  listItemService: ListItemService;
  listQueryService: ListQueryService;
  utilityService: UtilityService;
  notesService: NotesService;
  notesQueryService: NotesQueryService;
  notificationService: NotificationService;
  mediaService: MediaAttachmentService;
  activityService: ActivityService;
}

export type DedupeFunction = <T>(
  name: string,
  fn: (params: any) => Promise<T>
) => (params: any) => Promise<T>;

export function createAISDKTools(
  userId: string,
  services: ToolServices,
  dedupe: DedupeFunction
) {
  return {
    ...createReminderAITools(userId, services, dedupe),
    ...createListAITools(userId, services, dedupe),
    ...createNotesAITools(userId, services, dedupe),
    ...createUserAITools(userId, services, dedupe),
    ...createUtilityAITools(userId, services, dedupe),
    ...createNotificationAITools(userId, services, dedupe),
    ...createMediaAITools(userId, services, dedupe),
    ...createActivityAITools(userId, services, dedupe),
  };
}