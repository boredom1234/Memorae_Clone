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
export class MessageController {
  private logger = pino({ level: "info" });
  private tools: ToolsRegistry;
  private aiService: AIService;
  private ocrService: OCRService;
  private mediaService: MediaAttachmentService;
  private messageBatchService: MessageBatchService;
  private userCache: Map<string, User> = new Map();
  private userNewCache: Map<string, boolean> = new Map();
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
      this.tools,
    );
    this.cacheCleanupInterval = setInterval(
      () => {
        this.cleanupUserCache();
      },
      30 * 60 * 1000,
    );
    this.contextCleanupInterval = setInterval(
      () => {
        this.cleanupConversationContexts();
      },
      15 * 60 * 1000,
    );
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
    const userService = this.tools.getUserService();
    let user: User;
    let isNew: boolean;
    if (context.from.includes("@")) {
      const phoneNumber = "+" + context.from.split("@")[0];
      const result = await userService.findOrCreateUser(
        context.from,
        phoneNumber,
        context.fromName,
      );
      user = result.user;
      isNew = result.isNew;
    } else {
      const result = await userService.findOrCreateTelegramUser(
        context.from,
        context.fromName,
      );
      user = result.user;
      isNew = result.isNew;
    }
    (user as any).lastAccessed = Date.now();
    this.userCache.set(context.from, user);
    this.userNewCache.set(context.from, isNew);
    this.logger.info(`User ensured: ${user.name} (${user.id})`);
    return { user, isNew };
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
        `Cleaned ${cleanedCount} entries from user cache. Cache size: ${this.userCache.size}`,
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
        `Cleaned ${cleanedCount} conversation contexts. Active contexts: ${this.conversationContexts.size}`,
      );
    }
  }
  private getConversationContext(userId: string): ConversationContext {
    if (!this.conversationContexts.has(userId)) {
      this.conversationContexts.set(userId, {
        userId,
        messages: [],
        lastActivity: new Date(),
        maxMessages: 20,
      });
    }
    const context = this.conversationContexts.get(userId)!;
    context.lastActivity = new Date();
    return context;
  }
  private addToConversationContext(
    userId: string,
    message: ConversationMessage,
  ): void {
    const context = this.getConversationContext(userId);
    context.messages.push(message);
    if (context.messages.length > context.maxMessages) {
      context.messages = context.messages.slice(-context.maxMessages);
    }
    context.lastActivity = new Date();
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
    isNew?: boolean,
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
    if (/^\d+$/.test(validatedText.trim())) {
      const selection = parseInt(validatedText.trim(), 10);
      if (
        conversationContext.candidateItems &&
        conversationContext.candidateItems.length > 0
      ) {
        const selected = conversationContext.candidateItems.find(
          (c) =>
            c.id === String(selection) ||
            conversationContext.candidateItems!.indexOf(c) === selection - 1,
        );
        if (selected) {
          this.logger.info(
            `User selected item ${selection}: ${selected.title}`,
          );
          conversationContext.candidateItems = undefined;
        }
      }
    }
    const lowerText = validatedText.toLowerCase().trim();
    if (
      conversationContext.needsConfirmation &&
      /^(yes|y|confirm|ok)$/i.test(lowerText)
    ) {
      this.logger.info(
        `User confirmed action: ${conversationContext.needsConfirmation.action}`,
      );
      conversationContext.needsConfirmation = undefined;
    } else if (
      conversationContext.needsConfirmation &&
      /^(no|n|cancel|nope)$/i.test(lowerText)
    ) {
      this.logger.info(
        `User cancelled action: ${conversationContext.needsConfirmation.action}`,
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
          conversationContext,
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
      `Conversation history: ${conversationContext.messages.length} messages`,
    );

    try {
      const result = await this.aiService.processMessage(
        validatedText,
        user.id,
        user.timezone,
        this.tools,
        conversationContext.messages,
      );

      this.logger.info(`AI response: ${result.text}`);
      this.logger.info(`Tool calls: ${result.toolCalls.length}`);
      this.logger.info(`Tool results: ${result.toolResults?.length || 0}`);
      if (Array.isArray(result.toolResults)) {
        try {
          const toolResultShapes = result.toolResults.map((r: any, idx: number) => ({
            index: idx,
            toolName: r?.toolName,
            keys: r && typeof r === "object" ? Object.keys(r) : null,
          }));
          this.logger.info({ toolResultShapes }, "Tool result shapes");
        } catch {}
      }
      const lastToolEnvelope =
        result.toolResults && result.toolResults.length > 0
          ? result.toolResults[result.toolResults.length - 1]
          : null;
      // Unwrap AISDK tool result envelope { toolName, args, result }
      const lastToolResult =
        lastToolEnvelope && typeof lastToolEnvelope === "object" && "result" in lastToolEnvelope
          ? (lastToolEnvelope as any).result
          : lastToolEnvelope;
      this.logger.info(
        {
          toolName: (lastToolEnvelope as any)?.toolName,
          envelopeKeys:
            lastToolEnvelope && typeof lastToolEnvelope === "object"
              ? Object.keys(lastToolEnvelope as any)
              : null,
          hasInnerResult:
            !!(
              lastToolEnvelope &&
              typeof lastToolEnvelope === "object" &&
              (lastToolEnvelope as any).result
            ),
        },
        "Tool result envelope summary",
      );
      if (lastToolResult?.needsSelection && lastToolResult.candidates) {
        conversationContext.candidateItems = lastToolResult.candidates.map(
          (c: any) => ({
            id: c.id,
            title: c.title,
            description: c.time,
            type: c.type || "reminder",
          }),
        );
        const selectionMessage = `${lastToolResult.message}\n\n${lastToolResult.candidates
          .map(
            (c: any, idx: number) =>
              `${idx + 1}. ${c.title}${c.time ? ` - ${c.time}` : ""}`,
          )
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
      if (result.toolsRequiredButMissing && !toolsWereExecuted) {
        this.logger.warn(
          `Action intent detected but no tool results. Asking for clarification.`,
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
      const renderedText =
        result.toolResults &&
        Array.isArray(result.toolResults) &&
        result.toolResults.length > 0
          ? this.responseFormatter.getResponseMessage(
              lastToolEnvelope,
              user.timezone,
            )
          : result.text ||
            this.responseFormatter.getResponseMessage(result, user.timezone);
      this.logger.info(
        {
          renderedTextPreview: (renderedText || "").slice(0, 160),
        },
        "Prepared rendered text",
      );
      if (renderedText) {
        this.addToConversationContext(user.id, {
          role: "assistant",
          content: renderedText,
          timestamp: new Date(),
        });
      }
      return {
        text: result.text,
        toolCalls: result.toolCalls,
        toolResults: result.toolResults,
        renderedText: renderedText || "Done!",
      };
    } catch (error: any) {
      this.logger.error({ error }, `Failed to process message with AI`);
      throw new Error(`Failed to process your request: ${error.message}`);
    }
  }
  private async handleImageMessage(
    context: MessageContext,
    user: User,
  ): Promise<any> {
    const conversationContext = this.getConversationContext(user.id);
    return await this.messageBatchService.addMessage(
      context,
      user.id,
      async (contexts: MessageContext[]) => {
        if (contexts.length > 1) {
          this.logger.info(
            `Processing batch of ${contexts.length} images for user ${user.name}`,
          );
          const messageWithCaption = contexts.find(
            (ctx) => ctx.text && ctx.text.trim().length > 0,
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
                this.responseFormatter.getResponseMessage(result, timezone),
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
                  this.responseFormatter.getResponseMessage(result, timezone),
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
              this.responseFormatter.getResponseMessage(result, timezone),
          );
        }
      },
    );
  }
  private async handleAudioMessage(
    context: MessageContext,
    user: User,
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
        this.responseFormatter.getResponseMessage(result, timezone),
    );
  }
  getResponseMessage(result: any, timezone?: string): string {
    return this.responseFormatter.getResponseMessage(result, timezone);
  }
}
