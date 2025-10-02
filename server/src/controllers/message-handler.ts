import { MessageContext } from "../services/whatsapp";
import { ToolsRegistry } from "../services/tools-registry";
import { AIService } from "../services/ai-service";
import { User } from "../models/types";
import { ConversationMessage, ConversationContext } from "../types/conversation";
import pino from "pino";
import { formatInZone } from "../utils/time-utils";
import { validateAIInput } from "../middleware/validation";

export class MessageController {
  private logger = pino({ level: "info" });
  private tools: ToolsRegistry;
  private aiService: AIService;
  private userCache: Map<string, User> = new Map();
  private conversationContexts: Map<string, ConversationContext> = new Map();
  private cacheCleanupInterval: NodeJS.Timeout;
  private contextCleanupInterval: NodeJS.Timeout;

  constructor() {
    this.tools = new ToolsRegistry();
    this.aiService = new AIService();
    
    // Start cache cleanup - clean every 30 minutes
    this.cacheCleanupInterval = setInterval(() => {
      this.cleanupUserCache();
    }, 30 * 60 * 1000);

    // Start conversation context cleanup - clean every 15 minutes
    this.contextCleanupInterval = setInterval(() => {
      this.cleanupConversationContexts();
    }, 15 * 60 * 1000);
  }

