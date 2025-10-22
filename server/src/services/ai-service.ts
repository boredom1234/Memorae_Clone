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

export class AIService {
  private logger = pino({ level: "info" });
  private defaultModel: any;
  private fallbackModels: any[] = [];

  constructor() {
    this.initializeModels();
  }

  private initializeModels() {
    this.defaultModel = this.getDefaultModel();
    this.fallbackModels = this.getFallbackModels();
    this.logger.info(
      `AI Service initialized with ${this.fallbackModels.length} fallback models`,
    );
  }

  // Lightweight keyword-based fallback for routing
  private heuristicToolSelection(message: string): string {
    const text = message.toLowerCase();

    // Reminders
    if (/(remind|set\s+.*reminder|schedule|alarm)/.test(text)) {
      return "createReminder";
    }
    if (
      /((what|show|list).*(my\s+)?reminders|reminders\b)/.test(text) &&
      !/(today|tomorrow|week|month)/.test(text)
    ) {
      return "listReminders";
    }
    if (/((today|tomorrow|week|month).*(reminder|reminders))/.test(text)) {
      return "getUpcomingReminders";
    }
    if (/(snooze|postpone|delay)/.test(text)) {
      return "snoozeReminder";
    }

    // Lists
    if (/((show|what).*(my\s+)?lists|all my lists|show lists)/.test(text)) {
      return "getLists";
    }
    if (/(add|put|include).*(to|into|on).+list/.test(text)) {
      return "addItemToList";
    }
    if (/(remove|delete|take off).*(from).+list/.test(text)) {
      return "removeItemFromList";
    }
    if (/((what's|whats|show|list).*(on|in).+list)/.test(text)) {
      return "getListItems";
    }

    // Notes
    if (/(remember this|take a note|create note|\bnote\b|\bsave\b|\bstore\b)/.test(text)) {
      return "createNote";
    }
    if (/((search|find).*(note|notes|memory|memories))/.test(text)) {
      return "searchNotes";
    }
    if (/((show|list).*(notes|memories))/.test(text)) {
      return "listNotes";
    }

    // List stats
    if (/(stats|statistics|completion rate|how many lists)/.test(text)) {
      return "getListStats";
    }

    return "no_tool_needed";
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

    // Get all tool definitions for the router
    const toolDefinitions = toolsRegistry.getToolDefinitions(userId);

    // ===== Step 1: Route to the correct tool =====
    const selectedToolNameFromRouter = await routeToTool(
      message,
      toolDefinitions,
    );
    // Guardrail: lightweight keyword heuristic if router declines
    let selectedToolName = selectedToolNameFromRouter;
    if (selectedToolNameFromRouter === "no_tool_needed") {
      const heuristic = this.heuristicToolSelection(message);
      if (heuristic !== "no_tool_needed") {
        this.logger.info(
          `Router returned no_tool_needed; heuristic selected ${heuristic}`,
        );
        selectedToolName = heuristic;
      }
    }

    const messages = conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // ===== Step 2: Execute =====
    // If no tool is needed, generate a conversational response.
    if (selectedToolName === "no_tool_needed") {
      this.logger.info(
        "Router determined no tool is needed. Generating conversational response.",
      );
      for (const modelConfig of modelsToTry) {
        try {
          const result = await generateText({
            model: modelConfig.instance,
            system: `You are a helpful AI assistant. Be friendly, concise, and helpful in your responses. Current user timezone is ${timezone}.`,
            messages,
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

    // If a tool is selected, prepare for execution.
    this.logger.info(`Executing selected tool: ${selectedToolName}`);
    const tools = toolsRegistry.getSingleAISDKTool(userId, selectedToolName);

    if (!tools || Object.keys(tools).length === 0) {
      this.logger.error(
        `Router selected tool "${selectedToolName}", but the tool could not be found or constructed.`,
      );
      throw new Error(`Internal error: Could not find tool "${selectedToolName}".`);
    }

    let lastError: Error | null = null;
    for (const modelConfig of modelsToTry) {
      try {
        this.logger.info(`Attempting tool execution with ${modelConfig.provider}`);
        const systemPrompt = `You are a helpful AI assistant for a reminder and task management system.
Your task is to use the provided tool to fulfill the user's request, then provide a helpful response to the user.

IMPORTANT: After using the tool, you MUST provide a conversational response to the user explaining what you did or what the results are. Do not just execute the tool silently.

The user's message is: "${message}"
You have been provided with the tool: "${selectedToolName}".
Use it to process the user's request, then explain the results in a friendly, conversational way.

Current user timezone: ${timezone}
Current user ID: ${userId}
Current time (UTC): ${new Date().toISOString()}`;

        const result = await generateText({
          model: modelConfig.instance,
          system: systemPrompt,
          messages,
          tools,
          maxSteps: 5, // Reduced max steps as we are more targeted
        } as any);

        const toolStats = (tools as any).__stats;
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
}