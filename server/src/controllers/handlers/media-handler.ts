import { MessageContext } from "../../services/whatsapp";
import { User } from "../../models/types";
import { ConversationContext } from "../../types/conversation";
import { OCRService } from "../../services/ocr-service";
import { MediaAttachmentService } from "../../services/media-attachment-service";
import { AIService } from "../../services/ai-service";
import { ToolsRegistry } from "../../services/tools-registry";
import { TranscriptionService } from "../../services/transcription-service";
import { TranslationService } from "../../services/translation-service";
import pino from "pino";
export class MediaHandler {
  private logger = pino({ level: "info" });
  private ocrService: OCRService;
  private mediaService: MediaAttachmentService;
  private aiService: AIService;
  private tools: ToolsRegistry;
  private transcriptionService: TranscriptionService;
  private translationService: TranslationService;
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
    this.transcriptionService = new TranscriptionService();
    this.translationService = new TranslationService();
  }
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
    if (!this.ocrService.isAvailable()) {
      return {
        text: "📷 Image received, but OCR is not configured. Please set MISTRAL_API_KEY in your .env file to enable image text extraction.",
      };
    }
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
      let ocrResult;
      if (caption && caption.trim().length > 0) {
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
        let attachmentId: string | undefined;
        try {
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
        const combinedPrompt = `I extracted the following text from an image:

--- IMAGE CONTENT ---
${processed.ocrText}

--- USER REQUEST ---
${caption}

Please help the user with their request based on the image content.`;
        addToContext(user.id, "user", combinedPrompt, new Date());
        const tools = this.tools.getRelevantTools(user.id, caption);
        const aiResult = await this.aiService.processMessageWithTools(
          combinedPrompt,
          user.id,
          user.timezone,
          tools,
          conversationContext.messages,
        );
        const renderedText =
          aiResult.toolResults &&
          Array.isArray(aiResult.toolResults) &&
          aiResult.toolResults.length > 0
            ? getResponseMessage(
                aiResult.toolResults[aiResult.toolResults.length - 1],
                user.timezone,
              )
            : aiResult.text || getResponseMessage(aiResult, user.timezone);
        this.logger.info(
          `Media linking check - attachmentId: ${attachmentId}, hasToolResults: ${!!aiResult.toolResults}, toolResultsLength: ${aiResult.toolResults?.length || 0}`,
        );
        if (attachmentId && aiResult.toolResults) {
          try {
            this.logger.info(
              `Attempting to link media ${attachmentId}. Tool results count: ${aiResult.toolResults.length}`,
            );
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
        try {
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
  async handleAudioMessage(
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
    this.logger.info("Audio message received with transcription support");
    if (!this.transcriptionService.isAvailable()) {
      return {
        text: "🎤 Voice message received, but transcription is not configured. Please set GROQ_API_KEY in your .env file to enable voice transcription.",
      };
    }
    if (!context.mediaBuffer) {
      this.logger.error("Audio buffer not available");
      return {
        text: "Sorry, I couldn't process the voice message. Please try sending it again.",
      };
    }
    try {
      this.logger.info(`Processing audio: ${context.mediaBuffer.length} bytes`);
      const transcriptionResult =
        await this.transcriptionService.transcribeAudio(context.mediaBuffer);
      if (!transcriptionResult.success) {
        return {
          text: `❌ Failed to transcribe audio: ${transcriptionResult.error}`,
        };
      }
      const transcribedText = transcriptionResult.text!;
      this.logger.info(`Transcribed text: "${transcribedText}"`);
      const translationResult =
        await this.translationService.translateToEnglish(transcribedText);
      const textForProcessing =
        translationResult.translatedText || transcribedText;
      if (translationResult.wasTranslated) {
        this.logger.info(`Translated for processing: "${textForProcessing}"`);
      }
      addToContext(user.id, "user", transcribedText, new Date());
      const tools = this.tools.getRelevantTools(user.id, textForProcessing);
      const aiResult = await this.aiService.processMessageWithTools(
        textForProcessing,
        user.id,
        user.timezone,
        tools,
        conversationContext.messages,
      );
      const renderedText =
        aiResult.toolResults &&
        Array.isArray(aiResult.toolResults) &&
        aiResult.toolResults.length > 0
          ? getResponseMessage(
              aiResult.toolResults[aiResult.toolResults.length - 1],
              user.timezone,
            )
          : aiResult.text || getResponseMessage(aiResult, user.timezone);
      if (renderedText) {
        addToContext(user.id, "assistant", renderedText, new Date());
      }
      return {
        text: aiResult.text,
        toolCalls: aiResult.toolCalls,
        toolResults: aiResult.toolResults,
        renderedText: renderedText || "Done!",
        transcribedText: transcribedText,
        translatedText: translationResult.wasTranslated
          ? textForProcessing
          : undefined,
      };
    } catch (error: any) {
      this.logger.error({ error }, "Error processing audio with transcription");
      return {
        text: `Sorry, I encountered an error while processing the voice message: ${error.message}`,
      };
    }
  }
  private async uploadImageToStorage(
    userId: string,
    messageId: string,
    imageBuffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    try {
      const extension = mimeType.split("/")[1] || "jpg";
      const fileName = `${userId}/${Date.now()}_${messageId}.${extension}`;
      const { supabase } = await import("../../lib/supabase");
      if (!supabase) {
        throw new Error("Supabase client not initialized");
      }
      const { data, error } = await supabase.storage
        .from("media")
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
      const {
        data: { publicUrl },
      } = supabase.storage.from("media").getPublicUrl(data.path);
      this.logger.info(`Image uploaded to storage: ${publicUrl}`);
      return publicUrl;
    } catch (error: any) {
      this.logger.error({ error }, "Error uploading image to storage");
      return `whatsapp://upload-failed/${messageId}`;
    }
  }
}
