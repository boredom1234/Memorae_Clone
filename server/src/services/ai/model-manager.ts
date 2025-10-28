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
import { config } from "../../config/env";
import { createLogger } from "../../utils/logger";
const logger = createLogger({ component: "ModelManager" });
export function getDefaultModel(): any {
  const provider = config.ai.provider.toLowerCase();
  const model = config.ai.model;
  logger.info(`Configuring AI: Provider=${provider}, Model=${model}`);
  try {
    switch (provider) {
      case "openai":
        if (!config.ai.openaiApiKey)
          throw new Error("OpenAI API key not configured");
        logger.info(`Using OpenAI (${model})`);
        return openai(model);
      case "groq":
        if (!config.ai.groqApiKey)
          throw new Error("Groq API key not configured");
        logger.info(`Using Groq (${model})`);
        return groq(model);
      case "xai":
        if (!config.ai.xaiApiKey) throw new Error("xAI API key not configured");
        logger.info(`Using xAI (${model})`);
        return xai(model);
      case "google":
        if (!config.ai.googleApiKey)
          throw new Error("Google API key not configured");
        logger.info(`Using Google (${model})`);
        return google(model);
      case "anthropic":
        if (!config.ai.anthropicApiKey)
          throw new Error("Anthropic API key not configured");
        logger.info(`Using Anthropic (${model})`);
        return anthropic(model);
      case "deepseek":
        if (!config.ai.deepseekApiKey)
          throw new Error("DeepSeek API key not configured");
        logger.info(`Using DeepSeek (${model})`);
        return deepseek(model);
      case "mistral":
        if (!config.ai.mistralApiKey)
          throw new Error("Mistral API key not configured");
        logger.info(`Using Mistral (${model})`);
        return mistral(model);
      case "togetherai":
        if (!config.ai.togetheraiApiKey)
          throw new Error("Together.ai API key not configured");
        logger.info(`Using Together.ai (${model})`);
        return togetherai(model);
      case "cohere":
        if (!config.ai.cohereApiKey)
          throw new Error("Cohere API key not configured");
        logger.info(`Using Cohere (${model})`);
        return cohere(model);
      case "fireworks":
        if (!config.ai.fireworksApiKey)
          throw new Error("Fireworks API key not configured");
        logger.info(`Using Fireworks (${model})`);
        return fireworks(model);
      case "deepinfra":
        if (!config.ai.deepinfraApiKey)
          throw new Error("DeepInfra API key not configured");
        logger.info(`Using DeepInfra (${model})`);
        return deepinfra(model);
      case "cerebras":
        if (!config.ai.cerebrasApiKey)
          throw new Error("Cerebras API key not configured");
        logger.info(`Using Cerebras (${model})`);
        return cerebras(model);
      case "azure":
        if (
          !config.ai.azureApiKey ||
          !config.ai.azureResourceName ||
          !config.ai.azureDeploymentName
        ) {
          throw new Error("Azure OpenAI not fully configured");
        }
        logger.info(`Using Azure OpenAI (${config.ai.azureDeploymentName})`);
        return azure(config.ai.azureDeploymentName);
      case "vertex":
        if (!config.ai.vertexProjectId || !config.ai.vertexLocation) {
          throw new Error("Google Vertex AI not fully configured");
        }
        logger.info(`Using Google Vertex AI (${model})`);
        return vertex(model);
      default:
        throw new Error(`Unknown AI provider: ${provider}`);
    }
  } catch (error: any) {
    logger.error(`Failed to configure AI provider: ${error.message}`);
    logger.warn("AI features will not work.");
    return null;
  }
}
export function getFallbackModels(): any[] {
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
      logger.info(
        `Added fallback: ${fallbackConfig.provider} (${fallbackConfig.model})`,
      );
    } catch (error) {
      logger.warn(
        `Failed to configure fallback ${fallbackConfig.provider}: ${error}`,
      );
    }
  }
  return fallbacks;
}
