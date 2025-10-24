import { generateText } from "ai";
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
import { ToolsRegistry } from "./tools-registry";
import { routeToTool } from "./tools/tool-router";
import { TranslationService } from "./translation-service";
export class AIService {
  private logger = pino({ level: "info" });
  private defaultModel: any;
  private fallbackModels: any[] = [];
  private translationService: TranslationService;
  constructor() {
    this.initializeModels();
    this.translationService = new TranslationService();
  }
  private enrichMessageWithContext(
    message: string,
    conversationHistory: ConversationMessage[] = [],
  ): string {
    const text = message.trim().toLowerCase();
    const timeframeMap: Record<string, "today" | "tomorrow" | "week" | "month"> = {
      today: "today",
      "today's": "today",
      tomorrow: "tomorrow",
      "tomorrow's": "tomorrow",
      week: "week",
      "this week": "week",
      month: "month",
      "this month": "month",
    };
    const timeframeOnly = Object.keys(timeframeMap).find((k) =>
      new RegExp(`^${k}$`).test(text),
    );
    if (timeframeOnly) {
      const prev = [...conversationHistory].reverse().find((m) => m.role === "user" || m.role === "assistant");
      const prevText = prev?.content?.toLowerCase() || "";
      if (/reminder|upcoming|what.*reminders|show.*reminders|list.*reminders/.test(prevText)) {
        return `reminders for ${timeframeMap[timeframeOnly]}`;
      }
    }
    return message;
  }
  private initializeModels() {
    this.defaultModel = this.getDefaultModel();
    this.fallbackModels = this.getFallbackModels();
    this.logger.info(
      `AI Service initialized with ${this.fallbackModels.length} fallback models`,
    );
  }
  private isCommandLike(message: string): boolean {
    const text = message.toLowerCase().trim();
    if (text.endsWith("?")) {
      if (
        /^(can you|could you|please|will you|would you)\s+(add|create|set|schedule|remind|remove|delete|list|show|update|change|move|mark|complete|snooze|search|find|get)\b/.test(
          text,
        )
      ) {
        return true;
      }
      if (
        /^(what|which|show|list|display|tell)\b.*(list|reminder|note|item|task|memory)/.test(
          text,
        )
      ) {
        return true;
      }
      if (
        /^(my|upcoming|today'?s?|tomorrow'?s?).*(reminder|list|note|task)/.test(
          text,
        )
      ) {
        return true;
      }
    }
    if (
      /^(add|create|set|schedule|remind|remove|delete|list|show|make|note|remember|update|change|edit|move|complete|finish|done|mark|snooze|postpone|delay|search|find|get|display|view|check)\b/.test(
        text,
      )
    ) {
      return true;
    }
    if (
      /^(can you|could you|please|will you|would you|i want to|i need to|i'd like to)\s+(add|create|set|schedule|remind|remove|delete|list|show|update|change|mark)\b/.test(
        text,
      )
    ) {
      return true;
    }
    return false;
  }
  private heuristicToolSelection(message: string): string {
    const text = message.toLowerCase().trim();
    if (
      /^(remind (me|us)\b|remind me to\b|set (a )?reminder\b|schedule (a )?(reminder|alarm)\b|wake me\b|alert me\b|notify me\b)/.test(
        text,
      )
    ) {
      return "createReminder";
    }
    if (
      /^(show|list|view|display|get)\s+(my\s+)?(all\s+)?reminders?\b(?!.*\b(today|tomorrow|week|month|upcoming)\b)/.test(
        text,
      ) ||
      /^my\s+reminders?\b(?!.*\b(today|tomorrow|week|month|upcoming|for)\b)/i.test(
        text,
      )
    ) {
      return "listReminders";
    }
    if (
      /(what\s+reminders?.*(today|tomorrow|this\s+week|this\s+month)|reminders?\s+(for\s+)?(today|tomorrow|this\s+week|this\s+month)|(today|tomorrow|this\s+week|this\s+month).*reminders?|upcoming\s+reminders?|my\s+upcoming\s+reminders?|today'?s?\s+reminders?)/.test(
        text,
      )
    ) {
      return "getUpcomingReminders";
    }
    if (/^(snooze|postpone|delay|push back)\b/.test(text)) {
      return "snoozeReminder";
    }
    if (/^(delete|remove|cancel|clear)\s+(the\s+)?reminder\b/.test(text)) {
      return "deleteReminder";
    }
    if (
      /^(change|update|edit|modify|reschedule|move)\s+(the\s+)?reminder\b/.test(
        text,
      )
    ) {
      return "updateReminder";
    }
    if (/^(show|what are|list|display|get)\s+(my\s+)?lists\b/.test(text)) {
      return "getLists";
    }
    if (/^(create|make|start|new)\s+(a\s+)?list\b/.test(text)) {
      return "createList";
    }
    if (
      /^(add|put|include|insert)\s+.+\s+(to|into|onto|in)\s+.+\s+list\b/.test(
        text,
      )
    ) {
      return "addItemToList";
    }
    if (
      /^(remove|delete|take off|clear)\s+.+\s+from\s+.+\s+list\b/.test(text)
    ) {
      return "removeItemFromList";
    }
    if (
      /^(what('| i)?s|show|list|display|view|get)\s+(on|in)\s+(my\s+)?.+\s+list\b/.test(
        text,
      )
    ) {
      return "getListItems";
    }
    if (
      /^(remember (this|that)|take a note|make (a )?note|create (a )?note|note:|note this|save (this|that)|store (this|that)|keep track)/.test(
        text,
      )
    ) {
      return "createNote";
    }
    if (
      /^(search|find|look for|what did i)\s+(note|notes|memory|memories|save)\b/.test(
        text,
      )
    ) {
      return "searchNotes";
    }
    if (
      /^(show|list|display|get)\s+(my\s+)?(all\s+)?(notes|memories)\b/.test(
        text,
      )
    ) {
      return "listNotes";
    }
    if (/\b(stats|statistics|completion rate|how many lists)\b/.test(text)) {
      return "getListStats";
    }
    return "no_tool_needed";
  }
  private isStateChangingTool(toolName: string): boolean {
    return [
      "createReminder",
      "batchCreateReminders",
      "updateReminder",
      "deleteReminder",
      "snoozeReminder",
      "completeReminder",
      "createList",
      "addItemToList",
      "removeItemFromList",
      "updateListItem",
      "deleteList",
      "archiveList",
      "bulkCompleteItems",
      "clearCompletedItems",
      "duplicateList",
      "createNote",
      "updateNote",
      "deleteNote",
      "duplicateNote",
    ].includes(toolName);
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
      if (fallbackConfig.provider === config.ai.provider.toLowerCase()) {
        continue;
      }
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
  async processMessage(
    message: string,
    userId: string,
    timezone: string,
    toolsRegistry: ToolsRegistry,
    conversationHistory: ConversationMessage[] = [],
  ): Promise<{
    text: string;
    toolCalls: any[];
    toolResults: any[];
    _toolsExecuted?: boolean;
  }> {
    if (!this.defaultModel && this.fallbackModels.length === 0) {
      this.logger.error("No AI models configured");
      throw new Error("AI service not available - no models configured");
    }
    const modelsToTry = [
      { provider: "primary", instance: this.defaultModel },
      ...this.fallbackModels.map((f) => ({
        provider: f.provider,
        instance: f.instance,
      })),
    ].filter((m) => m.instance);
    const translation =
      await this.translationService.translateToEnglish(message);
    const textForProcessing = translation.translatedText || message;
    const textForRouting = this.enrichMessageWithContext(
      textForProcessing,
      conversationHistory,
    );
    const toolDefinitions = toolsRegistry.getToolDefinitions(userId);
    const selectedToolNameFromRouter = await routeToTool(
      textForRouting,
      toolDefinitions,
    );
    const commandLike = this.isCommandLike(textForRouting);
    let selectedToolName = selectedToolNameFromRouter;
    if (selectedToolNameFromRouter === "no_tool_needed" && commandLike) {
      const heuristic = this.heuristicToolSelection(textForRouting);
      if (heuristic !== "no_tool_needed") {
        const maybeTool = toolsRegistry.getSingleAISDKTool(userId, heuristic, {
          originalMessage: textForProcessing,
          timezone,
        });
        if (maybeTool && Object.keys(maybeTool).length > 0) {
          this.logger.info(
            `Router returned no_tool_needed; heuristic selected ${heuristic}`,
          );
          selectedToolName = heuristic;
        }
      }
    }
    const messages = conversationHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));
    if (selectedToolName === "no_tool_needed") {
      this.logger.info(
        "No tool will be used. Generating conversational response.",
      );
      for (const modelConfig of modelsToTry) {
        try {
          const messagesWithCurrent = [
            ...messages,
            { role: "user" as const, content: textForProcessing },
          ];
          const result = await generateText({
            model: modelConfig.instance,
            system: `You are Memorae, a helpful and friendly AI assistant for task and memory management. Be conversational, helpful, and natural in your responses.

Your capabilities:
- Answer questions naturally and helpfully
- Provide information, suggestions, and guidance
- Help users understand how to use reminders, lists, and notes
- Have casual conversations and answer general questions

Current context:
- User timezone: ${timezone}
- Current time: ${new Date().toISOString()}

Important:
- Be warm and conversational, not robotic
- If the user seems to want to create/modify data but the request is unclear, ask friendly follow-up questions
- Never claim you performed an action (created/updated/deleted) unless you actually did
- For ambiguous action requests, clarify what they want first`,
            messages: messagesWithCurrent,
          });
          return { text: result.text, toolCalls: [], toolResults: [] };
        } catch (error: any) {
          this.logger.warn(
            { error: error.message, provider: modelConfig.provider },
            `Conversational request failed with ${modelConfig.provider}, trying next fallback`,
          );
          continue;
        }
      }
      throw new Error(
        "All AI models failed to generate a conversational response.",
      );
    }
    const willUseTools = selectedToolName !== "no_tool_needed";
    if (willUseTools) {
      this.logger.info(
        `Tool router selected: ${selectedToolName} - will provide to LLM`,
      );
    } else {
      this.logger.info(
        `No tool selected by router. Using conversational response.`,
      );
    }
    const tools = toolsRegistry.getSingleAISDKTool(userId, selectedToolName, {
      originalMessage: textForProcessing,
      timezone,
    });
    if (!tools || Object.keys(tools).length === 0) {
      this.logger.error(
        `Selected tool "${selectedToolName}" not available. Falling back to conversational response.`,
      );
      for (const modelConfig of modelsToTry) {
        try {
          const messagesWithCurrent = [
            ...messages,
            { role: "user" as const, content: textForProcessing },
          ];
          const result = await generateText({
            model: modelConfig.instance,
            system: `You are a helpful AI assistant. Be friendly and concise. If the user's request is ambiguous regarding creating reminders, lists, or notes, ask for a short confirmation instead of acting. Timezone: ${timezone}.

Important: You do not have tool access for this request. Do NOT claim you created, updated, or deleted anything.`,
            messages: messagesWithCurrent,
          });
          return { text: result.text, toolCalls: [], toolResults: [] };
        } catch (error: any) {
          this.logger.warn(
            { error: error.message, provider: modelConfig.provider },
            `Conversational fallback failed with ${modelConfig.provider}, trying next fallback`,
          );
        }
      }
    }
    let lastError: Error | null = null;
    for (const modelConfig of modelsToTry) {
      try {
        this.logger.info(
          `Attempting tool execution with ${modelConfig.provider}`,
        );
        const systemPrompt = willUseTools
          ? `You are Memorae, a helpful and friendly AI assistant for task and memory management.

You have the "${selectedToolName}" tool available to help with this request.

User's request: "${textForProcessing}"

Your approach:
1. **Analyze the request**: Does it have enough information to take action?
   - YES → Extract parameters and use the "${selectedToolName}" tool
   - NO → Ask friendly clarifying questions

2. **Extract ALL relevant details** from the user's message:
   - Times, dates, priorities from context
   - For reminders: ALWAYS extract time info via naturalTimeText (use "now", "in 1 minute" if no explicit time given)
   - For lists: ALWAYS extract list name from message (e.g., "shopping list", "todo", "groceries")
   - For notes: ALWAYS extract content from message, infer category from context
   - Infer reasonable defaults when appropriate
   - Use natural language understanding liberally and be generous in parameter extraction

3. **After tool execution**: Provide a natural, friendly confirmation
   - Example: "Done! I've added milk to your groceries list."
   - Example: "Got it! I'll remind you about the dentist appointment tomorrow at 2pm."

4. **Be flexible with natural language**:
   - "tomorrow afternoon" → infer reasonable time (2pm)
   - "tonight" → infer evening time (8pm)
   - "buy milk" when discussing shopping → should add to shopping list

5. **Special cases**:
   - If the selected tool is getUpcomingReminders and the message is a single timeframe word ("today", "tomorrow", "this week", "this month"), map it directly to the timeframe parameter and call the tool.
   - If the message contains patterns like "every X" without a start time, still create the recurring reminder and use the current time as the start when appropriate.

Tool category: ${
              this.isStateChangingTool(selectedToolName)
                ? "Action tool (creates/updates/deletes data)"
                : "Query tool (retrieves information)"
            }

Context:
- User timezone: ${timezone}
- Current time: ${new Date().toISOString()}

IMPORTANT: Be helpful and proactive. If the user clearly wants something done, do it. Only ask for clarification if the request is genuinely ambiguous.`
          : `You are Memorae, a helpful and friendly AI assistant. Be conversational, warm, and helpful.

The user said: "${textForProcessing}"

Respond naturally and helpfully. Be friendly and engaging, not robotic.

Context:
- User timezone: ${timezone}
- Current time: ${new Date().toISOString()}`;
        const effectiveTools = willUseTools ? tools : ({} as any);
        const result = await generateText({
          model: modelConfig.instance,
          system: systemPrompt,
          messages: [
            ...messages,
            { role: "user" as const, content: textForProcessing },
          ],
          tools: effectiveTools,
          maxSteps: 5,
        } as any);
        const toolStats = (effectiveTools as any).__stats;
        const toolsActuallyExecuted = toolStats?.executed === true;
        this.logger.info(
          {
            provider: modelConfig.provider,
            toolExecuted: toolsActuallyExecuted,
            toolCallsCount: result.toolCalls?.length || 0,
            toolResultsCount: result.toolResults?.length || 0,
            hasText: !!result.text,
            textPreview: result.text?.substring(0, 100),
          },
          `AI processed message with ${modelConfig.provider}`,
        );
        if (willUseTools && !toolsActuallyExecuted) {
          this.logger.warn(
            {
              selectedTool: selectedToolName,
              textLength: textForProcessing.length,
              hasToolCalls: result.toolCalls?.length > 0,
            },
            `Tool ${selectedToolName} was provided but not executed by LLM`,
          );
        }
        let finalText = result.text;
        if ((!finalText || finalText.trim().length === 0) && (result.toolResults?.length || 0) > 0) {
          try {
            const first = (result.toolResults as any[])[0];
            const output = first?.output ?? first;
            if (output?.message) finalText = output.message;
            else if (output?.success === false && output?.error) {
              finalText = `I couldn't complete that: ${output.message || 'validation failed'}. Please clarify the time or details.`;
            } else if (output?.success === true) {
              finalText = `Done.`;
            }
          } catch {}
          if (!finalText || finalText.trim().length === 0) {
            finalText = "Processed your request.";
          }
        }
        return {
          text: finalText,
          toolCalls: result.toolCalls,
          toolResults: result.toolResults,
          _toolsExecuted: toolsActuallyExecuted,
        };
      } catch (error: any) {
        lastError = error;
        this.logger.warn(
          { error: error.message, provider: modelConfig.provider },
          `Tool execution failed with ${modelConfig.provider}, trying next fallback`,
        );
        continue;
      }
    }
    this.logger.error(
      { error: lastError?.message || "Unknown error" },
      "All AI models failed to process message with the selected tool",
    );
    throw new Error(
      `AI service unavailable: ${lastError?.message || "All providers failed"}`,
    );
  }
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
    _toolsExecuted?: boolean;
  }> {
    if (!this.defaultModel && this.fallbackModels.length === 0) {
      this.logger.error("No AI models configured");
      throw new Error("AI service not available - no models configured");
    }
    const modelsToTry = [
      { provider: "primary", instance: this.defaultModel },
      ...this.fallbackModels.map((f) => ({
        provider: f.provider,
        instance: f.instance,
      })),
    ].filter((m) => m.instance);
    const messages = conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
    const translation =
      await this.translationService.translateToEnglish(message);
    const textForProcessing = translation.translatedText || message;
    const effectiveTools = tools;
    const messagesWithCurrent = [
      ...messages,
      { role: "user", content: textForProcessing },
    ];
    let lastError: Error | null = null;
    for (const modelConfig of modelsToTry) {
      try {
        const systemPrompt = `You are a helpful AI assistant for a reminder and task management system.
Use the provided tool(s) ONLY when the user's request is clearly command-like and within our domain (reminders, lists, notes). Otherwise, answer conversationally.

Guidance:
- If the user's request is general knowledge, chit-chat, or off-domain, DO NOT call tools. Provide a direct answer.
- If ambiguous and would create/modify data, ask a brief confirmation question first; do not call tools until confirmed.
- Important: Do not claim that you created/updated/deleted anything unless you actually executed a tool that returned success.

Current user timezone: ${timezone}
Current user ID: ${userId}
Current time (UTC): ${new Date().toISOString()}`;
        const result = await generateText({
          model: modelConfig.instance,
          system: systemPrompt,
          messages: messagesWithCurrent,
          tools: effectiveTools,
          maxSteps: 5,
        } as any);
        const toolStats = (effectiveTools as any).__stats;
        const toolsActuallyExecuted = toolStats?.executed === true;
        return {
          text: (result as any).text,
          toolCalls: (result as any).toolCalls || [],
          toolResults: (result as any).toolResults || [],
          _toolsExecuted: toolsActuallyExecuted,
        };
      } catch (error: any) {
        lastError = error;
        this.logger.warn(
          { error: error.message, provider: modelConfig.provider },
          `Direct tool execution failed with ${modelConfig.provider}, trying next fallback`,
        );
        continue;
      }
    }
    this.logger.error(
      { error: lastError?.message || "Unknown error" },
      "All AI models failed to process message with provided tools",
    );
    throw new Error(
      `AI service unavailable: ${lastError?.message || "All providers failed"}`,
    );
  }
}
