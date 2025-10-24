import { generateText } from "ai";
import { groq } from "@ai-sdk/groq";
import { config } from "../config/env";
import pino from "pino";
export class TranslationService {
  private logger = pino({ level: "info" });
  isAvailable(): boolean {
    return !!config.ai.groqApiKey;
  }
  private asciiEnglishLike(text: string): boolean {
    const asciiChars = text.split("").filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code <= 126;
    }).length;
    const ratio = asciiChars / Math.max(1, text.length);
    return ratio > 0.95;
  }
  async detectLanguage(text: string): Promise<{
    lang: string;
    confidence?: number;
    method: "llm" | "ascii-fallback" | "unknown";
  }> {
    if (!text || text.trim().length === 0) {
      return { lang: "en", method: "unknown" };
    }
    if (this.isAvailable()) {
      try {
        const { text: out } = await generateText({
          model: groq("llama-3.1-8b-instant"),
          prompt:
            'Detect the language of the following text and output ONLY a lowercase ISO 639-1 code (e.g., "en", "es", "fr", "de", "hi"). If uncertain, guess the closest.\n\nText:\n' +
            text +
            "\n\ncode:",
          temperature: 0,
        });
        const code = out
          .trim()
          .toLowerCase()
          .replace(/[^a-z]/g, "");
        if (code.length === 2) {
          return { lang: code, confidence: 0.8, method: "llm" };
        }
      } catch (error: any) {
        this.logger.warn(
          { error: error?.message },
          "LLM language detection failed; falling back to ASCII heuristic",
        );
      }
    }
    return {
      lang: this.asciiEnglishLike(text) ? "en" : "und",
      confidence: 0.3,
      method: "ascii-fallback",
    };
  }
  async translateToEnglish(text: string): Promise<{
    success: boolean;
    translatedText?: string;
    originalText: string;
    wasTranslated: boolean;
    detectedLanguage?: string;
    error?: string;
  }> {
    // Quick ASCII check first - if mostly ASCII, assume English and skip translation
    if (this.asciiEnglishLike(text)) {
      this.logger.info("Text appears to be English (ASCII check), skipping translation");
      return {
        success: true,
        translatedText: text,
        originalText: text,
        wasTranslated: false,
        detectedLanguage: "en",
      };
    }
    
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
      const detection = await this.detectLanguage(text);
      const lang = detection.lang || "und";
      if (lang === "en") {
        this.logger.info("Detected English language, skipping translation");
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
        prompt: `You are a professional and friendly translator. Translate the following text to English. 
        
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
        detectedLanguage: lang,
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
