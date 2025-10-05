import { MessageContext } from "../../services/whatsapp";
import { User } from "../../models/types";
import { ConversationContext } from "../../types/conversation";
import { OCRService } from "../../services/ocr-service";
import { MediaAttachmentService } from "../../services/media-attachment-service";
import { AIService } from "../../services/ai-service";
import { ToolsRegistry } from "../../services/tools-registry";
import pino from "pino";

/**
 * Media Handler Module
 * Handles image and audio message processing
 */

export class MediaHandler {
  private logger = pino({ level: "info" });
  private ocrService: OCRService;
  private mediaService: MediaAttachmentService;
  private aiService: AIService;
  private tools: ToolsRegistry;

  constructor(
    ocrService: OCRService,
    mediaService: MediaAttachmentService,
    aiService: AIService,
    tools: ToolsRegistry,
  ) {
    this.ocrService = ocrService;
    this.mediaService = mediaService;
    this.aiService = aiService;
    this.tools = tools;
  }

  /**
   * Handle image messages with OCR support
   */
  async handleImageMessage(
    context: MessageContext,
    user: User,
    conversationContext: ConversationContext,
    addToContext: (
      userId: string,
      role: string,
      content: string,
      timestamp: Date,
    ) => void,
    getResponseMessage: (result: any, timezone?: string) => string,
  ): Promise<any> {
    this.logger.info("Image message received with OCR support");

    // Check if OCR service is available
    if (!this.ocrService.isAvailable()) {
      return {
        text: "📷 Image received, but OCR is not configured. Please set MISTRAL_API_KEY in your .env file to enable image text extraction.",
      };
    }

    // Check if image buffer is available
    if (!context.mediaBuffer) {
      this.logger.error("Image buffer not available");
      return {
        text: "Sorry, I couldn't process the image. Please try sending it again.",
      };
    }

    try {
      const caption = context.text || "";
      const mimeType = context.mimeType || "image/jpeg";

      this.logger.info(
        `Processing image: ${context.mediaBuffer.length} bytes, caption: "${caption}"`,
      );

      // If user provided instructions in caption, use them
      let ocrResult;
      if (caption && caption.trim().length > 0) {
        // User wants to do something with the image content
        this.logger.info(
          `User provided instruction: "${caption}". Processing with context...`,
        );

        const processed = await this.ocrService.processImageWithInstruction(
          context.mediaBuffer,
          caption,
          mimeType,
        );

        if (!processed.success) {
          return {
            text: `❌ Failed to process image: ${processed.error}`,
          };
        }

        // Save media attachment with OCR results
        let attachmentId: string | undefined;
        try {
          // Upload to Supabase Storage for permanent access
          const fileUrl = await this.uploadImageToStorage(
            user.id,
            context.messageId,
            context.mediaBuffer,
            mimeType,
          );

          const attachment = await this.mediaService.saveAttachment({
            userId: user.id,
            mediaType: "image",
            fileUrl: fileUrl,
            mimeType: mimeType,
            fileSize: context.mediaBuffer.length,
            extractedText: processed.ocrText,
            extractedData: {
              caption: caption,
              ocrEngine: "mistral-pixtral",
              processedAt: new Date().toISOString(),
              whatsappMessageId: context.messageId,
            },
          });
          attachmentId = attachment.id;
          this.logger.info(
            `Media attachment saved: ${attachmentId} with OCR text`,
          );
        } catch (error: any) {
          this.logger.error(
            { error },
            "Failed to save media attachment, continuing...",
          );
        }

        // Now pass the OCR text + user instruction to the AI
        const combinedPrompt = `I extracted the following text from an image:

--- IMAGE CONTENT ---
${processed.ocrText}

--- USER REQUEST ---
${caption}

Please help the user with their request based on the image content.`;

        // Add the combined prompt to conversation
        addToContext(user.id, "user", combinedPrompt, new Date());

        // Get relevant tools based on the user's instruction
        const tools = this.tools.getRelevantTools(user.id, caption);

        // Process with AI
        const aiResult = await this.aiService.processMessageWithTools(
          combinedPrompt,
          user.id,
          user.timezone,
          tools,
          conversationContext.messages,
        );

        // Format response
        const renderedText =
          aiResult.toolResults &&
          Array.isArray(aiResult.toolResults) &&
          aiResult.toolResults.length > 0
            ? getResponseMessage(
                aiResult.toolResults[aiResult.toolResults.length - 1],
                user.timezone,
              )
            : aiResult.text || getResponseMessage(aiResult, user.timezone);

        // Link media attachment to created items
        this.logger.info(
          `Media linking check - attachmentId: ${attachmentId}, hasToolResults: ${!!aiResult.toolResults}, toolResultsLength: ${aiResult.toolResults?.length || 0}`,
        );

        if (attachmentId && aiResult.toolResults) {
          try {
            this.logger.info(
              `Attempting to link media ${attachmentId}. Tool results count: ${aiResult.toolResults.length}`,
            );

            // Find created reminders
            const reminderResults = aiResult.toolResults.filter(
              (r: any) =>
                r.toolName === "createReminder" ||
                r.toolName === "batchCreateReminders",
            );

            if (reminderResults.length > 0) {
              const firstReminder = reminderResults[0];
              const reminderId = firstReminder.result?.id;

              if (reminderId) {
                await this.mediaService.linkToItem({
                  attachmentId,
                  reminderId,
                });
                this.logger.info(
                  `Linked media ${attachmentId} to reminder ${reminderId}`,
                );
              }
            }

            // Find created notes
            const noteResults = aiResult.toolResults.filter(
              (r: any) => r.toolName === "createNote",
            );

            this.logger.info(
              `Found ${noteResults.length} note creation results`,
            );

            if (noteResults.length > 0) {
              const firstNote = noteResults[0];
              this.logger.info(
                `Note result structure: ${JSON.stringify(firstNote)}`,
              );
              const noteId = firstNote.result?.id;

              if (noteId) {
                await this.mediaService.linkToItem({
                  attachmentId,
                  noteId,
                });
                this.logger.info(
                  `Linked media ${attachmentId} to note ${noteId}`,
                );
              } else {
                this.logger.warn(
                  `Note created but no ID found in result. Result: ${JSON.stringify(firstNote.result)}`,
                );
              }
            }

            // Find list operations
            const listResults = aiResult.toolResults.filter(
              (r: any) =>
                r.toolName === "addItemToList" || r.toolName === "createList",
            );

            if (listResults.length > 0) {
              this.logger.info(
                `Media ${attachmentId} used for list operations`,
              );
            }
          } catch (error: any) {
            this.logger.error(
              { error },
              "Failed to link media attachment to items",
            );
          }
        }

        // Add AI response to context
        if (renderedText) {
          addToContext(user.id, "assistant", renderedText, new Date());
        }

        return {
          text: aiResult.text,
          toolCalls: aiResult.toolCalls,
          toolResults: aiResult.toolResults,
          renderedText: renderedText || "Done!",
        };
      } else {
        // No caption - just extract and return the text
        this.logger.info("No caption provided. Performing simple OCR...");

        ocrResult = await this.ocrService.extractTextFromImage(
          context.mediaBuffer,
          undefined,
          mimeType,
        );

        if (!ocrResult.success) {
          return {
            text: `❌ Failed to extract text from image: ${ocrResult.error}`,
          };
        }

        // Save media attachment with OCR results
        try {
          // Upload to Supabase Storage for permanent access
          const fileUrl = await this.uploadImageToStorage(
            user.id,
            context.messageId,
            context.mediaBuffer,
            mimeType,
          );

          await this.mediaService.saveAttachment({
            userId: user.id,
            mediaType: "image",
            fileUrl: fileUrl,
            mimeType: mimeType,
            fileSize: context.mediaBuffer.length,
            extractedText: ocrResult.extractedText,
            extractedData: {
              ocrEngine: "mistral-pixtral",
              confidence: ocrResult.confidence,
              processedAt: new Date().toISOString(),
              whatsappMessageId: context.messageId,
            },
          });
          this.logger.info("Media attachment saved with OCR text");
        } catch (error: any) {
          this.logger.error(
            { error },
            "Failed to save media attachment, continuing...",
          );
        }

        const response = `📄 **Text extracted from image:**\n\n${ocrResult.extractedText}\n\n💡 *Tip: Send an image with a caption to tell me what to do with it!*\nExamples:\n- "Create reminders from this list"\n- "Add these items to my shopping list"\n- "Remember this information"`;

        return {
          text: response,
        };
      }
    } catch (error: any) {
      this.logger.error({ error }, "Error processing image with OCR");
      return {
        text: `Sorry, I encountered an error while processing the image: ${error.message}`,
      };
    }
  }

