import { generateText } from "ai";
import { mistral } from "@ai-sdk/mistral";
import { config } from "../config/env";
import pino from "pino";
export interface OCRResult {
  success: boolean;
  extractedText: string;
  error?: string;
  confidence?: number;
}
export class OCRService {
  private logger = pino({ level: "info" });
  private model: any;
  constructor() {
    if (config.ai.mistralApiKey) {
      this.model = mistral("pixtral-large-latest");
      this.logger.info("OCR Service initialized with Mistral Pixtral");
    } else {
      this.logger.warn(
        "Mistral API key not configured. OCR features will not work.",
      );
    }
  }
  async extractTextFromImage(
    imageBuffer: Buffer,
    userPrompt?: string,
    mimeType: string = "image/jpeg",
  ): Promise<OCRResult> {
    if (!this.model) {
      return {
        success: false,
        extractedText: "",
        error:
          "OCR service not available. Please configure MISTRAL_API_KEY in your .env file.",
      };
    }
    try {
      this.logger.info(
        `Starting OCR extraction. Buffer size: ${imageBuffer.length} bytes, MIME: ${mimeType}`,
      );
      const base64Image = imageBuffer.toString("base64");
      const dataUrl = `data:${mimeType};base64,${base64Image}`;
      const defaultPrompt = `Please extract all visible text from this image. 
If it's a list, preserve the list structure. 
If it's a document, maintain the formatting and structure.
If it's a receipt or invoice, extract all items and amounts.
Be thorough and accurate.`;
      const finalPrompt = userPrompt || defaultPrompt;
      this.logger.info("Sending image to Mistral for OCR...");
      const result = await generateText({
        model: this.model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: finalPrompt,
              },
              {
                type: "image",
                image: dataUrl,
              },
            ],
          },
        ],
        maxSteps: 1,
      });
      const extractedText = result.text.trim();
      if (!extractedText || extractedText.length === 0) {
        return {
          success: false,
          extractedText: "",
          error: "No text could be extracted from the image.",
        };
      }
      this.logger.info(
        `OCR successful. Extracted ${extractedText.length} characters`,
      );
      return {
        success: true,
        extractedText,
        confidence: 0.9,
      };
    } catch (error: any) {
      this.logger.error({ error }, "OCR extraction failed");
      return {
        success: false,
        extractedText: "",
        error: `OCR failed: ${error.message || "Unknown error"}`,
      };
    }
  }
  async processImageWithInstruction(
    imageBuffer: Buffer,
    instruction: string,
    mimeType: string = "image/jpeg",
  ): Promise<{
    success: boolean;
    ocrText: string;
    interpretation: string;
    error?: string;
  }> {
    if (!this.model) {
      return {
        success: false,
        ocrText: "",
        interpretation: "",
        error: "OCR service not available. Please configure MISTRAL_API_KEY.",
      };
    }
    try {
      this.logger.info(
        `Processing image with instruction: "${instruction.substring(0, 50)}..."`,
      );
      const base64Image = imageBuffer.toString("base64");
      const dataUrl = `data:${mimeType};base64,${base64Image}`;
      const prompt = `You are analyzing an image. The user wants you to: "${instruction}"

First, extract all visible text from the image accurately.
Then, interpret the content based on the user's instruction.

Format your response as:
--- EXTRACTED TEXT ---
[All text from the image]

--- INTERPRETATION ---
[Your interpretation based on the user's instruction]`;
      const result = await generateText({
        model: this.model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt,
              },
              {
                type: "image",
                image: dataUrl,
              },
            ],
          },
        ],
        maxSteps: 1,
      });
      const response = result.text.trim();
      const extractedTextMatch = response.match(
        /--- EXTRACTED TEXT ---\s*([\s\S]*?)\s*--- INTERPRETATION ---/,
      );
      const interpretationMatch = response.match(
        /--- INTERPRETATION ---\s*([\s\S]*?)$/,
      );
      const ocrText = extractedTextMatch
        ? extractedTextMatch[1].trim()
        : response;
      const interpretation = interpretationMatch
        ? interpretationMatch[1].trim()
        : "";
      return {
        success: true,
        ocrText,
        interpretation: interpretation || ocrText,
      };
    } catch (error: any) {
      this.logger.error({ error }, "Image processing with instruction failed");
      return {
        success: false,
        ocrText: "",
        interpretation: "",
        error: `Processing failed: ${error.message || "Unknown error"}`,
      };
    }
  }
  isAvailable(): boolean {
    return !!this.model;
  }
}
