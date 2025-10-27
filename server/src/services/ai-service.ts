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
    const timeframeMap: Record<
      string,
      "today" | "tomorrow" | "week" | "month"
    > = {
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
      const prev = [...conversationHistory]
        .reverse()
        .find((m) => m.role === "user" || m.role === "assistant");
      const prevText = prev?.content?.toLowerCase() || "";
      if (
        /reminder|upcoming|what.*reminders|show.*reminders|list.*reminders/.test(
          prevText,
        )
      ) {
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
    const original = message.toLowerCase().trim();
    const text = original.replace(
      /^(?:lmao|lol|haha|hey|hi|hello|ok|okay|pls|please|uh|um|hmm)[,!.\s]+/i,
      "",
    );
    if (
      /\b(remember(?: (?:this|that))?|take a note|make (?:a )?note|note:|note this|note that|save (?:this|that)|store (?:this|that)|keep track)\b/i.test(
        text,
      )
    ) {
      return true;
    }
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
      /^(remind (me|us)\b|remind me to\b|set (a )?reminder\b|set (a )?timer\b|set (a|an )?alarm\b|schedule (a )?(reminder|alarm)\b|wake me\b|alert me\b|notify me\b|timer for\b)/.test(
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
      /\b(remember(?: (?:this|that))?|take a note|make (?:a )?note|note:|note this|note that|save (?:this|that)|store (?:this|that)|keep track)\b/i.test(
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
    if (selectedToolNameFromRouter === "no_tool_needed") {
      const heuristic = this.heuristicToolSelection(textForRouting);
      const allowHeuristic = commandLike || heuristic === "createNote";
      if (heuristic !== "no_tool_needed" && allowHeuristic) {
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
${summary ? `- Conversation summary (condensed prior messages):\n${summary}` : ""}

Important:
- Be warm and conversational, not robotic
- If the user seems to want to create/modify data but the request is unclear, ask friendly follow-up questions
- Never claim you performed an action (created/updated/deleted) unless you actually did
- For ambiguous action requests, clarify what they want first
- If the user refers to earlier messages, use the conversation summary and history; if insufficient, ask them to restate.`,
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
            system: `You are a helpful AI assistant. Be friendly and concise. If the user's request is ambiguous regarding creating reminders, lists, or notes, ask for a short confirmation instead of acting. Timezone: ${timezone}.

Important: You do not have tool access for this request. Do NOT claim you created, updated, or deleted anything.`,
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
        const systemPrompt = willUseTools
          ? `You are Memorae, a helpful and friendly AI assistant for task and memory management.

You have multiple tools available to help with this request. The PRIMARY tool is "${selectedToolName}", but you also have helper tools available.

User's request: "${textForProcessing}"

Your approach:
1. **THINK FIRST**: Break down the request into steps
   - What information do I need?
   - Do I need to check current time first?
   - Are there complex time expressions to parse?
   - What's the main action to take?
   - Do I need to perform calculations (e.g., time differences)?

2. **USE MULTIPLE TOOLS to build complete answers**:
   - For "time left" or "how long until" questions → Call BOTH listReminders/getUpcomingReminders OR searchReminders (to find the specific reminder) AND getCurrentTime, then calculate the difference
   - If time context is unclear or user mentions "from now", call getCurrentTime first
   - Use helper tools to gather context before taking action
   - Chain multiple tools together to build the complete solution
   - ALWAYS provide calculated results, not just raw tool outputs

3. **PERFORM CALCULATIONS when needed**:
   - If user asks "time left" or "how long until", you MUST:
     a) Obtain the target reminder time via listReminders/getUpcomingReminders or searchReminders
     b) Get current time from getCurrentTime
     c) Calculate the difference (in hours/minutes/seconds)
     d) If the reminder time is in the past, report it as "overdue by X" instead of "remaining"
     e) Format it nicely: "1 hour, 7 minutes, and 16 seconds remaining"
   - Don't just return the raw times - do the math!

3.5 **Reminder selection policy**:
   - If the user mentions a specific title or keyword, use searchReminders with that query and pick the closest fuzzy match.
   - If no specific title is given, pick the nearest upcoming pending reminder.
   - If multiple matches are equally plausible, ask a brief clarification unless one occurs much sooner than the others.

4. **Extract ALL relevant details** from the user's message:
   - Times, dates, priorities from context
   - For reminders: ALWAYS extract time info via naturalTimeText (use "now", "in 1 minute" if no explicit time given)
   - For lists: ALWAYS extract list name from message (e.g., "shopping list", "todo", "groceries")
   - For notes: ALWAYS extract content from message, infer category from context
   - Infer reasonable defaults when appropriate
   - Use natural language understanding liberally and be generous in parameter extraction

5. **CRITICAL: ALWAYS provide a text response after tool execution**:
   - NEVER leave the response empty after calling tools
   - ALWAYS summarize what you found/did in natural language
   - Example: "Done! I've added milk to your groceries list."
   - Example: "Got it! I'll remind you about the dentist appointment tomorrow at 2pm."
   - Example: "Your reminder 'Launch Tom' is in 1 hour, 7 minutes, and 16 seconds." (after calculating time difference from tool results)
   - Example: "'Launch Tom' was due 12 minutes ago (overdue by 12 minutes)."
   - If you called multiple tools, combine their results into a coherent answer

6. **Be flexible with natural language**:
   - "tomorrow afternoon" → infer reasonable time (2pm)
   - "tonight" → infer evening time (8pm)
   - "1 hour 43 minutes from now" → extract duration properly
   - "buy milk" when discussing shopping → should add to shopping list

7. **Special cases**:
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
${summary ? `- Conversation summary (condensed prior messages):\n${summary}` : ""}

IMPORTANT: Be helpful and proactive. If the user clearly wants something done, do it. Only ask for clarification if the request is genuinely ambiguous.`
          : `You are Memorae, a helpful and friendly AI assistant. Be conversational, warm, and helpful.

The user said: "${textForProcessing}"

Respond naturally and helpfully. Be friendly and engaging, not robotic.

Context:
- User timezone: ${timezone}
- Current time: ${new Date().toISOString()}
${summary ? `- Conversation summary (condensed prior messages):\n${summary}` : ""}`;
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
          const isTimeLeftQuery =
            /\b(time left|how long|how much time|remaining time|time until)\b/i.test(
              textForProcessing,
            );
          const looksGeneric =
            !result.text || /processed your request\.?/i.test(finalText || "");
          if (willUseTools && isTimeLeftQuery && looksGeneric) {
            this.logger.info(
              "Applying deterministic fallback for time-left query",
            );
            let currentTimeISO: string | null = null;
            try {
              const ctRes = (result.toolResults || []).find(
                (r: any) => r?.toolName === "getCurrentTime",
              );
              currentTimeISO = ctRes?.output?.currentTime || null;
            } catch {}
            if (!currentTimeISO) {
              const ct = await toolsRegistry.executeTool("getCurrentTime", {
                timezone,
              });
              currentTimeISO = ct?.currentTime || new Date().toISOString();
            }
            const quoted = (
              textForProcessing.match(/"([^"]+)"|'([^']+)'/) || []
            )
              .slice(1)
              .find(Boolean);
            let target: {
              title: string;
              reminder_time: string;
            } | null = null;
            if (quoted) {
              const sr = await toolsRegistry.executeTool("searchReminders", {
                userId,
                query: quoted,
                limit: 5,
              });
              const candidates: any[] = sr?.results || [];
              const nowMs = currentTimeISO
                ? new Date(currentTimeISO).getTime()
                : Date.now();
              target =
                candidates
                  .map((r) => ({
                    title: r.title,
                    reminder_time: r.reminder_time || r.reminderTime,
                  }))
                  .filter(
                    (r) =>
                      r.reminder_time &&
                      new Date(r.reminder_time).getTime() > nowMs,
                  )
                  .sort(
                    (a, b) =>
                      new Date(a.reminder_time).getTime() -
                      new Date(b.reminder_time).getTime(),
                  )[0] || null;
              if (!target && candidates.length > 0) {
                const r0 = candidates[0];
                target = {
                  title: r0.title,
                  reminder_time: r0.reminder_time || r0.reminderTime,
                };
              }
            }
            if (!target) {
              const lr = await toolsRegistry.executeTool("listReminders", {
                userId,
                status: "pending",
                limit: 20,
              });
              const items: any[] = lr?.results || lr?.reminders || [];
              const nowMs = currentTimeISO
                ? new Date(currentTimeISO).getTime()
                : Date.now();
              target =
                items
                  .map((r) => ({
                    title: r.title,
                    reminder_time: r.reminder_time || r.reminderTime,
                  }))
                  .filter(
                    (r) =>
                      r.reminder_time &&
                      new Date(r.reminder_time).getTime() > nowMs,
                  )
                  .sort(
                    (a, b) =>
                      new Date(a.reminder_time).getTime() -
                      new Date(b.reminder_time).getTime(),
                  )[0] || null;
            }
            if (target && target.reminder_time) {
              const now = currentTimeISO
                ? new Date(currentTimeISO).getTime()
                : Date.now();
              const due = new Date(target.reminder_time).getTime();
              const diffMs = due - now;
              const absMs = Math.abs(diffMs);
              const sec = Math.floor(absMs / 1000) % 60;
              const min = Math.floor(absMs / (1000 * 60)) % 60;
              const hrs = Math.floor(absMs / (1000 * 60 * 60));
              const parts = [] as string[];
              if (hrs > 0) parts.push(`${hrs} hour${hrs !== 1 ? "s" : ""}`);
              if (min > 0) parts.push(`${min} minute${min !== 1 ? "s" : ""}`);
              if (sec > 0 || parts.length === 0)
                parts.push(`${sec} second${sec !== 1 ? "s" : ""}`);
              const formatted = parts
                .join(", ")
                .replace(/, (?=[^,]*$)/, ", and ");
              if (diffMs >= 0) {
                finalText = `Your reminder${quoted ? ` "${quoted}"` : target.title ? ` "${target.title}"` : ""} is in ${formatted}.`;
              } else {
                finalText = `Your reminder${quoted ? ` "${quoted}"` : target.title ? ` "${target.title}"` : ""} was due ${formatted} ago (overdue).`;
              }
            } else {
              finalText =
                "I couldn't find an upcoming reminder to calculate the time left. Please specify the reminder title or create one.";
            }
          }
        } catch (e: any) {
          this.logger.warn(
            { error: e?.message },
            "Deterministic time-left fallback failed",
          );
        }
        try {
          const looksGenericText =
            !finalText ||
            /^(processed your request\.?|done\.?)$/i.test(finalText.trim());
          if (willUseTools && looksGenericText) {
            const lower = (textForProcessing || "").toLowerCase();
            if (/\b(show|list|what|my)\b.*\breminders?\b/.test(lower)) {
              let timeframe: "today" | "tomorrow" | "week" | "month" | null =
                null;
              if (/\btoday'?s?|\btoday\b/.test(lower)) timeframe = "today";
              else if (/\btomorrow'?s?|\btomorrow\b/.test(lower))
                timeframe = "tomorrow";
              else if (/\bthis\s+week\b|\bweek\b/.test(lower))
                timeframe = "week";
              else if (/\bthis\s+month\b|\bmonth\b/.test(lower))
                timeframe = "month";
              if (timeframe) {
                const up = await toolsRegistry.executeTool(
                  "getUpcomingReminders",
                  {
                    userId,
                    timeframe,
                    limit: 10,
                  },
                );
                const arr: any[] = up?.reminders || [];
                if (arr.length === 0) {
                  finalText = `You have no ${timeframe} reminders.`;
                } else {
                  const lines = arr.map(
                    (r: any, i: number) =>
                      `${i + 1}. ${r.title} - ${r.reminderTimeFormatted}${r.timeUntil ? ` (in ${r.timeUntil})` : ""}`,
                  );
                  finalText = `Here ${arr.length === 1 ? "is" : "are"} your ${timeframe} reminder${arr.length === 1 ? "" : "s"}:\n${lines.join("\n")}`;
                }
              } else {
                const lr = await toolsRegistry.executeTool("listReminders", {
                  userId,
                  status: "pending",
                  limit: 10,
                });
                const arr: any[] = lr?.reminders || [];
                if (arr.length === 0) {
                  finalText = "You have no pending reminders.";
                } else {
                  const lines = arr.map(
                    (r: any, i: number) =>
                      `${i + 1}. ${r.title} - ${r.reminderTimeFormatted || r.reminderTime}`,
                  );
                  finalText = `Your pending reminders:\n${lines.join("\n")}`;
                }
              }
            }
            if (
              !finalText ||
              /^(processed your request\.?|done\.?)$/i.test(finalText.trim())
            ) {
              if (/\b(show|list|what|my)\b.*\blists\b/.test(lower)) {
                const res = await toolsRegistry.executeTool("getLists", {
                  userId,
                  limit: 20,
                });
                const lists: any[] = res?.lists || [];
                if (lists.length === 0) {
                  finalText = "You don't have any lists yet.";
                } else {
                  const lines = lists.map(
                    (l: any, i: number) =>
                      `${i + 1}. ${l.name}${l.description ? ` - ${l.description}` : ""}`,
                  );
                  finalText = `Your lists:\n${lines.join("\n")}`;
                }
              }
            }
            if (
              !finalText ||
              /^(processed your request\.?|done\.?)$/i.test(finalText.trim())
            ) {
              const m = lower.match(
                /(?:what(?:'| i)?s|show|list|display|view|get)\s+(?:on|in)\s+(?:my\s+)?([^\n]+?)\s+list/,
              );
              if (m && m[1]) {
                const listName = m[1].trim();
                const res = await toolsRegistry.executeTool("getListItems", {
                  userId,
                  listName,
                  includeCompleted: false,
                });
                const items: any[] = res?.items || [];
                if (items.length === 0) {
                  finalText = `Your "${listName}" list is empty.`;
                } else {
                  const lines = items.map(
                    (it: any, i: number) =>
                      `${i + 1}. ${it.isCompleted ? "✅" : "⬜"} ${it.content}`,
                  );
                  finalText = `Here is your "${listName}" list:\n${lines.join("\n")}`;
                }
              }
            }
            if (
              !finalText ||
              /^(processed your request\.?|done\.?)$/i.test(finalText.trim())
            ) {
              if (/\b(show|list)\b.*\b(notes|memories)\b/.test(lower)) {
                const res = await toolsRegistry.executeTool("listNotes", {
                  userId,
                  limit: 20,
                });
                const notes: any[] = res?.notes || [];
                if (notes.length === 0) {
                  finalText = "You have no notes.";
                } else {
                  const lines = notes.map(
                    (n: any, i: number) =>
                      `${i + 1}. ${n.title ? n.title + ": " : ""}${(n.content || "").slice(0, 80)}${(n.content || "").length > 80 ? "..." : ""}`,
                  );
                  finalText = `Your notes:\n${lines.join("\n")}`;
                }
              } else {
                const ms = lower.match(
                  /\b(search|find)\b.*\bnotes?\b.*(?:for\s+)?"?([^"\n]+)"?/,
                );
                if (ms && ms[2]) {
                  const query = ms[2];
                  const res = await toolsRegistry.executeTool("searchNotes", {
                    userId,
                    query,
                    limit: 20,
                  });
                  const results: any[] = res?.notes || res?.results || [];
                  if (results.length === 0) {
                    finalText = `No notes found for "${query}".`;
                  } else {
                    const lines = results.map(
                      (n: any, i: number) =>
                        `${i + 1}. ${n.title ? n.title + ": " : ""}${(n.content || n.excerpt || "").slice(0, 80)}${(n.content || n.excerpt || "").length > 80 ? "..." : ""}`,
                    );
                    finalText = `Found ${results.length} note${results.length === 1 ? "" : "s"} for "${query}":\n${lines.join("\n")}`;
                  }
                }
              }
            }
            if (
              !finalText ||
              /^(processed your request\.?|done\.?)$/i.test(finalText.trim())
            ) {
              const mediaTypeMatch = lower.match(
                /\b(images?|photos?|pictures?)\b|\baudio\b|\bvideos?\b|\bdocuments?\b/,
              );
              if (
                /\b(show|list|what)\b.*\b(media|attachments?)\b/.test(lower) ||
                mediaTypeMatch
              ) {
                let mediaType:
                  | "image"
                  | "audio"
                  | "video"
                  | "document"
                  | undefined;
                if (mediaTypeMatch) {
                  const t = mediaTypeMatch[0];
                  if (/images?|photos?|pictures?/.test(t)) mediaType = "image";
                  else if (/audio/.test(t)) mediaType = "audio";
                  else if (/videos?/.test(t)) mediaType = "video";
                  else if (/documents?/.test(t)) mediaType = "document";
                }
                const res = await toolsRegistry.executeTool("getMediaHistory", {
                  userId,
                  mediaType,
                  limit: 10,
                });
                const list: any[] =
                  res?.attachments || res?.history || res?.media || [];
                if (!list || list.length === 0) {
                  finalText = `No ${mediaType || "recent"} media found.`;
                } else {
                  const lines = list.map(
                    (m: any, i: number) =>
                      `${i + 1}. ${(m.media_type || m.mediaType || "file").toString()} - ${(m.file_url || m.fileUrl || m.title || "").toString().slice(0, 60)}`,
                  );
                  finalText = `Your ${mediaType || "recent"} media:\n${lines.join("\n")}`;
                }
              }
            }
            if (
              !finalText ||
              /^(processed your request\.?|done\.?)$/i.test(finalText.trim())
            ) {
              if (
                /\b(my\s+settings|my\s+timezone|my\s+language|quiet\s+hours)\b/.test(
                  lower,
                )
              ) {
                const res = await toolsRegistry.executeTool("getUserSettings", {
                  userId,
                });
                const tz = res?.timezone || timezone || "UTC";
                const parts: string[] = [];
                parts.push(`- Timezone: ${tz}`);
                parts.push(`- Language: ${res?.language || "en"}`);
                if (res?.defaultReminderTime)
                  parts.push(
                    `- Default reminder time: ${res.defaultReminderTime}`,
                  );
                if (res?.notificationPreferences) {
                  const np = res.notificationPreferences;
                  parts.push(
                    `- Notifications: ${np.enabled === true ? "enabled" : "disabled"}${np.enabled && typeof np.advanceNotice !== "undefined" ? ` (advance notice: ${np.advanceNotice} min)` : ""}`,
                  );
                }
                if (res?.quietHours?.enabled) {
                  const qh = res.quietHours;
                  const days =
                    Array.isArray(qh.days) && qh.days.length > 0
                      ? ` (${qh.days.join(", ")})`
                      : "";
                  parts.push(
                    `- Quiet hours: ${qh.startTime || "?"} - ${qh.endTime || "?"}${days}`,
                  );
                }
                finalText = `Here are your key settings:\n${parts.join("\n")}`;
              }
            }
          }
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
Current time (UTC): ${new Date().toISOString()}
${summary ? `Conversation summary (condensed prior messages):\n${summary}` : ""}`;
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