  async handleMessage(context: MessageContext): Promise<any> {
    try {
      const { fromName, messageType } = context;

      this.logger.info(`Processing message from ${fromName}`);

      // Ensure user exists in database
      const user = await this.ensureUser(context);

      // Handle different message types
      switch (messageType) {
        case "text":
          return await this.handleTextMessage(context, user);
        case "image":
          return await this.handleImageMessage(context, user);
        case "audio":
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

  private async ensureUser(context: MessageContext): Promise<User> {
    // Check cache first
    if (this.userCache.has(context.from)) {
      const cachedUser = this.userCache.get(context.from)!;
      // Update last accessed time for cache management
      (cachedUser as any).lastAccessed = Date.now();
      return cachedUser;
    }

    // Extract phone number from WhatsApp ID (e.g., "919876543210@s.whatsapp.net" -> "+919876543210")
    const phoneNumber = "+" + context.from.split("@")[0];

    // Find or create user
    const userService = this.tools.getUserService();
    const user = await userService.findOrCreateUser(
      context.from,
      phoneNumber,
      context.fromName,
    );

    // Cache the user with timestamp
    (user as any).lastAccessed = Date.now();
    this.userCache.set(context.from, user);

    this.logger.info(`User ensured: ${user.name} (${user.id})`);
    return user;
  }

  /**
   * Clean up old entries from user cache
   * Remove users not accessed in the last 2 hours
   */
  private cleanupUserCache(): void {
    const now = Date.now();
    const maxAge = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
    let cleanedCount = 0;

    for (const [key, user] of this.userCache.entries()) {
      const lastAccessed = (user as any).lastAccessed || 0;
      if (now - lastAccessed > maxAge) {
        this.userCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.info(`Cleaned ${cleanedCount} entries from user cache. Cache size: ${this.userCache.size}`);
    }
  }

  /**
   * Clean up old conversation contexts
   * Remove contexts not accessed in the last 1 hour
   */
  private cleanupConversationContexts(): void {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour in milliseconds
    let cleanedCount = 0;

    for (const [userId, context] of this.conversationContexts.entries()) {
      if (now - context.lastActivity.getTime() > maxAge) {
        this.conversationContexts.delete(userId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.info(`Cleaned ${cleanedCount} conversation contexts. Active contexts: ${this.conversationContexts.size}`);
    }
  }

  /**
   * Get or create conversation context for a user
   */
  private getConversationContext(userId: string): ConversationContext {
    if (!this.conversationContexts.has(userId)) {
      this.conversationContexts.set(userId, {
        userId,
        messages: [],
        lastActivity: new Date(),
        maxMessages: 7, // Keep last 7 messages for context
      });
    }

    const context = this.conversationContexts.get(userId)!;
    context.lastActivity = new Date();
    return context;
  }

  /**
   * Add a message to conversation context
   */
  private addToConversationContext(userId: string, message: ConversationMessage): void {
    const context = this.getConversationContext(userId);
    context.messages.push(message);

    // Keep only the last N messages to prevent memory bloat
    if (context.messages.length > context.maxMessages) {
      context.messages = context.messages.slice(-context.maxMessages);
    }

    context.lastActivity = new Date();
  }

  /**
   * Cleanup method for graceful shutdown
   */
  cleanup(): void {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
    }
    if (this.contextCleanupInterval) {
      clearInterval(this.contextCleanupInterval);
    }
    this.userCache.clear();
    this.conversationContexts.clear();
  }

  private async handleTextMessage(
    context: MessageContext,
    user: User,
  ): Promise<any> {
    const { text } = context;

    if (!text) return null;

    // Validate and sanitize input
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

    // Get conversation context
    const conversationContext = this.getConversationContext(user.id);
    
    // Add user message to conversation context
    this.addToConversationContext(user.id, {
      role: 'user',
      content: validatedText,
      timestamp: new Date(),
      messageId: context.messageId,
    });

    // Get AI SDK compatible tools
    const tools = this.tools.getAISDKTools(user.id);

    // Debug: Log tool structure
    this.logger.info(`Tool keys: ${Object.keys(tools).join(", ")}`);
    this.logger.info(`Conversation history: ${conversationContext.messages.length} messages`);
    if (tools.createReminder) {
      this.logger.info(
        `createReminder tool exists: ${typeof tools.createReminder}`,
      );
    }

    // Process message with AI tool calling and conversation history
    try {
      const result = await this.aiService.processMessageWithTools(
        validatedText,
        user.id,
        user.timezone,
        tools,
        conversationContext.messages,
      );

      this.logger.info(`AI response: ${result.text}`);
      this.logger.info(`Tool calls: ${result.toolCalls.length}`);

      // Add AI response to conversation context
      if (result.text) {
        this.addToConversationContext(user.id, {
          role: 'assistant',
          content: result.text,
          timestamp: new Date(),
        });
      }

      // Return the AI's response text and tool results
      return {
        text: result.text,
        toolCalls: result.toolCalls,
        toolResults: result.toolResults,
        renderedText: this.getResponseMessage(result, user.timezone),
      };
    } catch (error: any) {
      this.logger.error({ error }, `Failed to process message with AI`);
      throw new Error(`Failed to process your request: ${error.message}`);
    }
  }

  private async handleImageMessage(
    _context: MessageContext,
    _user: User,
  ): Promise<any> {
    this.logger.info("Image message received");
    throw new Error("Image processing is not yet implemented. Coming soon!");
  }

  private async handleAudioMessage(
    _context: MessageContext,
    _user: User,
  ): Promise<any> {
    this.logger.info("Audio message received");
    throw new Error("Voice transcription is not yet implemented. Coming soon!");
  }

  // Public method to get response for WhatsApp
  getResponseMessage(result: any, timezone?: string): string {
    if (!result) return "Done!";

    // If result has text from AI, use that
    if (result.text) {
      return result.text;
    }

    if (result.message) return result.message;

    // Format different result types
    if (result.reminders) {
      if (result.reminders.length === 0) {
        return "No reminders found.";
      }
      return `📅 Your reminders:\n${result.reminders
        .map((r: any, i: number) => {
          const ts = timezone
            ? formatInZone(r.reminderTime, timezone)
            : new Date(r.reminderTime).toLocaleString();
          return `${i + 1}. ${r.title} - ${ts}`;
        })
        .join("\n")}`;
    }

    if (result.results && Array.isArray(result.results)) {
      // Search results
      if (result.results.length === 0) {
        return "No reminders found matching your search.";
      }
      return `🔍 Found ${result.total} reminder(s):\n${result.results
        .map((r: any, i: number) => {
          const ts = timezone
            ? formatInZone(r.reminderTime, timezone)
            : new Date(r.reminderTime).toLocaleString();
          return `${i + 1}. ${r.title} - ${ts}`;
        })
        .join("\n")}`;
    }

    if (result.lists) {
      if (result.lists.length === 0) {
        return "No lists found.";
      }
      return `📝 Your lists:\n${result.lists
        .map((l: any, i: number) => {
          const itemsText = l.items
            ? `\n${l.items
                .map(
                  (item: any) =>
                    `   ${item.isCompleted ? "✅" : "⬜"} ${item.content}`,
                )
                .join("\n")}`
            : "";
          return `${i + 1}. ${l.name} (${l.itemCount} items)${itemsText}`;
        })
        .join("\n\n")}`;
    }

    // Handle list items response
    if (result.items && Array.isArray(result.items)) {
      if (result.items.length === 0) {
        return `List "${result.listName || "Unknown"}" is empty.`;
      }
      return `📝 ${result.listName}:\n${result.items
        .map(
          (item: any, i: number) =>
            `${i + 1}. ${item.isCompleted ? "✅" : "⬜"} ${item.content}`,
        )
        .join("\n")}`;
    }

    // Handle batch create results
    if (result.created !== undefined && result.failed !== undefined) {
      return `✅ Created ${result.created} reminder(s)${result.failed > 0 ? `, ${result.failed} failed` : ""}`;
    }

    // Handle added/removed count
    if (result.addedCount !== undefined) {
      return `✅ Added ${result.addedCount} item(s) to list`;
    }

    if (result.removedCount !== undefined) {
      return `✅ Removed ${result.removedCount} item(s) from list`;
    }

    // Handle getCurrentTime response
    if (result.formattedTime && result.timezone) {
      return `🕐 Current time: ${result.formattedTime}`;
    }

    return "Done!";
  }
}
