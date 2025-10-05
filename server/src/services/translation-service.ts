import { generateText } from "ai";
import { groq } from "@ai-sdk/groq";
import { config } from "../config/env";
import pino from "pino";
export class TranslationService {
  private logger = pino({ level: "info" });
  isAvailable(): boolean {
    return !!config.ai.groqApiKey;
  }
  private isEnglish(text: string): boolean {
    const asciiChars = text.split("").filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code <= 126;
    }).length;
    const ratio = asciiChars / text.length;
    return ratio > 0.8;
  }
  async translateToEnglish(text: string): Promise<{
    success: boolean;
    translatedText?: string;
    originalText: string;
    wasTranslated: boolean;
    detectedLanguage?: string;
    error?: string;
  }> {
    if (!this.isAvailable()) {
      return {
        success: true,
        translatedText: text,
        originalText: text,
        wasTranslated: false,
        error: "Translation service not available, using original text",
      };
    }
    try {
      if (this.isEnglish(text)) {
        this.logger.info("Text appears to be in English, skipping translation");
        return {
          success: true,
          translatedText: text,
          originalText: text,
          wasTranslated: false,
          detectedLanguage: "en",
        };
      }
      this.logger.info(
        `Translating text to English: "${text.substring(0, 50)}..."`,
      );
      const result = await generateText({
        model: groq("llama-3.1-8b-instant"),
        prompt: `You are a professional translator. Translate the following text to English. 
        
IMPORTANT RULES:
1. Only output the English translation, nothing else
2. Preserve the meaning and intent exactly
3. If it's a command or request, translate it as a command
4. Do not add explanations or extra text
5. If the text is already in English, return it as-is

Text to translate:
${text}

English translation:`,
        temperature: 0.3,
      });
      const translatedText = result.text.trim();
      this.logger.info(
        `Translation successful - Original: "${text.substring(0, 30)}...", Translated: "${translatedText.substring(0, 30)}..."`,
      );
      return {
        success: true,
        translatedText,
        originalText: text,
        wasTranslated: true,
        detectedLanguage: "non-en",
      };
    } catch (error: any) {
      this.logger.error({ error }, "Failed to translate text");
      return {
        success: true,
        translatedText: text,
        originalText: text,
        wasTranslated: false,
        error: error.message || "Translation failed, using original text",
      };
    }
  }
}
