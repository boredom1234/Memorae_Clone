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
        /^(can you|could you|please)\s+(add|create|set|schedule|remind|remove|delete|list|show)\b/.test(
          text,
        )
      ) {
      } else {
        return false;
      }
    }
    if (
      /^(add|create|set|schedule|remind|remove|delete|list|show|make|note|remember)\b/.test(
        text,
      )
    ) {
      return true;
    }
    if (
      /^(can you|could you|please)\s+(add|create|set|schedule|remind|remove|delete|list|show)\b/.test(
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
      /^(remind (me|us)\b|remind me to\b|set (a )?reminder\b|schedule (a )?(reminder|alarm)\b|wake me\b)/.test(
        text,
      )
    ) {
      return "createReminder";
    }
    if (
      /^(show|list|view)\s+(my\s+)?reminders?\b(?!.*\b(today|tomorrow|week|month|on|at)\b)/.test(
        text,
      )
    ) {
      return "listReminders";
    }
    if (
      /((today|tomorrow|week|month|on\s+\w+|at\s+\d{1,2}(:\d{2})?\s*(am|pm)?).*(reminder|reminders))/.test(
        text,
      )
    ) {
      return "getUpcomingReminders";
    }
    if (/^(snooze|postpone|delay)\b/.test(text)) {
      return "snoozeReminder";
    }
    if (/^(show|what are|list)\s+(my\s+)?lists\b/.test(text)) {
      return "getLists";
    }
    if (/^(add|put|include)\s+.+\s+(to|into|onto)\s+.+\s+list\b/.test(text)) {
      return "addItemToList";
    }
    if (/^(remove|delete|take off)\s+.+\s+from\s+.+\s+list\b/.test(text)) {
      return "removeItemFromList";
    }
    if (/^(what('| i)?s|show|list)\s+(on|in)\s+.+\s+list\b/.test(text)) {
      return "getListItems";
    }
    if (
      /^(remember this|take a note|create (a )?note|note:|\bnote this\b|\bsave this\b|\bstore this\b)/.test(
        text,
      )
    ) {
      return "createNote";
    }
    if (/^(search|find)\s+(note|notes|memory|memories)\b/.test(text)) {
      return "searchNotes";
    }
    if (/^(show|list)\s+(notes|memories)\b/.test(text)) {
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
      "addItemToList",
      "removeItemFromList",
      "createList",
      "createNote",
    ].includes(toolName);
  }
  private isReadOnlyTool(toolName: string): boolean {
    return ["getCurrentTime"].includes(toolName);
  }
  private isTimeOrDateQuestion(message: string): boolean {
    const t = (message || "").toLowerCase().trim();
    if (!t) return false;
    return (
      /\b(current\s+date|date\s+today|today'?s\s+date)\b/.test(t) ||
      /\b(what( is|'s)?\s+the\s+date(\s+today)?|what\s+date\s+is\s+it(\s+today)?)\b/.test(
        t,
      ) ||
      /\b(current\s+time|time\s+now)\b/.test(t) ||
      /\b(what( is|'s)?\s+the\s+time(\s+now)?|what\s+time\s+is\s+it(\s+now)?)\b/.test(
        t,
      )
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
    const toolDefinitions = toolsRegistry.getToolDefinitions(userId);
    const selectedToolNameFromRouter = await routeToTool(
      textForProcessing,
      toolDefinitions,
    );
    const commandLike = this.isCommandLike(textForProcessing);
    let selectedToolName = selectedToolNameFromRouter;
    if (selectedToolNameFromRouter === "no_tool_needed" && commandLike) {
      const heuristic = this.heuristicToolSelection(textForProcessing);
      if (heuristic !== "no_tool_needed") {
        const maybeTool = toolsRegistry.getSingleAISDKTool(userId, heuristic);
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
            system: `You are a helpful AI assistant. Be friendly, concise, and helpful in your responses. Current user timezone is ${timezone}.

Guidance:
- If the user's request is general knowledge, chit-chat, or off our domain (reminders, lists, notes, OCR/transcription), answer conversationally.
- If the request could trigger state-changing actions (creating reminders, lists, or notes) and is ambiguous or question-like, ask for a brief confirmation instead of assuming.`,
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
    const willUseTools =
      this.isCommandLike(textForProcessing) ||
      (this.isReadOnlyTool(selectedToolName) &&
        this.isTimeOrDateQuestion(textForProcessing));
    if (willUseTools) {
      this.logger.info(`Executing selected tool: ${selectedToolName}`);
    } else {
      this.logger.info(
        `Selected tool '${selectedToolName}' will be skipped (not command-like). Using conversational response.`,
      );
    }
    const tools = toolsRegistry.getSingleAISDKTool(userId, selectedToolName);
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
            system: `You are a helpful AI assistant. Be friendly and concise. If the user's request is ambiguous regarding creating reminders, lists, or notes, ask for a short confirmation instead of acting. Timezone: ${timezone}.`,
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
      throw new Error(`AI service unavailable: conversational fallback failed`);
    }
    let lastError: Error | null = null;
    for (const modelConfig of modelsToTry) {
      try {
        this.logger.info(
          `Attempting tool execution with ${modelConfig.provider}`,
        );
        const systemPrompt = willUseTools
          ? `You are a helpful AI assistant for a reminder and task management system.
Your task is to use the provided tool ONLY if the user's request is clearly command-like and within our domain (reminders, lists, notes), or if it is a factual time/date question requiring an accurate answer. Otherwise, answer conversationally.

Guidance:
- If the request is general knowledge, chit-chat, or otherwise off-domain, DO NOT call tools. Provide a direct answer.
- If the request is ambiguous and would create/modify data (reminders, lists, notes), ask a brief confirmation first and DO NOT call tools until confirmed.
- After using any tool, you MUST provide a concise explanation of what was done and the result.

The user's message is: "${textForProcessing}"
You have been provided with the tool: "${selectedToolName}".

Note: The selected tool ${this.isStateChangingTool(selectedToolName) ? "modifies user data (state-changing)" : "is read-only"}.

Current user timezone: ${timezone}
Current user ID: ${userId}
Current time (UTC): ${new Date().toISOString()}`
          : `You are a helpful AI assistant for a reminder and task management system. Be friendly and concise.

Guidance:
- Do not call tools for this request. Provide a direct conversational answer.
- If the request appears ambiguous for creating or modifying reminders, lists, or notes, ask a brief confirmation instead of acting.

The user's message is: "${textForProcessing}"

Current user timezone: ${timezone}
Current user ID: ${userId}
Current time (UTC): ${new Date().toISOString()}`;
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
          `AI processed message with ${modelConfig.provider} - tool executed: ${toolsActuallyExecuted}`,
        );
        return {
          text: result.text,
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
    const commandLike = this.isCommandLike(textForProcessing);
    const effectiveTools = commandLike ? tools : ({} as any);
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
