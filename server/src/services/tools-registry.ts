import { UserService } from "./user-service";
import { ReminderService } from "./reminders/reminder.service";
import { ReminderActionsService } from "./reminders/actions.service";
import { ReminderQueryService } from "./reminders/query.service";
import { ListService } from "./list/list.service";
import { ListItemService } from "./list/item.service";
import { ListQueryService } from "./list/query.service";
import { UtilityService } from "./utility-service";
import { NotesService } from "./notes/notes.service";
import { NotesQueryService } from "./notes/query.service";
import { NotificationService } from "./notification-service";
import { MediaAttachmentService } from "./media-attachment-service";
import { ActivityService } from "./activity-service";
import { AppError } from "../utils/errors";
import { createAISDKTools, ToolServices } from "./tools/tool-definitions";
import { createDeduplicationWrapper } from "./tools/tool-deduplication";
import { PendingActionService } from "./pending-action-service";
import { getTools } from "./tool-definitions";
import { executeTool } from "./tool-executor";
import { getRelevantToolGroup, getRelevantTools } from "./tool-selector";
export class ToolsRegistry {
  private userService: UserService;
  private reminderService: ReminderService;
  private reminderActionsService: ReminderActionsService;
  private reminderQueryService: ReminderQueryService;
  private listService: ListService;
  private listItemService: ListItemService;
  private listQueryService: ListQueryService;
  private utilityService: UtilityService;
  private notesService: NotesService;
  private notesQueryService: NotesQueryService;
  private notificationService: NotificationService;
  private mediaService: MediaAttachmentService;
  private activityService: ActivityService;
  private pendingActionService: PendingActionService;
  constructor() {
    this.userService = new UserService();
    this.reminderService = new ReminderService();
    this.reminderActionsService = new ReminderActionsService();
    this.reminderQueryService = new ReminderQueryService();
    this.listService = new ListService();
    this.listItemService = new ListItemService();
    this.listQueryService = new ListQueryService();
    this.utilityService = new UtilityService();
    this.notesService = new NotesService();
    this.notesQueryService = new NotesQueryService();
    this.notificationService = new NotificationService();
    this.mediaService = new MediaAttachmentService();
    this.activityService = new ActivityService();
    this.pendingActionService = new PendingActionService();
  }
  getTools() {
    return getTools(
      this.userService,
      this.reminderService,
      this.reminderActionsService,
      this.reminderQueryService,
      this.listService,
      this.listItemService,
      this.listQueryService,
      this.utilityService,
      this.notesService,
      this.notesQueryService,
      this.notificationService,
      this.mediaService,
      this.activityService,
    );
  }
  async executeTool(toolName: string, params: any): Promise<any> {
    return executeTool(toolName, params, this.getTools.bind(this));
  }
  getUserService() {
    return this.userService;
  }
  getReminderService() {
    return this.reminderService;
  }
  getReminderActionsService() {
    return this.reminderActionsService;
  }
  getReminderQueryService() {
    return this.reminderQueryService;
  }
  getListService() {
    return this.listService;
  }
  getListItemService() {
    return this.listItemService;
  }
  getListQueryService() {
    return this.listQueryService;
  }
  getUtilityService() {
    return this.utilityService;
  }
  getNotesService() {
    return this.notesService;
  }
  getNotesQueryService() {
    return this.notesQueryService;
  }
  getAISDKTools(
    userId: string,
    context?: {
      originalMessage?: string;
      timezone?: string;
    },
  ) {
    const { dedupe, stats } = createDeduplicationWrapper(context);
    const services: ToolServices = {
      userService: this.userService,
      reminderService: this.reminderService,
      reminderActionsService: this.reminderActionsService,
      reminderQueryService: this.reminderQueryService,
      listService: this.listService,
      listItemService: this.listItemService,
      listQueryService: this.listQueryService,
      utilityService: this.utilityService,
      notesService: this.notesService,
      notesQueryService: this.notesQueryService,
      notificationService: this.notificationService,
      mediaService: this.mediaService,
      activityService: this.activityService,
      pendingActionService: this.pendingActionService,
    };
    const toolsObj = createAISDKTools(userId, services, dedupe);
    (toolsObj as any).__stats = stats;
    return toolsObj;
  }
  getToolDefinitions(userId: string): Array<{
    name: string;
    description: string;
  }> {
    const allTools = this.getAISDKTools(userId);
    const definitions = [];
    for (const toolName in allTools) {
      if (toolName === "__stats") continue;
      const tool = allTools[toolName];
      if (tool && tool.description) {
        definitions.push({ name: toolName, description: tool.description });
      }
    }
    return definitions;
  }
  getSingleAISDKTool(
    userId: string,
    toolName: string,
    context?: {
      originalMessage?: string;
      timezone?: string;
    },
  ): any {
    const allTools = this.getAISDKTools(userId, context);
    const selectedTool = allTools[toolName];
    if (!selectedTool) {
      return null;
    }
    const toolSet = {
      [toolName]: selectedTool,
    };
    if ((allTools as any).__stats) {
      (toolSet as any).__stats = (allTools as any).__stats;
    }
    return toolSet;
  }
  getRelevantToolGroup(
    userId: string,
    primaryToolName: string,
    context?: {
      originalMessage?: string;
      timezone?: string;
    },
  ): any {
    return getRelevantToolGroup(
      userId,
      primaryToolName,
      this.getAISDKTools.bind(this),
      context,
    );
  }
  getRelevantTools(userId: string, _text?: string): any {
    return getRelevantTools(userId, this.getAISDKTools.bind(this), _text);
  }
}
