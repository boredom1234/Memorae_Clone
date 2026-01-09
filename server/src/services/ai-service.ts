import { generateText } from "ai";
import { ToolsRegistry } from "./tools-registry";
import { routeToTool } from "./tools/tool-router";
import { TranslationService } from "./translation-service";
import { ConversationMessage } from "../types/conversation";
import { systemPrompt } from "./ai/prompts";
import { enrichMessageWithContext } from "./ai/message-processor";
import { getDefaultModel, getFallbackModels } from "./ai/model-manager";
import { createLogger } from "../utils/logger";

export class AIService {
  private logger = createLogger({ component: "AIService" });
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
      `AI Service initialized with ${this.fallbackModels.length} fallback models`
    );
  }

  /**
   * Check if tool execution had failures that warrant a retry
   */
  private hasToolFailures(
    result: any,
    expectTools: boolean
  ): { failed: boolean; summary: string } {
    try {
      const toolCalls = result.toolCalls || [];
      const toolResults = result.toolResults || [];

      // If we expected tools but none were called
      if (expectTools && toolCalls.length === 0 && toolResults.length === 0) {
        // Relaxed: If AI gave a substantial response, treat as OK (maybe asked for clarification)
        if (result.text && result.text.length > 20) {
          return { failed: false, summary: "" };
        }
        return {
          failed: true,
          summary: "No tool was executed even though a tool was expected.",
        };
      }

      // Check for errors in tool results
      for (const tr of toolResults) {
        const output = tr?.output ?? tr;
        if (output?.success === false || output?.error) {
          return {
            failed: true,
            summary: `Tool failed: ${
              output.error || output.message || "unknown error"
            }`,
          };
        }
      }
    } catch (err: any) {
      this.logger.warn({ err }, "Error checking for tool failures");
    }
    return { failed: false, summary: "" };
  }

  /**
   * Build a repair context for self-healing retry
   */
  private buildRepairContext(
    selectedToolName: string,
    originalText: string,
    failureSummary: string
  ): string {
    return [
      "[SYSTEM REPAIR CONTEXT]",
      `Primary tool: ${selectedToolName}`,
      `Original request: "${originalText}"`,
      `Failure: ${failureSummary}`,
      "Instructions: Analyze the failure, fix parameters, and retry the tool.",
      "Use helper tools (parseNaturalLanguageDate, getCurrentTime, searchReminders, etc.) to resolve ambiguities.",
    ].join("\n");
  }

  /**
   * Main entry point for processing user messages.
   * Flow:
   * 1. Translate & Enrich Context
   * 2. Route to best tool using dedicated LLM router
   * 3. Get relevant tool group (primary + helpers)
   * 4. Execute with main LLM, with retry on failure
   */
  async processMessage(
    message: string,
    userId: string,
    timezone: string,
    toolsRegistry: ToolsRegistry,
    conversationHistory: ConversationMessage[] = [],
    summary?: string
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

    // 1. Prepare Input
    const translation = await this.translationService.translateToEnglish(
      message
    );
    const textForProcessing =
      (translation && translation.translatedText) || message;
    const textWithContext = enrichMessageWithContext(
      textForProcessing,
      conversationHistory
    );

    // 2. Route to best tool using dedicated router
    const toolDefinitions = toolsRegistry.getToolDefinitions(userId);
    const selectedToolName = await routeToTool(
      textWithContext,
      toolDefinitions
    );

    this.logger.info(
      { selectedToolName, queryLength: textWithContext.length },
      "Tool router result"
    );

    // 3. Get relevant tools
    const context = { originalMessage: textForProcessing, timezone };
    let tools: any;
    let willUseTools = false;

    if (selectedToolName === "no_tool_needed") {
      // Conversational mode - no tools
      tools = {};
      willUseTools = false;
    } else {
      // Get the primary tool + helper tools
      tools = toolsRegistry.getRelevantToolGroup(
        userId,
        selectedToolName,
        context
      );
      willUseTools =
        Object.keys(tools).filter((k) => k !== "__stats").length > 0;

      if (!willUseTools) {
        this.logger.warn(
          { selectedToolName },
          "Selected tool not found, falling back to conversational"
        );
      }
    }

    // 4. Prepare conversation messages
    const messages = conversationHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    // 5. Execute with LLM
    let lastError: Error | null = null;
    const MAX_STEPS = 10;

    for (const modelConfig of modelsToTry) {
      try {
        this.logger.info(
          {
            provider: modelConfig.provider,
            willUseTools,
            toolCount: Object.keys(tools).length,
          },
          `Attempting execution with ${modelConfig.provider}`
        );

        const prompt = systemPrompt(timezone, summary);

        // Limit response length to avoid hitting Telegram's 4096 char limit
        // 2048 tokens ≈ ~8000 chars (with buffer for chunking if needed)
        const MAX_TOKENS = 2048;

        let result = await generateText({
          model: modelConfig.instance,
          system: prompt,
          messages: [
            ...messages,
            { role: "user" as const, content: textWithContext },
          ],
          tools: willUseTools ? tools : undefined,
          maxSteps: MAX_STEPS,
          maxTokens: MAX_TOKENS,
        } as any);

        // Check for failures and attempt self-healing retry
        const failure = this.hasToolFailures(result, willUseTools);
        if (failure.failed) {
          this.logger.warn(
            { reason: failure.summary },
            "Tool execution failed, attempting self-healing retry"
          );

          const repairMessages = [
            ...messages,
            { role: "user" as const, content: textWithContext },
            {
              role: "assistant" as const,
              content: this.buildRepairContext(
                selectedToolName,
                textForProcessing,
                failure.summary
              ),
            },
          ];

          result = (await generateText({
            model: modelConfig.instance,
            system: prompt,
            messages: repairMessages,
            tools: willUseTools ? tools : undefined,
            maxSteps: MAX_STEPS,
          } as any)) as any;
        }

        const toolCalls = (result as any).toolCalls || [];
        const toolResults = (result as any).toolResults || [];
        const toolsExecuted = toolCalls.length > 0;

        // Generate fallback text if LLM didn't provide one after tool execution
        let finalText = result.text;
        if (
          (!finalText || finalText.trim().length === 0) &&
          toolResults.length > 0
        ) {
          const firstResult = toolResults[0]?.output ?? toolResults[0];
          if (firstResult?.message) {
            finalText = firstResult.message;
          } else if (firstResult?.success === true) {
            finalText = "Done!";
          } else if (firstResult?.success === false) {
            finalText = `I couldn't complete that: ${
              firstResult.error || "validation failed"
            }`;
          } else {
            finalText = "Processed your request.";
          }
        }

        this.logger.info(
          {
            provider: modelConfig.provider,
            toolCalls: toolCalls.length,
            responseLength: finalText?.length || 0,
          },
          "Execution successful"
        );

        return {
          text: finalText,
          toolCalls,
          toolResults,
          _toolsExecuted: toolsExecuted,
        };
      } catch (error: any) {
        lastError = error;
        this.logger.warn(
          { error: error.message, provider: modelConfig.provider },
          `Execution failed with ${modelConfig.provider}, trying next fallback`
        );
        continue;
      }
    }

    this.logger.error(
      { error: lastError?.message || "Unknown error" },
      "All AI models failed"
    );
    throw new Error(
      `AI service unavailable: ${lastError?.message || "All providers failed"}`
    );
  }

  /**
   * Process message with pre-defined tools (for special flows)
   */
  async processMessageWithTools(
    message: string,
    _userId: string,
    timezone: string,
    tools: any,
    conversationHistory: ConversationMessage[] = [],
    summary?: string
  ): Promise<{
    text: string;
    toolCalls: any[];
    toolResults: any[];
    _toolsExecuted?: boolean;
  }> {
    if (!this.defaultModel && this.fallbackModels.length === 0) {
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

    const translation = await this.translationService.translateToEnglish(
      message
    );
    const textForProcessing = translation.translatedText || message;

    let lastError: Error | null = null;

    for (const modelConfig of modelsToTry) {
      try {
        const prompt = systemPrompt(timezone, summary);

        const result = await generateText({
          model: modelConfig.instance,
          system: prompt,
          messages: [
            ...messages,
            { role: "user" as const, content: textForProcessing },
          ],
          tools: tools,
          maxSteps: 10,
        } as any);

        return {
          text: result.text,
          toolCalls: (result as any).toolCalls || [],
          toolResults: (result as any).toolResults || [],
          _toolsExecuted: ((result as any).toolCalls || []).length > 0,
        };
      } catch (error: any) {
        lastError = error;
        continue;
      }
    }

    throw new Error(
      `AI service unavailable: ${lastError?.message || "All providers failed"}`
    );
  }
}
