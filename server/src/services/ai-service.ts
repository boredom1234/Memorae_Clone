import { generateText, stepCountIs } from "ai";
import pino from "pino";
import { ToolsRegistry } from "./tools-registry";
import { routeToTool } from "./tools/tool-router";
import { TranslationService } from "./translation-service";
import { ConversationMessage } from "../types/conversation";
import {
  conversationalPrompt,
  toolSystemPrompt,
  noToolAccessPrompt,
  directToolSystemPrompt,
} from "./ai/prompts";
import {
  enrichMessageWithContext,
  isCommandLike,
  heuristicToolSelection,
} from "./ai/message-processor";
import { getDefaultModel, getFallbackModels } from "./ai/model-manager";
import {
  handleTimeLeftQuery,
  handleGenericRetrieval,
} from "./ai/response-handler";
import { isStateChangingTool } from "./ai/tool-utils";
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
    this.defaultModel = getDefaultModel();
    this.fallbackModels = getFallbackModels();
    this.logger.info(
      `AI Service initialized with ${this.fallbackModels.length} fallback models`,
    );
  }
  async processMessage(
    message: string,
    userId: string,
    timezone: string,
    toolsRegistry: ToolsRegistry,
    conversationHistory: ConversationMessage[] = [],
    summary?: string,
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
    const textForRouting = enrichMessageWithContext(
      textForProcessing,
      conversationHistory,
    );
    const toolDefinitions = toolsRegistry.getToolDefinitions(userId);
    const selectedToolNameFromRouter = await routeToTool(
      textForRouting,
      toolDefinitions,
    );
    const commandLike = isCommandLike(textForRouting);
    let selectedToolName = selectedToolNameFromRouter;
    if (selectedToolNameFromRouter === "no_tool_needed") {
      const heuristic = heuristicToolSelection(textForRouting);
      const allowHeuristic =
        commandLike ||
        heuristic === "createNote" ||
        heuristic === "conversational_with_context";
      if (heuristic !== "no_tool_needed" && allowHeuristic) {
        if (heuristic === "conversational_with_context") {
          selectedToolName = "no_tool_needed";
        } else {
          const maybeTool = toolsRegistry.getSingleAISDKTool(
            userId,
            heuristic,
            {
              originalMessage: textForProcessing,
              timezone,
            },
          );
          if (maybeTool && Object.keys(maybeTool).length > 0) {
            this.logger.info(
              `Router returned no_tool_needed; heuristic selected ${heuristic}`,
            );
            selectedToolName = heuristic;
          }
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
            system: conversationalPrompt(timezone, summary),
            messages: messagesWithCurrent,
          });
          let safeText = result.text;
          try {
            const claimsAction =
              /\b(saved|created|added|set|scheduled|deleted|removed|updated)\b/i.test(
                safeText || "",
              ) && /\b(note|reminder|list|item)\b/i.test(safeText || "");
            if (claimsAction) {
              safeText =
                "I haven't saved anything yet. Would you like me to save that as a note?";
            }
          } catch {}
          return { text: safeText, toolCalls: [], toolResults: [] };
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
    const tools = toolsRegistry.getRelevantToolGroup(userId, selectedToolName, {
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
            system: noToolAccessPrompt(timezone, textForProcessing),
            messages: messagesWithCurrent,
          });
          let safeText = result.text;
          try {
            const claimsAction =
              /\b(saved|created|added|set|scheduled|deleted|removed|updated)\b/i.test(
                safeText || "",
              ) && /\b(note|reminder|list|item)\b/i.test(safeText || "");
            if (claimsAction) {
              safeText =
                "I haven't saved anything yet. Would you like me to save that as a note?";
            }
          } catch {}
          return { text: safeText, toolCalls: [], toolResults: [] };
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
        const systemPrompt = toolSystemPrompt(
          selectedToolName,
          textForProcessing,
          isStateChangingTool(selectedToolName),
          timezone,
          summary,
        );
        const effectiveTools = willUseTools ? tools : ({} as any);
        const result = await generateText({
          model: modelConfig.instance,
          system: systemPrompt,
          messages: [
            ...messages,
            { role: "user" as const, content: textForProcessing },
          ],
          tools: effectiveTools,
          stopWhen: stepCountIs(8),
          maxSteps: 10,
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
        if (
          (!finalText || finalText.trim().length === 0) &&
          (result.toolResults?.length || 0) > 0
        ) {
          this.logger.warn(
            "LLM did not generate text after tool execution. Using fallback.",
          );
          try {
            const first = (result.toolResults as any[])[0];
            const output = first?.output ?? first;
            if (output?.message) finalText = output.message;
            else if (output?.success === false && output?.error) {
              finalText = `I couldn't complete that: ${output.message || "validation failed"}. Please clarify the time or details.`;
            } else if (output?.success === true) {
              finalText = `Done.`;
            }
          } catch {}
          if (!finalText || finalText.trim().length === 0) {
            finalText = "Processed your request.";
          }
        }
        try {
          const timeLeftText = await handleTimeLeftQuery(
            textForProcessing,
            result,
            toolsRegistry,
            userId,
            timezone,
          );
          if (timeLeftText) {
            finalText = timeLeftText;
          }
        } catch (e: any) {
          this.logger.warn(
            { error: e?.message },
            "Deterministic time-left fallback failed",
          );
        }
        try {
          finalText = await handleGenericRetrieval(
            finalText,
            textForProcessing,
            toolsRegistry,
            userId,
          );
        } catch (e: any) {
          this.logger.warn(
            { error: e?.message },
            "General deterministic retrieval fallback failed",
          );
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
    summary?: string,
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
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));
    const translation =
      await this.translationService.translateToEnglish(message);
    const textForProcessing = translation.translatedText || message;
    const effectiveTools = tools;
    const messagesWithCurrent = [
      ...messages,
      { role: "user" as const, content: textForProcessing },
    ];
    let lastError: Error | null = null;
    for (const modelConfig of modelsToTry) {
      try {
        const systemPrompt = directToolSystemPrompt(timezone, userId, summary);
        const result = await generateText({
          model: modelConfig.instance,
          system: systemPrompt,
          messages: messagesWithCurrent,
          tools: effectiveTools,
          stopWhen: stepCountIs(8),
          maxSteps: 10,
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
