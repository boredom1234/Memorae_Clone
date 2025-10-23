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
  private isCommandLike(message: string): boolean {
    const text = (message || "").toLowerCase().trim();
    if (!text) return false;
    if (text.endsWith("?")) {
      if (
        /^(can you|could you|please)\s+(add|create|set|schedule|remind|remove|delete|list|show)\b/.test(
          text,
        )
      ) {
      } else {
        return false;
      }
    }
    if (
      /^(add|create|set|schedule|remind|remove|delete|list|show|make|note|remember)\b/.test(
        text,
      )
    ) {
      return true;
    }
    if (
      /^(can you|could you|please)\s+(add|create|set|schedule|remind|remove|delete|list|show)\b/.test(
        text,
      )
    ) {
      return true;
    }
    return false;
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
        const translation =
          await this.translationService.translateToEnglish(caption);
        const captionForTools = translation.translatedText || caption;
        const commandLike = this.isCommandLike(captionForTools);
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

--- USER REQUEST (original) ---
${caption}

--- USER REQUEST (english) ---
${captionForTools}

Please help the user with their request based on the image content. Be friendly and helpful in your response.`;
        addToContext(user.id, "user", combinedPrompt, new Date());
        const tools = commandLike
          ? this.tools.getRelevantTools(user.id, captionForTools)
          : ({} as any);
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
      const commandLike = this.isCommandLike(textForProcessing);
      const tools = commandLike
        ? this.tools.getRelevantTools(user.id, textForProcessing)
        : ({} as any);
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
  async handleMultipleImageMessages(
    contexts: MessageContext[],
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
    return await this.handleMultipleImages(
      contexts,
      user,
      conversationContext,
      addToContext,
      getResponseMessage,
    );
  }
  private async handleMultipleImages(
    contexts: MessageContext[],
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
    this.logger.info(`Processing batch of ${contexts.length} images for OCR`);
    const messageWithCaption = contexts.find(
      (ctx) => ctx.text && ctx.text.trim().length > 0,
    );
    const instruction =
      messageWithCaption?.text || "Extract text from all these images";
    this.logger.info(
      `Processing ${contexts.length} images with instruction: "${instruction}"`,
    );
    if (!this.ocrService.isAvailable()) {
      return {
        text: "📷 Images received, but OCR is not configured. Please set MISTRAL_API_KEY in your .env file to enable image text extraction.",
      };
    }
    try {
      const ocrResults: string[] = [];
      const attachmentIds: string[] = [];
      for (let i = 0; i < contexts.length; i++) {
        const context = contexts[i];
        if (!context.mediaBuffer) {
          this.logger.warn(
            `Image buffer not available for message ${context.messageId}`,
          );
          continue;
        }
        const caption = context.text || "";
        const mimeType = context.mimeType || "image/jpeg";
        this.logger.info(
          `Processing image ${i + 1}/${contexts.length}: ${context.mediaBuffer.length} bytes`,
        );
        let ocrResult;
        if (caption && caption.trim().length > 0) {
          ocrResult = await this.ocrService.processImageWithInstruction(
            context.mediaBuffer,
            caption,
            mimeType,
          );
        } else {
          ocrResult = await this.ocrService.extractTextFromImage(
            context.mediaBuffer,
            undefined,
            mimeType,
          );
        }
        if (ocrResult.success) {
          const extractedText =
            "ocrText" in ocrResult
              ? ocrResult.ocrText
              : ocrResult.extractedText;
          ocrResults.push(`--- Image ${i + 1} ---\n${extractedText}`);
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
              extractedText: extractedText,
              extractedData: {
                caption: caption,
                ocrEngine: "mistral-pixtral",
                processedAt: new Date().toISOString(),
                whatsappMessageId: context.messageId,
                batchIndex: i,
                batchSize: contexts.length,
              },
            });
            attachmentIds.push(attachment.id);
            this.logger.info(
              `Saved attachment ${attachment.id} for image ${i + 1}`,
            );
          } catch (error: any) {
            this.logger.error(
              { error },
              `Failed to save attachment for image ${i + 1}, continuing...`,
            );
          }
        } else {
          this.logger.error(
            `OCR failed for image ${i + 1}: ${ocrResult.error}`,
          );
          ocrResults.push(
            `--- Image ${i + 1} ---\nFailed to extract text: ${ocrResult.error}`,
          );
        }
      }
      if (ocrResults.length === 0) {
        return {
          text: "❌ Failed to extract text from any of the images.",
        };
      }
      const combinedText = ocrResults.join("\n\n");
      const translation =
        await this.translationService.translateToEnglish(instruction);
      const instructionForTools = translation.translatedText || instruction;
      const commandLike = this.isCommandLike(instructionForTools);
      const combinedPrompt = `I extracted text from ${contexts.length} images:

${combinedText}

User instruction (original): "${instruction}"
User instruction (english): "${instructionForTools}"

Please help the user with their request based on all the image content. Be friendly and helpful in your response.`;
      this.logger.info(
        `Combined OCR text from ${contexts.length} images, total length: ${combinedText.length} characters`,
      );
      addToContext(user.id, "user", combinedPrompt, new Date());
      const tools = commandLike
        ? this.tools.getRelevantTools(user.id, instructionForTools)
        : ({} as any);
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
      if (attachmentIds.length > 0 && aiResult.toolResults) {
        try {
          this.logger.info(
            `Linking ${attachmentIds.length} attachments to tool results`,
          );
          const noteResults = aiResult.toolResults.filter(
            (r: any) => r.toolName === "createNote",
          );
          if (noteResults.length > 0) {
            const firstNote = noteResults[0];
            const noteId = firstNote.result?.id;
            if (noteId) {
              for (const attachmentId of attachmentIds) {
                await this.mediaService.linkToItem({
                  attachmentId,
                  noteId,
                });
                this.logger.info(
                  `Linked attachment ${attachmentId} to note ${noteId}`,
                );
              }
            }
          }
          const reminderResults = aiResult.toolResults.filter(
            (r: any) =>
              r.toolName === "createReminder" ||
              r.toolName === "batchCreateReminders",
          );
          if (reminderResults.length > 0) {
            const firstReminder = reminderResults[0];
            const reminderId = firstReminder.result?.id;
            if (reminderId) {
              for (const attachmentId of attachmentIds) {
                await this.mediaService.linkToItem({
                  attachmentId,
                  reminderId,
                });
                this.logger.info(
                  `Linked attachment ${attachmentId} to reminder ${reminderId}`,
                );
              }
            }
          }
        } catch (error: any) {
          this.logger.error(
            { error },
            "Failed to link media attachments to items",
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
        processedImages: contexts.length,
        attachmentIds,
      };
    } catch (error: any) {
      this.logger.error({ error }, "Error processing multiple images");
      return {
        text: `Sorry, I encountered an error while processing the images: ${error.message}`,
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
