import { experimental_transcribe as transcribe } from "ai";
import { groq } from "@ai-sdk/groq";
import { config } from "../config/env";
import pino from "pino";

/**
 * Transcription Service
 * Handles audio transcription using Groq's Whisper model
 */
export class TranscriptionService {
  private logger = pino({ level: "info" });

  /**
   * Check if transcription service is available
   */
  isAvailable(): boolean {
    return !!config.ai.groqApiKey;
  }

  /**
   * Transcribe audio buffer to text
   * @param audioBuffer - Audio file buffer (supports mp3, mp4, mpeg, mpga, m4a, wav, webm)
   * @param language - ISO-639-1 language code (e.g., 'en', 'es', 'fr', 'hi'). If undefined, auto-detects language.
   * @returns Transcribed text
   */
  async transcribeAudio(
    audioBuffer: Buffer,
    language?: string,
  ): Promise<{
    success: boolean;
    text?: string;
    error?: string;
  }> {
    if (!this.isAvailable()) {
      return {
        success: false,
        error:
          "Transcription service not available. GROQ_API_KEY not configured.",
      };
    }

    try {
      this.logger.info(
        `Transcribing audio: ${audioBuffer.length} bytes, language: ${language || "auto-detect"}`,
      );

      // Build provider options - only include language if specified
      const providerOptions: any = {
        groq: {
          temperature: 0.2, // Lower temperature for more focused transcription
        },
      };

      // Only add language if explicitly provided, otherwise Whisper auto-detects
      if (language) {
        providerOptions.groq.language = language;
      }

      const result = await transcribe({
        model: groq.transcription("whisper-large-v3-turbo"),
        audio: audioBuffer,
        providerOptions,
      });

      if (!result.text || result.text.trim().length === 0) {
        return {
          success: false,
          error: "No speech detected in audio",
        };
      }

      // Log detected language if available (text may not display correctly in terminal for non-Latin scripts)
      const detectedLanguage = (result as any).language || "auto-detected";
      const textPreview =
        result.text.length > 50
          ? result.text.substring(0, 50) + "..."
          : result.text;

      this.logger.info(
        `Transcription successful - Language: ${detectedLanguage}, Length: ${result.text.length} chars`,
      );
      this.logger.debug(`Transcribed text preview: "${textPreview}"`);

      return {
        success: true,
        text: result.text.trim(),
      };
    } catch (error: any) {
      this.logger.error({ error }, "Failed to transcribe audio");
      return {
        success: false,
        error: error.message || "Unknown transcription error",
      };
    }
  }
}
