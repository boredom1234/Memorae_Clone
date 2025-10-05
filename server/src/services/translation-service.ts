import { generateText } from "ai";
import { groq } from "@ai-sdk/groq";
import { config } from "../config/env";
import pino from "pino";

/**
 * Translation Service
 * Translates text to English using AI for better tool execution
 */
export class TranslationService {
  private logger = pino({ level: "info" });

  /**
   * Check if translation service is available
   */
  isAvailable(): boolean {
    return !!config.ai.groqApiKey;
  }

  /**
   * Detect if text is in English or needs translation
   * @param text - Text to check
   * @returns true if text appears to be in English
   */
  private isEnglish(text: string): boolean {
    // Simple heuristic: if text contains mostly ASCII characters, it's likely English
    const asciiChars = text.split("").filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code <= 126; // Printable ASCII range
    }).length;

    const ratio = asciiChars / text.length;
    return ratio > 0.8; // If 80%+ ASCII, consider it English
  }

  /**
   * Translate text to English if needed
   * @param text - Text to translate
   * @returns Translated text in English
   */
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
      // Check if text is already in English
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
        model: groq("llama-3.1-8b-instant"), // Fast model for translation
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
        temperature: 0.3, // Low temperature for consistent translation
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
      // Fallback: return original text if translation fails
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