  /**
   * Handle audio messages
   */
  async handleAudioMessage(
    _context: MessageContext,
    _user: User,
  ): Promise<any> {
    this.logger.info("Audio message received");
    throw new Error("Voice transcription is not yet implemented. Coming soon!");
  }

  /**
   * Upload image to Supabase Storage
   */
  private async uploadImageToStorage(
    userId: string,
    messageId: string,
    imageBuffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    try {
      const extension = mimeType.split("/")[1] || "jpg";
      const fileName = `${userId}/${Date.now()}_${messageId}.${extension}`;

      // Upload to Supabase Storage
      const { supabase } = await import("../../lib/supabase");

      if (!supabase) {
        throw new Error("Supabase client not initialized");
      }

      const { data, error } = await supabase.storage
        .from("media") // Create this bucket in Supabase
        .upload(fileName, imageBuffer, {
          contentType: mimeType,
          upsert: false,
        });

      if (error) {
        this.logger.error({ error }, "Failed to upload image to storage");
        throw error;
      }

      if (!data) {
        throw new Error("No data returned from upload");
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("media").getPublicUrl(data.path);

      this.logger.info(`Image uploaded to storage: ${publicUrl}`);
      return publicUrl;
    } catch (error: any) {
      this.logger.error({ error }, "Error uploading image to storage");
      // Fallback to WhatsApp reference
      return `whatsapp://upload-failed/${messageId}`;
    }
  }
}
