import { MessageContext } from "../services/whatsapp";
import { ToolsRegistry } from "../services/tools-registry";
import { AIService } from "../services/ai-service";
import { SupermemoryService } from "../services/supermemory-service";
import { User } from "../models/types";
import pino from "pino";
import { config } from "../config/env";
import { formatInZone } from "../utils/time-utils";

export class MessageController {
  private logger = pino({ level: "info" });
  private tools: ToolsRegistry;
  private aiService: AIService;
  private supermemory: SupermemoryService;
  private userCache: Map<string, User> = new Map();

  constructor() {
    this.tools = new ToolsRegistry();
    this.aiService = new AIService();
    this.supermemory = new SupermemoryService();
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
      return this.userCache.get(context.from)!;
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

    // Cache the user
    this.userCache.set(context.from, user);

    this.logger.info(`User ensured: ${user.name} (${user.id})`);
    return user;
  }

  private async handleTextMessage(
    context: MessageContext,
    user: User,
  ): Promise<any> {
    const { text } = context;

    if (!text) return null;

    this.logger.info(`Text message: \"${text}\"`);

    // Get AI SDK compatible tools
    const tools = this.tools.getAISDKTools(user.id);

    // Debug: Log tool structure
    this.logger.info(`Tool keys: ${Object.keys(tools).join(", ")}`);
    if (tools.createReminder) {
      this.logger.info(
        `createReminder tool exists: ${typeof tools.createReminder}`,
      );
    }

    // Process message with AI tool calling
    try {
      const result = await this.aiService.processMessageWithTools(
        text,
        user.id,
        user.timezone,
        tools,
      );

      this.logger.info(`AI response: ${result.text}`);
      this.logger.info(`Tool calls: ${result.toolCalls.length}`);

      // Selective Supermemory storage
      if (this.supermemory.isEnabled()) {
        const mode = config.supermemory.conversationStorageMode;

        // Store reminder context only when a reminder tool was used and enabled
        const storeReminderContext = config.supermemory.storeReminderContext;

        const toolCalls: any[] = Array.isArray(result.toolCalls)
          ? result.toolCalls
          : [];
        const toolResults: any[] = Array.isArray(result.toolResults)
          ? result.toolResults
          : [];

        // Helper to get tool name in a robust way
        const getToolName = (call: any): string =>
          call?.toolName || call?.name || call?.call?.toolName || "";

        // Whitelist for contextual conversation storage
        const contextualWhitelist = new Set([
          // Reminder tools
          "createReminder",
          "updateReminder",
          "deleteReminder",
          "listReminders",
          "snoozeReminder",
          "completeReminder",
          "getUpcomingReminders",
          "searchReminders",
          "batchCreateReminders",
          // List tools
          "createList",
          "addItemToList",
          "removeItemFromList",
          "updateListItem",
          "getLists",
          "getListItems",
          "deleteList",
          "searchLists",
          // Memory tools
          "saveNote",
          "searchMemories",
          "getMyNotes",
          "recallConversation",
          "getReminderContext",
          "findRelatedInfo",
        ]);

        // Store reminder context for createReminder and batchCreateReminders
        if (storeReminderContext && toolCalls.length > 0) {
          toolCalls.forEach((call, i) => {
            const name = getToolName(call);
            const args = call?.args || call?.input || {};
            const resultObj = toolResults[i] || {};

            if (name === "createReminder") {
              const reminderId = resultObj?.reminderId;
              const title = args?.title || "Reminder";
              if (reminderId && title) {
                this.supermemory
                  .storeReminderContext(user.id, reminderId, title, text, {
                    timestamp: new Date().toISOString(),
                  })
                  .catch((error) =>
                    this.logger.warn(
                      { error },
                      "Failed to store reminder context in Supermemory",
                    ),
                  );
              }
            } else if (name === "batchCreateReminders") {
              const results = resultObj?.results;
              if (Array.isArray(results)) {
                results
                  .filter((r: any) => r?.success && r?.reminderId)
                  .forEach((r: any) => {
                    const title = r?.title || "Reminder";
                    this.supermemory
                      .storeReminderContext(
                        user.id,
                        r.reminderId,
                        title,
                        text,
                        { timestamp: new Date().toISOString() },
                      )
                      .catch((error) =>
                        this.logger.warn(
                          { error },
                          "Failed to store reminder context (batch) in Supermemory",
                        ),
                      );
                  });
              }
            }
          });
        }

        // Conversation storage policy
        if (mode === "all") {
          this.supermemory
            .storeConversation(user.id, text, result.text, {
              timestamp: new Date().toISOString(),
            })
            .catch((error) => {
              this.logger.warn(
                { error },
                "Failed to store conversation in Supermemory",
              );
            });
        } else if (mode === "contextual") {
          const usedRelevantTool = toolCalls.some((c) =>
            contextualWhitelist.has(getToolName(c)),
          );
          if (usedRelevantTool) {
            this.supermemory
              .storeConversation(user.id, text, result.text, {
                timestamp: new Date().toISOString(),
              })
              .catch((error) => {
                this.logger.warn(
                  { error },
                  "Failed to store contextual conversation in Supermemory",
                );
              });
          }
        }
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
