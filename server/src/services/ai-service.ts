import { generateText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import { mistral } from "@ai-sdk/mistral";
import { xai } from "@ai-sdk/xai";
import { azure } from "@ai-sdk/azure";
import { deepinfra } from "@ai-sdk/deepinfra";
import { vertex } from "@ai-sdk/google-vertex";
import { togetherai } from "@ai-sdk/togetherai";
import { cohere } from "@ai-sdk/cohere";
import { fireworks } from "@ai-sdk/fireworks";
import { deepseek } from "@ai-sdk/deepseek";
import { cerebras } from "@ai-sdk/cerebras";
import { config } from "../config/env";
import { ConversationMessage } from "../types/conversation";
import pino from "pino";

export class AIService {
  private logger = pino({ level: "info" });
  private defaultModel: any;
  private fallbackModels: any[] = [];

  constructor() {
    // Initialize default model and fallbacks based on available API keys
    this.initializeModels();
  }

  private initializeModels() {
    // Get primary model
    this.defaultModel = this.getDefaultModel();

    // Initialize fallback models
    this.fallbackModels = this.getFallbackModels();

    this.logger.info(
      `AI Service initialized with ${this.fallbackModels.length} fallback models`,
    );
  }

  private getDefaultModel() {
    const provider = config.ai.provider.toLowerCase();
    const model = config.ai.model;

    this.logger.info(`Configuring AI: Provider=${provider}, Model=${model}`);

    try {
      switch (provider) {
        case "openai":
          if (!config.ai.openaiApiKey)
            throw new Error("OpenAI API key not configured");
          this.logger.info(`Using OpenAI (${model})`);
          return openai(model);

        case "groq":
          if (!config.ai.groqApiKey)
            throw new Error("Groq API key not configured");
          this.logger.info(`Using Groq (${model})`);
          return groq(model);

        case "xai":
          if (!config.ai.xaiApiKey)
            throw new Error("xAI API key not configured");
          this.logger.info(`Using xAI (${model})`);
          return xai(model);

        case "google":
          if (!config.ai.googleApiKey)
            throw new Error("Google API key not configured");
          this.logger.info(`Using Google (${model})`);
          return google(model);

        case "anthropic":
          if (!config.ai.anthropicApiKey)
            throw new Error("Anthropic API key not configured");
          this.logger.info(`Using Anthropic (${model})`);
          return anthropic(model);

        case "deepseek":
          if (!config.ai.deepseekApiKey)
            throw new Error("DeepSeek API key not configured");
          this.logger.info(`Using DeepSeek (${model})`);
          return deepseek(model);

        case "mistral":
          if (!config.ai.mistralApiKey)
            throw new Error("Mistral API key not configured");
          this.logger.info(`Using Mistral (${model})`);
          return mistral(model);

        case "togetherai":
          if (!config.ai.togetheraiApiKey)
            throw new Error("Together.ai API key not configured");
          this.logger.info(`Using Together.ai (${model})`);
          return togetherai(model);

        case "cohere":
          if (!config.ai.cohereApiKey)
            throw new Error("Cohere API key not configured");
          this.logger.info(`Using Cohere (${model})`);
          return cohere(model);

        case "fireworks":
          if (!config.ai.fireworksApiKey)
            throw new Error("Fireworks API key not configured");
          this.logger.info(`Using Fireworks (${model})`);
          return fireworks(model);

        case "deepinfra":
          if (!config.ai.deepinfraApiKey)
            throw new Error("DeepInfra API key not configured");
          this.logger.info(`Using DeepInfra (${model})`);
          return deepinfra(model);

        case "cerebras":
          if (!config.ai.cerebrasApiKey)
            throw new Error("Cerebras API key not configured");
          this.logger.info(`Using Cerebras (${model})`);
          return cerebras(model);

        case "azure":
          if (
            !config.ai.azureApiKey ||
            !config.ai.azureResourceName ||
            !config.ai.azureDeploymentName
          ) {
            throw new Error("Azure OpenAI not fully configured");
          }
          this.logger.info(
            `Using Azure OpenAI (${config.ai.azureDeploymentName})`,
          );
          return azure(config.ai.azureDeploymentName);

        case "vertex":
          if (!config.ai.vertexProjectId || !config.ai.vertexLocation) {
            throw new Error("Google Vertex AI not fully configured");
          }
          this.logger.info(`Using Google Vertex AI (${model})`);
          return vertex(model);

        default:
          throw new Error(`Unknown AI provider: ${provider}`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to configure AI provider: ${error.message}`);
      this.logger.warn("AI features will not work.");
      return null;
    }
  }

  private getFallbackModels(): any[] {
    const fallbacks: any[] = [];

    // Define fallback providers in order of preference
    const fallbackConfigs = [
      {
        provider: "groq",
        model: "llama-3.1-8b-instant",
        apiKey: config.ai.groqApiKey,
      },
      {
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: config.ai.openaiApiKey,
      },
      { provider: "xai", model: "grok-beta", apiKey: config.ai.xaiApiKey },
      {
        provider: "anthropic",
        model: "claude-3-haiku-20240307",
        apiKey: config.ai.anthropicApiKey,
      },
      {
        provider: "google",
        model: "gemini-1.5-flash",
        apiKey: config.ai.googleApiKey,
      },
      {
        provider: "deepseek",
        model: "deepseek-chat",
        apiKey: config.ai.deepseekApiKey,
      },
    ];

    for (const fallbackConfig of fallbackConfigs) {
      // Skip if this is already the primary provider
      if (fallbackConfig.provider === config.ai.provider.toLowerCase()) {
        continue;
      }

      // Skip if API key is not configured
      if (!fallbackConfig.apiKey) {
        continue;
      }

      try {
        let model: any;
        switch (fallbackConfig.provider) {
          case "openai":
            model = openai(fallbackConfig.model);
            break;
          case "groq":
            model = groq(fallbackConfig.model);
            break;
          case "xai":
            model = xai(fallbackConfig.model);
            break;
          case "anthropic":
            model = anthropic(fallbackConfig.model);
            break;
          case "google":
            model = google(fallbackConfig.model);
            break;
          case "deepseek":
            model = deepseek(fallbackConfig.model);
            break;
          default:
            continue;
        }

        fallbacks.push({
          provider: fallbackConfig.provider,
          model: fallbackConfig.model,
          instance: model,
        });

        this.logger.info(
          `Added fallback: ${fallbackConfig.provider} (${fallbackConfig.model})`,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to configure fallback ${fallbackConfig.provider}: ${error}`,
        );
      }
    }

    return fallbacks;
  }

  /**
   * Process user message with AI tool calling
   * The LLM will automatically decide which tool to call
   */
  async processMessageWithTools(
    message: string,
    userId: string,
    timezone: string,
    tools: any,
    conversationHistory: ConversationMessage[] = [],
  ): Promise<{
    text: string;
    toolCalls: any[];
    toolResults: any[];
  }> {
    if (!this.defaultModel && this.fallbackModels.length === 0) {
      this.logger.error("No AI models configured");
      throw new Error("AI service not available - no models configured");
    }

    // Try primary model first, then fallbacks
    const modelsToTry = [
      { provider: "primary", instance: this.defaultModel },
      ...this.fallbackModels.map((f) => ({
        provider: f.provider,
        instance: f.instance,
      })),
    ].filter((m) => m.instance);

    let lastError: Error | null = null;

    for (const modelConfig of modelsToTry) {
      try {
        this.logger.info(`Attempting AI request with ${modelConfig.provider}`);

        // Debug: Log tool names to verify they're being passed
        this.logger.info(`Tools available: ${Object.keys(tools).join(", ")}`);

        // Convert conversation history to AI SDK format. The latest user message
        // is already included by the caller in conversationHistory, so DO NOT
        // append it again here to avoid duplication and confused context.
        const messages = conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

        let result = await generateText({
          model: modelConfig.instance,
          messages,
          system: `You are a helpful AI assistant for a reminder and task management system.
You help users create, update, delete, and manage reminders and lists through WhatsApp.

When users ask you to do something, use the appropriate tool to help them.
Be friendly, concise, and helpful in your responses.

CRITICAL: Always provide a natural, conversational response to the user. When you use tools, explain what you found or did in a friendly way. Never just return raw tool results or technical information.

Examples of good responses:
- "I found sugar on your groceries list - you need 2kg!"
- "Here are your upcoming reminders for today..."
- "I've added milk to your shopping list!"
- "I couldn't find any reminders matching that description."

IMPORTANT: You have access to conversation history. Use it to understand context from previous messages.
For example, if a user previously asked "Delete my reminder" and you responded with a list of reminders,
and now they say "1", you should understand they want to delete the first reminder from that list.

IMPORTANT GUIDELINES:

1. CREATING REMINDERS:
   - Use the field name "reminderTime" (NOT "time") for the ISO 8601 datetime
   - For relative times like "in 30 seconds" or "in 5 minutes", calculate the absolute ISO 8601 datetime from the current time
   - Current time (UTC): ${new Date().toISOString()}
   - IMPORTANT: The system automatically uses the user's configured timezone (${timezone}) for all time operations. Users don't need to specify their timezone.
   - When users say times like "3pm", "tomorrow at 9am", interpret these in their local timezone
   - Example: If user says "remind me in 30 seconds", calculate 30 seconds from now and use that ISO datetime
   - Extract the task/title from the user's message (e.g., "remind me to call John" -> title: "call John")
   - For complex recurring schedules (e.g., "every 2nd and 4th Saturday at 10am", "every Mon, Wed, Fri"), set isRecurring=true and provide recurrenceRule in iCalendar RRULE format when possible.
     Examples:
       • 2nd and 4th Saturday monthly at 10:00 -> FREQ=MONTHLY;BYDAY=SA;BYSETPOS=2,4
       • Every Monday, Wednesday, Friday -> FREQ=WEEKLY;BYDAY=MO,WE,FR
       • Weekdays -> FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR
     If the schedule is simple ("daily", "weekly"), you may use plain English in recurrenceRule as well.

2. UPDATING REMINDERS:
   - When user wants to change a reminder, use updateReminder tool
   - Extract what they want to update (time, title, or priority)
   - Use searchQuery to find the reminder by its title or description

3. DELETING REMINDERS:
   - When user wants to cancel/remove/delete a reminder, use deleteReminder tool
   - Use searchQuery to find the reminder by its title

4. LISTING REMINDERS:
   - When user asks "what reminders do I have?" or "show my reminders", use listReminders
   - Default to showing pending reminders unless they specify completed or all

5. COMPLETING REMINDERS:
   - When user says they finished a task or wants to mark it done, use completeReminder
   - Use searchQuery to find the reminder

6. SNOOZING REMINDERS:
   - When user wants to postpone a reminder, use snoozeReminder
   - Calculate the new time based on their request (e.g., "snooze for 10 minutes")

7. UPCOMING REMINDERS:
   - When user asks about reminders "today", "tomorrow", "this week", or "this month", use getUpcomingReminders
   - Choose the appropriate timeframe

8. BATCH CREATING:
   - When user provides multiple reminders at once, use batchCreateReminders
   - Parse each reminder with its time and title

9. LIST MANAGEMENT:
   - CREATE LIST: "create a shopping list" -> createList
   - ADD ITEMS: "add milk to my shopping list" -> addItemToList
   - VIEW LISTS: "show me my lists" -> getLists
   - VIEW LIST ITEMS: "what's on my shopping list?" -> getListItems
   - REMOVE ITEMS: "remove milk from shopping list" -> removeItemFromList
   - CHECK OFF ITEMS: "mark milk as done" -> updateListItem with isCompleted=true
   - DELETE LIST: "delete my shopping list" -> deleteList
   - SEARCH LISTS: "find milk in my lists" -> searchLists
10. USER SETTINGS:
   - VIEW SETTINGS: "what are my settings?" -> getUserSettings
   - UPDATE TIMEZONE: "change my timezone to EST" -> updateUserSettings with timezone
   - UPDATE LANGUAGE: "set my language to Spanish" -> updateUserSettings with language
   - TOGGLE NOTIFICATIONS: "turn off notifications" -> updateUserSettings with notificationEnabled=false
   - SET QUIET HOURS: "set quiet hours from 10pm to 7am" -> setQuietHours

   Additionally, for PERSONAL INFO questions such as "what's my name?", "who am I?", or "what's my phone number?",
   you MUST call getUserSettings and answer using its returned fields (e.g., name, phoneNumber, whatsappId, timezone, language).
   Do not guess; always fetch from getUserSettings for such questions.

11. CURRENT TIME:
   - When user asks for current time or date, use getCurrentTime tool (automatically uses their configured timezone)
   - Examples: "what time is it?", "what's the current time?", "what date is it today?"

REMINDERS:
- "remind me to call John at 3pm" -> createReminder
- "set a reminder for my dentist appointment tomorrow at 2pm" -> createReminder
- "change my meeting reminder to 4pm" -> updateReminder
- "delete the dentist reminder" -> deleteReminder
- "show me my reminders" -> listReminders
- "mark the meeting as done" -> completeReminder
- "snooze the alarm for 10 minutes" -> snoozeReminder
- "what's coming up today?" -> getUpcomingReminders with timeframe='today'

LISTS:
- "create a shopping list" -> createList
- "add milk and eggs to my shopping list" -> addItemToList with items=["milk", "eggs"]
- "show me my lists" -> getLists
- "what's on my shopping list?" -> getListItems
- "remove milk from shopping list" -> removeItemFromList
- "mark eggs as done on the shopping list" -> updateListItem with isCompleted=true
- "delete my todo list" -> deleteList
- "find milk in my lists" -> searchLists

USER SETTINGS:
- "what are my settings?" -> getUserSettings
- "change my timezone to America/New_York" -> updateUserSettings with timezone
- "turn off notifications" -> updateUserSettings with notificationEnabled=false
- "set quiet hours from 10pm to 7am" -> setQuietHours with enabled=true, startTime="22:00", endTime="07:00"

CURRENT TIME:
- "what time is it?" -> getCurrentTime (automatically uses user's timezone)
- "what's the current time?" -> getCurrentTime (automatically uses user's timezone)
- "what date is it today?" -> getCurrentTime (automatically uses user's timezone)

Current user timezone: ${timezone}
Current user ID: ${userId}`,
          tools,
          stopWhen: stepCountIs(5), // Allow up to 5 multi-step tool calls
        });

        this.logger.info(
          `AI processed message with ${modelConfig.provider} - ${result.toolCalls.length} tool calls`,
        );

        // If the model failed to call tools but the input likely requires
        // data operations (lists/reminders/settings), retry with stricter
        // instructions to use tools. This mitigates hallucinated answers.
        if (
          result.toolCalls.length === 0 &&
          this.messageLikelyNeedsTools(message)
        ) {
          this.logger.warn(
            `No tool calls detected for a likely tool-requiring message. Retrying with tools-required system prompt...`,
          );

          result = await generateText({
            model: modelConfig.instance,
            messages,
            system: `You are a helpful AI assistant for a reminder and task management system.
The user message below requires interacting with tools (reminders, lists, notes, or user settings).
TOOLS_REQUIRED: You must use at least one tool. Do NOT fabricate data or answer from memory when the operation involves user data. If uncertain which tool to use, first call 'getUserSettings' or 'searchLists'/'searchReminders' to disambiguate, then proceed.

Current user timezone: ${timezone}
Current user ID: ${userId}`,
            tools,
            stopWhen: stepCountIs(5),
          });

          this.logger.info(
            `Retry completed - tool calls: ${result.toolCalls.length}`,
          );
        }

        return {
          text: result.text,
          toolCalls: result.toolCalls,
          toolResults: result.toolResults,
        };
      } catch (error: any) {
        lastError = error;
        this.logger.warn(
          { error: error.message, provider: modelConfig.provider },
          `AI request failed with ${modelConfig.provider}, trying next fallback`,
        );
        continue;
      }
    }

    // All models failed
    this.logger.error(
      { error: lastError?.message || "Unknown error" },
      "All AI models failed to process message",
    );
    throw new Error(
      `AI service unavailable: ${lastError?.message || "All providers failed"}`,
    );
  }

  // Basic heuristic to detect when a message likely requires tools and not a
  // free-form answer. This helps reduce hallucinations by forcing tool usage.
  private messageLikelyNeedsTools(input: string): boolean {
    const s = (input || "").toLowerCase();
    const actionKeywords = [
      "remind",
      "reminder",
      "set a reminder",
      "create",
      "add",
      "put",
      "include",
      "list",
      "show",
      "what's on",
      "what is on",
      "delete",
      "remove",
      "complete",
      "mark as",
      "snooze",
      "update",
      "change",
      "timezone",
      "settings",
      "notes",
    ];
    return actionKeywords.some((k) => s.includes(k));
  }
}
