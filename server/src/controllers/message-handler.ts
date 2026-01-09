import { MessageContext } from "../services/whatsapp";
import { ToolsRegistry } from "../services/tools-registry";
import { AIService } from "../services/ai-service";
import { OCRService } from "../services/ocr-service";
import { MediaAttachmentService } from "../services/media-attachment-service";
import { MessageBatchService } from "../services/message-batch-service";
import { User } from "../models/types";
import {
  ConversationMessage,
  ConversationContext,
} from "../types/conversation";
import pino from "pino";
import { validateAIInput } from "../middleware/validation";
import { OnboardingHandler } from "./handlers/onboarding-handler";
import { ResponseFormatter } from "./handlers/response-formatter";
import { MediaHandler } from "./handlers/media-handler";
import { formatInZone } from "../utils/time-utils";
export class MessageController {
  private logger = pino({ level: "info" });
  private tools: ToolsRegistry;
  private aiService: AIService;
  private ocrService: OCRService;
  private mediaService: MediaAttachmentService;
  private messageBatchService: MessageBatchService;
  private userCache: Map<string, User> = new Map();
  private userNewCache: Map<string, boolean> = new Map();
  private userCreationLocks: Map<
    string,
    Promise<{ user: User; isNew: boolean }>
  > = new Map();
  private conversationContexts: Map<string, ConversationContext> = new Map();
  private cacheCleanupInterval: NodeJS.Timeout;
  private contextCleanupInterval: NodeJS.Timeout;
  private onboardingHandler: OnboardingHandler;
  private responseFormatter: ResponseFormatter;
  private mediaHandler: MediaHandler;
  constructor() {
    this.tools = new ToolsRegistry();
    this.aiService = new AIService();
    this.ocrService = new OCRService();
    this.mediaService = new MediaAttachmentService();
    this.messageBatchService = new MessageBatchService();
    this.onboardingHandler = new OnboardingHandler(this.tools.getUserService());
    this.responseFormatter = new ResponseFormatter();
    this.mediaHandler = new MediaHandler(
      this.ocrService,
      this.mediaService,
      this.aiService,
      this.tools
    );
    this.cacheCleanupInterval = setInterval(() => {
      this.cleanupUserCache();
    }, 30 * 60 * 1000);
    this.contextCleanupInterval = setInterval(() => {
      this.cleanupConversationContexts();
    }, 15 * 60 * 1000);
  }
  async handleMessage(context: MessageContext): Promise<any> {
    try {
      const { fromName, messageType } = context;
      this.logger.info(`Processing message from ${fromName}`);
      const { user, isNew } = await this.ensureUser(context);
      switch (messageType) {
        case "text":
          return await this.handleTextMessage(context, user, isNew);
        case "image":
          return await this.handleImageMessage(context, user);
        case "audio":
        case "voice":
          return await this.handleAudioMessage(context, user);
        default:
          this.logger.info(`Unsupported message type: ${messageType}`);
          return null;
      }
    } catch (error) {
      this.logger.error({ error }, "Error in message controller");
      throw error;
    }
  }
  private async ensureUser(context: MessageContext): Promise<{
    user: User;
    isNew: boolean;
  }> {
    if (this.userCache.has(context.from)) {
      const cachedUser = this.userCache.get(context.from)!;
      (cachedUser as any).lastAccessed = Date.now();
      const cachedIsNew = this.userNewCache.get(context.from) || false;
      return { user: cachedUser, isNew: cachedIsNew };
    }

    // Check if creation is already in progress for this user
    if (this.userCreationLocks.has(context.from)) {
      return this.userCreationLocks.get(context.from)!;
    }

    const creationPromise = (async () => {
      try {
        const userService = this.tools.getUserService();
        let user: User;
        let isNew: boolean;
        if (context.from.includes("@")) {
          const phoneNumber = "+" + context.from.split("@")[0];
          const result = await userService.findOrCreateUser(
            context.from,
            phoneNumber,
            context.fromName
          );
          user = result.user;
          isNew = result.isNew;
        } else {
          const result = await userService.findOrCreateTelegramUser(
            context.from,
            context.fromName
          );
          user = result.user;
          isNew = result.isNew;
        }
        (user as any).lastAccessed = Date.now();
        this.userCache.set(context.from, user);
        this.userNewCache.set(context.from, isNew);
        this.logger.info(`User ensured: ${user.name} (${user.id})`);
        return { user, isNew };
      } finally {
        this.userCreationLocks.delete(context.from);
      }
    })();

    this.userCreationLocks.set(context.from, creationPromise);
    return creationPromise;
  }
  private cleanupUserCache(): void {
    const now = Date.now();
    const maxAge = 2 * 60 * 60 * 1000;
    let cleanedCount = 0;
    for (const [key, user] of this.userCache.entries()) {
      const lastAccessed = (user as any).lastAccessed || 0;
      if (now - lastAccessed > maxAge) {
        this.userCache.delete(key);
        cleanedCount++;
      }
    }
    if (cleanedCount > 0) {
      this.logger.info(
        `Cleaned ${cleanedCount} entries from user cache. Cache size: ${this.userCache.size}`
      );
    }
  }
  private cleanupConversationContexts(): void {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000;
    let cleanedCount = 0;
    for (const [userId, context] of this.conversationContexts.entries()) {
      if (now - context.lastActivity.getTime() > maxAge) {
        this.conversationContexts.delete(userId);
        cleanedCount++;
      }
    }
    if (cleanedCount > 0) {
      this.logger.info(
        `Cleaned ${cleanedCount} conversation contexts. Active contexts: ${this.conversationContexts.size}`
      );
    }
  }
  private getConversationContext(userId: string): ConversationContext {
    if (!this.conversationContexts.has(userId)) {
      const maxMessagesEnv =
        process.env.MAX_CONTEXT_MESSAGES ||
        process.env.CHAT_HISTORY_MAX_MESSAGES ||
        process.env.MEMORAE_MAX_CONTEXT;
      const computedMax = Math.max(
        10,
        Math.min(100, parseInt(maxMessagesEnv || "40", 10))
      );
      this.conversationContexts.set(userId, {
        userId,
        messages: [],
        lastActivity: new Date(),
        maxMessages: computedMax,
      });
    }
    const context = this.conversationContexts.get(userId)!;
    context.lastActivity = new Date();
    return context;
  }
  private addToConversationContext(
    userId: string,
    message: ConversationMessage
  ): void {
    const context = this.getConversationContext(userId);
    context.messages.push(message);
    if (context.messages.length > context.maxMessages) {
      const overflow = context.messages.length - context.maxMessages;
      const dropped = context.messages.slice(0, overflow);
      context.summary = this.mergeSummary(context.summary, dropped);
      context.messages = context.messages.slice(-context.maxMessages);
    }
    context.lastActivity = new Date();
  }
  private mergeSummary(
    existing: string | undefined,
    dropped: ConversationMessage[]
  ): string {
    try {
      const lines = dropped.map((m) => {
        const role = m.role === "user" ? "User" : "Assistant";
        let content = (m.content || "").replace(/\s+/g, " ").trim();
        if (content.length > 160) content = content.slice(0, 160) + "…";
        return `- ${role}: ${content}`;
      });
      const newSummary = lines.join("\n");
      const combined = (existing ? existing + "\n" : "") + newSummary;
      const maxChars = 4000;
      if (combined.length > maxChars) {
        return combined.slice(combined.length - maxChars);
      }
      return combined;
    } catch {
      return existing || "";
    }
  }
  cleanup(): void {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
    }
    if (this.contextCleanupInterval) {
      clearInterval(this.contextCleanupInterval);
    }
    this.userCache.clear();
    this.conversationContexts.clear();
    this.messageBatchService.cleanup();
  }
  private async handleTextMessage(
    context: MessageContext,
    user: User,
    isNew?: boolean
  ): Promise<any> {
    const { text } = context;
    if (!text) return null;
    let validatedText: string;
    try {
      validatedText = validateAIInput(text);
    } catch (error) {
      this.logger.warn(`Invalid input from ${user.name}: ${error}`);
      return {
        text: "Sorry, I couldn't process your message. Please try rephrasing it.",
      };
    }
    this.logger.info(`Text message: \"${validatedText}\"`);
    const conversationContext = this.getConversationContext(user.id);
    const lowerText = validatedText.toLowerCase().trim();
    const parseSelection = (text: string): number | null => {
      const lower = text.toLowerCase().trim();
      if (/^\d+$/.test(text)) return parseInt(text, 10);
      const ordinalMap: Record<string, number> = {
        first: 1,
        "1st": 1,
        one: 1,
        a: 1,
        second: 2,
        "2nd": 2,
        two: 2,
        b: 2,
        third: 3,
        "3rd": 3,
        three: 3,
        c: 3,
        fourth: 4,
        "4th": 4,
        four: 4,
        d: 4,
        fifth: 5,
        "5th": 5,
        five: 5,
        e: 5,
      };
      if (ordinalMap[lower]) return ordinalMap[lower];
      const normalized = lower
        .replace(
          /^(the|option|number|choice|select|pick|choose|it's|its)\s+/gi,
          ""
        )
        .replace(/\s+(one|option|choice|please|pls)$/gi, "")
        .replace(/^(i want|i choose|i pick|i select)\s+/gi, "")
        .trim();
      if (ordinalMap[normalized]) return ordinalMap[normalized];
      const match = normalized.match(
        /^(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|\d+)/i
      );
      if (match) {
        const key = match[1].toLowerCase();
        if (ordinalMap[key]) return ordinalMap[key];
        if (/^\d+$/.test(key)) return parseInt(key, 10);
      }
      return null;
    };
    const selection = parseSelection(validatedText.trim());
    if (selection !== null) {
      if (
        conversationContext.candidateItems &&
        conversationContext.candidateItems.length > 0
      ) {
        const selected = conversationContext.candidateItems.find(
          (c) =>
            c.id === String(selection) ||
            conversationContext.candidateItems!.indexOf(c) === selection - 1
        );
        if (selected) {
          this.logger.info(
            `User selected item ${selection}: ${selected.title}`
          );
          try {
            const pending = conversationContext.pendingAction;
            conversationContext.candidateItems = undefined;
            if (pending && selected.id) {
              const toolName =
                (pending.params && pending.params.toolName) || "";
              const toolArgs = (pending.params && pending.params.args) || {};
              let result: any = null;
              if (toolName === "updateReminder") {
                let finalTime: string | undefined = toolArgs.reminderTime;
                if (!finalTime && toolArgs.naturalTimeText) {
                  try {
                    const util = this.tools.getUtilityService();
                    const parsed = util.parseNaturalLanguageDate({
                      text: toolArgs.naturalTimeText,
                      timezone: user.timezone,
                    });
                    const best = util.pickBestDate(parsed.extractedDates);
                    if (best) finalTime = best;
                    if (best) finalTime = best;
                  } catch (err) {
                    this.logger.warn(
                      { err },
                      "Failed to parse natural language date in updateReminder"
                    );
                  }
                }
                if (!finalTime && (toolArgs.title || toolArgs.priority)) {
                }
                result = await this.tools.executeTool("updateReminder", {
                  userId: user.id,
                  reminderId: selected.id,
                  title: toolArgs.title,
                  reminderTime: finalTime,
                  priority: toolArgs.priority,
                });
              } else if (toolName === "deleteReminder") {
                result = await this.tools.executeTool("deleteReminder", {
                  userId: user.id,
                  reminderId: selected.id,
                });
              } else if (toolName === "snoozeReminder") {
                let snoozeUntil: string | undefined = toolArgs.snoozeUntil;
                if (!snoozeUntil && toolArgs.naturalTimeText) {
                  try {
                    const util = this.tools.getUtilityService();
                    const parsed = util.parseNaturalLanguageDate({
                      text: toolArgs.naturalTimeText,
                      timezone: user.timezone,
                    });
                    const best = util.pickBestDate(parsed.extractedDates);
                    if (best) snoozeUntil = best;
                    if (best) snoozeUntil = best;
                  } catch (err) {
                    this.logger.warn(
                      { err },
                      "Failed to parse natural language date in snoozeReminder"
                    );
                  }
                }
                if (!snoozeUntil) {
                  return {
                    text: "When should I snooze it until? Please specify a time.",
                  };
                }
                result = await this.tools.executeTool("snoozeReminder", {
                  userId: user.id,
                  reminderId: selected.id,
                  snoozeUntil,
                });
              } else if (toolName === "completeReminder") {
                result = await this.tools.executeTool("completeReminder", {
                  userId: user.id,
                  reminderId: selected.id,
                });
              } else {
                result = { text: `Selected ${selected.title}.` };
              }
              conversationContext.pendingAction = undefined;
              const rendered = this.responseFormatter.getResponseMessage(
                result,
                user.timezone
              );
              if (rendered) {
                this.addToConversationContext(user.id, {
                  role: "assistant",
                  content: rendered,
                  timestamp: new Date(),
                });
              }
              return { text: rendered };
            }
          } catch (e) {
            this.logger.error(
              { error: e },
              "Failed to execute pending action after selection"
            );
            return {
              text: "Sorry, I couldn't complete that action after your selection.",
            };
          }
        }
      }
    }
    if (
      /^(yes|y|yup|yeah|confirm|ok|correct|right|sure|exactly)$/i.test(
        lowerText
      )
    ) {
      const recentMessages = conversationContext.messages.slice(-4);
      const lastAssistantMessage = recentMessages
        .reverse()
        .find((m) => m.role === "assistant");
      if (
        lastAssistantMessage &&
        /just to confirm|would you like me to update|correct\?/i.test(
          lastAssistantMessage.content
        )
      ) {
        const reminderUpdateContext = recentMessages.find((m) =>
          /update.*reminder|change.*time|10\.?30.*pm/i.test(m.content)
        );
        if (reminderUpdateContext) {
          this.logger.info(
            "Detected confirmation for reminder update from context"
          );
          try {
            const takeMemsMatch = recentMessages.find((m) =>
              /take meds/i.test(m.content)
            );
            const timeMatch = recentMessages.find((m) =>
              /10\.?30.*pm/i.test(m.content)
            );
            if (takeMemsMatch && timeMatch) {
              const search = await this.tools.executeTool("searchReminders", {
                userId: user.id,
                query: "Take Meds",
                limit: 5,
              });
              const candidates: any[] = search?.results || [];
              const target = candidates[0];
              if (!target?.id) {
                return {
                  text: "I couldn't find the 'Take Meds' reminder to update. Could you specify the exact title?",
                };
              }
              const util = this.tools.getUtilityService();
              const parsed = util.parseNaturalLanguageDate({
                text: "10:30 PM",
                timezone: user.timezone,
              });
              const best = util.pickBestDate(parsed.extractedDates);
              if (!best) {
                return {
                  text: "I couldn't understand the new time. Please provide a time like 10:30 PM.",
                };
              }
              const result = await this.tools.executeTool("updateReminder", {
                userId: user.id,
                reminderId: target.id,
                reminderTime: best,
              });
              const rendered = this.responseFormatter.getResponseMessage(
                result,
                user.timezone
              );
              if (rendered) {
                this.addToConversationContext(user.id, {
                  role: "assistant",
                  content: rendered,
                  timestamp: new Date(),
                });
              }
              return { text: rendered };
            }
          } catch (e) {
            this.logger.error(
              { error: e },
              "Failed to execute context-detected update"
            );
            return {
              text: "Sorry, I couldn't update that reminder. Could you try again?",
            };
          }
        }
      }
    }
    if (
      /^\d+[:.]\d+\s*(am|pm)(?:\s*(?:sorry|correction|actually|instead))?$/i.test(
        validatedText.trim()
      )
    ) {
      const recentMessages = conversationContext.messages.slice(-6);
      const recentReminderCreation = recentMessages.find((m) =>
        /reminder.*created|created.*reminder|remind.*everyday|everyday.*remind/i.test(
          m.content
        )
      );
      if (recentReminderCreation) {
        this.logger.info("Detected time correction for recent reminder");
        const reminderNameMatch = recentMessages.find((m) =>
          /take meds|meds/i.test(m.content)
        );
        const timeMatch = validatedText.match(/(\d+[:.]\d+\s*(?:am|pm))/i);
        if (reminderNameMatch && timeMatch) {
          const newTime = timeMatch[1];
          this.logger.info(`Updating reminder time to: ${newTime}`);
          conversationContext.needsConfirmation = {
            action: "updateReminder",
            summary: `Update "Take Meds" reminder time to ${newTime}`,
            targetId: "Take Meds",
            timestamp: new Date(),
          };
          const confirmMessage = `Just to confirm, you'd like me to update the "Take Meds" reminder to be every day at ${newTime} instead of 10 PM, correct?`;
          this.addToConversationContext(user.id, {
            role: "assistant",
            content: confirmMessage,
            timestamp: new Date(),
          });
          return { text: confirmMessage };
        }
      }
    }
    if (
      conversationContext.needsConfirmation &&
      /^(yes|y|yup|yeah|confirm|ok|correct|right|sure|exactly)$/i.test(
        lowerText
      )
    ) {
      this.logger.info(
        `User confirmed action: ${conversationContext.needsConfirmation.action}`
      );
      try {
        const action = conversationContext.needsConfirmation.action;
        const targetId = conversationContext.needsConfirmation.targetId;
        let result: any = null;
        if (action === "deleteReminder") {
          let reminderId = targetId;
          if (!/^[0-9a-f-]{6,}$/i.test(targetId || "")) {
            const search = await this.tools.executeTool("searchReminders", {
              userId: user.id,
              query: targetId,
              limit: 5,
            });
            reminderId = (search?.results || [])[0]?.id;
          }
          if (!reminderId) {
            return { text: "I couldn't find that reminder to delete." };
          }
          result = await this.tools.executeTool("deleteReminder", {
            userId: user.id,
            reminderId,
          });
        } else if (action === "updateReminder") {
          const summaryMatch =
            conversationContext.needsConfirmation.summary.match(
              /(\d+[:.]\d+\s*(?:am|pm))/i
            );
          const newTime = summaryMatch ? summaryMatch[1] : "10:30 PM";
          let reminderId = targetId;
          if (!/^[0-9a-f-]{6,}$/i.test(targetId || "")) {
            const search = await this.tools.executeTool("searchReminders", {
              userId: user.id,
              query: targetId,
              limit: 5,
            });
            reminderId = (search?.results || [])[0]?.id;
          }
          if (!reminderId) {
            return { text: "I couldn't find that reminder to update." };
          }
          const util = this.tools.getUtilityService();
          const parsed = util.parseNaturalLanguageDate({
            text: newTime,
            timezone: user.timezone,
          });
          const best = util.pickBestDate(parsed.extractedDates);
          if (!best) {
            return {
              text: "I couldn't understand the time to update. Please provide a clear time.",
            };
          }
          result = await this.tools.executeTool("updateReminder", {
            userId: user.id,
            reminderId,
            reminderTime: best,
          });
        } else if (action === "snoozeReminder") {
          const timeMatch = conversationContext.needsConfirmation.summary.match(
            /(\d+[:.]\d+\s*(?:am|pm)|in\s+\d+\s+(?:minutes?|hours?|days?))/i
          );
          let snoozeText = timeMatch ? timeMatch[1] : undefined;
          let reminderId = targetId;
          if (!/^[0-9a-f-]{6,}$/i.test(targetId || "")) {
            const search = await this.tools.executeTool("searchReminders", {
              userId: user.id,
              query: targetId,
              limit: 5,
            });
            reminderId = (search?.results || [])[0]?.id;
          }
          if (!reminderId) {
            return { text: "I couldn't find that reminder to snooze." };
          }
          if (!snoozeText) {
            return {
              text: "When should I snooze it until? Please specify a time.",
            };
          }
          const util = this.tools.getUtilityService();
          const parsed = util.parseNaturalLanguageDate({
            text: snoozeText,
            timezone: user.timezone,
          });
          const best = util.pickBestDate(parsed.extractedDates);
          if (!best) {
            return {
              text: "I couldn't understand the snooze time. Please provide a clear time.",
            };
          }
          result = await this.tools.executeTool("snoozeReminder", {
            userId: user.id,
            reminderId,
            snoozeUntil: best,
          });
        } else {
          result = { text: "Action confirmed." };
        }
        conversationContext.needsConfirmation = undefined;
        const rendered = this.responseFormatter.getResponseMessage(
          result,
          user.timezone
        );
        if (rendered) {
          this.addToConversationContext(user.id, {
            role: "assistant",
            content: rendered,
            timestamp: new Date(),
          });
        }
        return { text: rendered };
      } catch (e) {
        this.logger.error({ error: e }, "Failed to execute confirmed action");
        conversationContext.needsConfirmation = undefined;
        return { text: "Sorry, I couldn't complete the confirmed action." };
      }
    } else if (
      conversationContext.needsConfirmation &&
      /^(no|n|cancel|nope)$/i.test(lowerText)
    ) {
      this.logger.info(
        `User cancelled action: ${conversationContext.needsConfirmation.action}`
      );
      conversationContext.needsConfirmation = undefined;
      return {
        text: "Okay, I've cancelled that action.",
      };
    }
    if (isNew || conversationContext.onboarding) {
      const onboardingResult =
        await this.onboardingHandler.handleOnboardingFlow(
          context,
          user,
          validatedText,
          conversationContext
        );
      if (onboardingResult) {
        if (conversationContext.onboarding === undefined) {
          this.userNewCache.set(context.from, false);
        }
        return { text: onboardingResult };
      }
    }
    this.addToConversationContext(user.id, {
      role: "user",
      content: validatedText,
      timestamp: new Date(),
      messageId: context.messageId,
    });
    this.logger.info(
      `Conversation history: ${conversationContext.messages.length} messages`
    );
    let effectiveMessages = conversationContext.messages;
    if (
      conversationContext.candidateItems &&
      conversationContext.candidateItems.length > 0
    ) {
      const seemsLikeSelection =
        validatedText.length < 50 &&
        (/^(the\s+)?(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|one|two|three|four|five|that|this|it)\b/i.test(
          validatedText
        ) ||
          validatedText.split(/\s+/).length <= 5);
      if (seemsLikeSelection) {
        const selectionContext = `[SYSTEM CONTEXT: The user is currently selecting from ${
          conversationContext.candidateItems.length
        } options: ${conversationContext.candidateItems
          .map((c, i) => `${i + 1}. ${c.title}`)
          .join(
            ", "
          )}. Their response "${validatedText}" should be interpreted as a selection. If you cannot determine which option, ask them to choose by number (1, 2, etc.).]`;
        effectiveMessages = [
          ...conversationContext.messages,
          {
            role: "assistant" as const,
            content: selectionContext,
            timestamp: new Date(),
          },
        ];
      } else {
        this.logger.info(
          "User message does not seem like a selection while candidates are pending. Clearing candidates."
        );
        conversationContext.candidateItems = undefined;
        conversationContext.pendingAction = undefined;
      }
    }
    try {
      const result = await this.aiService.processMessage(
        validatedText,
        user.id,
        user.timezone,
        this.tools,
        effectiveMessages,
        conversationContext.summary
      );
      this.logger.info(`AI response: ${result.text}`);
      this.logger.info(`Tool calls: ${result.toolCalls.length}`);
      this.logger.info(`Tool results: ${result.toolResults?.length || 0}`);
      if (Array.isArray(result.toolResults)) {
        try {
          const toolResultShapes = result.toolResults.map(
            (r: any, idx: number) => ({
              index: idx,
              toolName: r?.toolName,
              keys: r && typeof r === "object" ? Object.keys(r) : null,
            })
          );
          this.logger.info({ toolResultShapes }, "Tool result shapes");
        } catch {}
      }
      const lastToolEnvelope =
        result.toolResults && result.toolResults.length > 0
          ? result.toolResults[result.toolResults.length - 1]
          : null;
      const lastToolResult =
        lastToolEnvelope &&
        typeof lastToolEnvelope === "object" &&
        "result" in lastToolEnvelope
          ? (lastToolEnvelope as any).result
          : lastToolEnvelope
          ? (lastToolEnvelope as any).output || lastToolEnvelope
          : null;
      this.logger.info(
        {
          toolName: (lastToolEnvelope as any)?.toolName,
          envelopeKeys:
            lastToolEnvelope && typeof lastToolEnvelope === "object"
              ? Object.keys(lastToolEnvelope as any)
              : null,
          hasInnerResult: !!(
            lastToolEnvelope &&
            typeof lastToolEnvelope === "object" &&
            (lastToolEnvelope as any).result
          ),
        },
        "Tool result envelope summary"
      );
      if (lastToolResult?.needsSelection && lastToolResult.candidates) {
        conversationContext.candidateItems = lastToolResult.candidates.map(
          (c: any) => ({
            id: c.id,
            title: c.title,
            description: c.time,
            type: c.type || "reminder",
          })
        );
        try {
          const toolName = (lastToolEnvelope as any)?.toolName;
          const args = (lastToolEnvelope as any)?.args;
          let type: "delete" | "update" | "complete" | "snooze" = "update";
          if (toolName === "deleteReminder") type = "delete";
          else if (toolName === "snoozeReminder") type = "snooze";
          else if (toolName === "completeReminder") type = "complete";
          conversationContext.pendingAction = {
            type,
            targetType: "reminder",
            params: { toolName, args },
            timestamp: new Date(),
          } as any;
        } catch (err) {
          this.logger.warn(
            { err },
            "Error extracting pending action from tool result"
          );
        }
        const selectionMessage = `${
          lastToolResult.message
        }\n\n${lastToolResult.candidates
          .map((c: any, idx: number) => {
            const ts = c.time
              ? formatInZone(c.time, user.timezone, "MMM d, yyyy 'at' h:mm a")
              : "";
            return `${idx + 1}. ${c.title}${ts ? ` - ${ts}` : ""}`;
          })
          .join("\n")}\n\nReply with the number of your choice.`;
        this.addToConversationContext(user.id, {
          role: "assistant",
          content: selectionMessage,
          timestamp: new Date(),
        });
        return {
          text: selectionMessage,
          toolCalls: result.toolCalls,
          toolResults: result.toolResults,
          renderedText: selectionMessage,
        };
      }
      if (lastToolResult?.needsConfirmation) {
        conversationContext.needsConfirmation = {
          action: lastToolResult.action,
          summary: lastToolResult.summary,
          targetId: lastToolResult.targetId,
          timestamp: new Date(),
        };
        const confirmMessage = lastToolResult.message;
        this.addToConversationContext(user.id, {
          role: "assistant",
          content: confirmMessage,
          timestamp: new Date(),
        });
        return {
          text: confirmMessage,
          toolCalls: result.toolCalls,
          toolResults: result.toolResults,
          renderedText: confirmMessage,
        };
      }
      const toolsWereExecuted = (result as any)._toolsExecuted === true;
      if (
        !toolsWereExecuted &&
        result.toolCalls.length === 0 &&
        (!result.text || result.text.trim().length === 0)
      ) {
        this.logger.warn(
          `Action intent detected but no tool results. Asking for clarification.`
        );
        const clarificationMessage =
          "I'm not sure I understood that correctly. Could you please rephrase or provide more details?";
        this.addToConversationContext(user.id, {
          role: "assistant",
          content: clarificationMessage,
          timestamp: new Date(),
        });
        return {
          text: clarificationMessage,
          toolCalls: result.toolCalls,
          toolResults: result.toolResults,
          renderedText: clarificationMessage,
        };
      }
      const hasMeaningfulText = !!(
        result.text &&
        result.text.trim() &&
        !/^(processed your request\.?|done\.?)$/i.test(result.text.trim())
      );
      const renderedText = hasMeaningfulText
        ? (result.text as string)
        : result.toolResults &&
          Array.isArray(result.toolResults) &&
          result.toolResults.length > 0
        ? this.responseFormatter.getResponseMessage(
            lastToolEnvelope,
            user.timezone
          )
        : this.responseFormatter.getResponseMessage(result, user.timezone);
      this.logger.info(
        {
          renderedTextPreview: (renderedText || "").slice(0, 160),
        },
        "Prepared rendered text"
      );
      if (renderedText) {
        this.addToConversationContext(user.id, {
          role: "assistant",
          content: renderedText,
          timestamp: new Date(),
        });
      }
      const finalRendered =
        renderedText ||
        (toolsWereExecuted
          ? "Done."
          : "I'm not sure I understood that correctly. Could you please rephrase or provide more details?");
      return {
        text: result.text,
        toolCalls: result.toolCalls,
        toolResults: result.toolResults,
        renderedText: finalRendered,
      };
    } catch (error: any) {
      this.logger.error({ error }, `Failed to process message with AI`);
      throw new Error(`Failed to process your request: ${error.message}`);
    }
  }
  private async handleImageMessage(
    context: MessageContext,
    user: User
  ): Promise<any> {
    const conversationContext = this.getConversationContext(user.id);
    return await this.messageBatchService.addMessage(
      context,
      user.id,
      async (contexts: MessageContext[]) => {
        if (contexts.length > 1) {
          this.logger.info(
            `Processing batch of ${contexts.length} images for user ${user.name}`
          );
          const messageWithCaption = contexts.find(
            (ctx) => ctx.text && ctx.text.trim().length > 0
          );
          if (messageWithCaption) {
            return await this.mediaHandler.handleMultipleImageMessages(
              contexts,
              user,
              conversationContext,
              (userId, role, content, timestamp) => {
                this.addToConversationContext(userId, {
                  role: role as "user" | "assistant",
                  content,
                  timestamp,
                });
              },
              (result, timezone) =>
                this.responseFormatter.getResponseMessage(result, timezone)
            );
          } else {
            const results = [];
            for (const ctx of contexts) {
              const result = await this.mediaHandler.handleImageMessage(
                ctx,
                user,
                conversationContext,
                (userId, role, content, timestamp) => {
                  this.addToConversationContext(userId, {
                    role: role as "user" | "assistant",
                    content,
                    timestamp,
                  });
                },
                (result, timezone) =>
                  this.responseFormatter.getResponseMessage(result, timezone)
              );
              results.push(result);
            }
            return results[results.length - 1];
          }
        } else {
          return await this.mediaHandler.handleImageMessage(
            contexts[0],
            user,
            conversationContext,
            (userId, role, content, timestamp) => {
              this.addToConversationContext(userId, {
                role: role as "user" | "assistant",
                content,
                timestamp,
              });
            },
            (result, timezone) =>
              this.responseFormatter.getResponseMessage(result, timezone)
          );
        }
      }
    );
  }
  private async handleAudioMessage(
    context: MessageContext,
    user: User
  ): Promise<any> {
    const userId = user.id;
    const conversationContext = this.getConversationContext(userId);
    return await this.mediaHandler.handleAudioMessage(
      context,
      user,
      conversationContext,
      (userId: string, role: string, content: string, timestamp: Date) => {
        this.addToConversationContext(userId, {
          role: role as "user" | "assistant",
          content,
          timestamp,
        });
      },
      (result, timezone) =>
        this.responseFormatter.getResponseMessage(result, timezone)
    );
  }
  getResponseMessage(result: any, timezone?: string): string {
    const tz =
      timezone || (result && (result.timezone || result?.output?.timezone));
    return this.responseFormatter.getResponseMessage(result, tz);
  }
}
