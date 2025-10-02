import { config } from "../config/env";
import pino from "pino";

interface MemoryMetadata {
  source?: string;
  category?: string;
  timestamp?: string;
  userId?: string;
  reminderContext?: boolean;
  conversationContext?: boolean;
  [key: string]: any;
}

interface AddMemoryParams {
  content: string;
  userId: string;
  metadata?: MemoryMetadata;
  customId?: string;
  additionalTags?: string[];
}

interface SearchMemoryParams {
  query: string;
  userId: string;
  limit?: number;
  filters?: {
    category?: string;
    source?: string;
    dateRange?: { start: string; end: string };
  };
  includeContext?: boolean;
}

interface MemoryResult {
  id: string;
  memory: string;
  metadata: MemoryMetadata;
  similarity: number;
  updatedAt: string;
  context?: {
    parents?: any[];
    children?: any[];
  };
  documents?: any[];
}

interface AddMemoryResponse {
  id: string;
  [key: string]: any;
}

interface SearchMemoryResponse {
  results: MemoryResult[];
  total: number;
  timing?: number;
  [key: string]: any;
}

export class SupermemoryService {
  private logger = pino({ level: "info" });
  private apiKey: string;
  private baseUrl = "https://api.supermemory.ai/v3";
  private isConfigured: boolean;

  constructor() {
    this.apiKey = config.supermemory.apiKey;
    this.isConfigured = !!this.apiKey;

    if (!this.isConfigured) {
      this.logger.warn(
        "Supermemory API key not configured. Memory features disabled.",
      );
    } else {
      this.logger.info("✅ Supermemory service initialized");
    }
  }

  /**
   * Add a memory for a specific user
   */
  async addMemory(
    params: AddMemoryParams,
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    if (!this.isConfigured) {
      return { success: false, error: "Supermemory not configured" };
    }

    try {
      const containerTags = [
        `user_${params.userId}`,
        "memorae_bot",
        ...(params.additionalTags || []),
      ];

      const body = {
        content: params.content,
        containerTags,
        metadata: {
          ...params.metadata,
          timestamp: params.metadata?.timestamp || new Date().toISOString(),
          platform: "whatsapp",
        },
        ...(params.customId && { customId: params.customId }),
      };

      const response = await fetch(`${this.baseUrl}/memories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(
          { error, status: response.status },
          "Failed to add memory",
        );
        return {
          success: false,
          error: `Failed to add memory: ${response.statusText}`,
        };
      }

      const result = (await response.json()) as AddMemoryResponse;
      this.logger.info(
        { userId: params.userId, memoryId: result.id },
        "Memory added successfully",
      );

      return { success: true, id: result.id };
    } catch (error: any) {
      this.logger.error({ error: error.message }, "Error adding memory");
      return { success: false, error: error.message };
    }
  }

  /**
   * Search memories for a specific user
   */
  async searchMemories(params: SearchMemoryParams): Promise<{
    success: boolean;
    results?: MemoryResult[];
    total?: number;
    error?: string;
  }> {
    if (!this.isConfigured) {
      return { success: false, error: "Supermemory not configured" };
    }

    try {
      // Supermemory v3 /search expects 'q' in the JSON body (POST)
      const url = `${this.baseUrl}/search`;

      const body: any = {
        q: params.query,
        limit: params.limit || 10,
        ...(params.includeContext ? { includeContext: true } : {}),
        containerTags: [`user_${params.userId}`],
      };

      // Add metadata filters if provided
      if (params.filters) {
        const filterConditions: any[] = [];

        if (params.filters.category) {
          filterConditions.push({
            key: "category",
            value: params.filters.category,
          });
        }

        if (params.filters.source) {
          filterConditions.push({
            key: "source",
            value: params.filters.source,
          });
        }

        if (filterConditions.length > 0) {
          body.filters = { AND: filterConditions };
        }
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(
          { error, status: response.status },
          "Failed to search memories",
        );
        return {
          success: false,
          error: `Failed to search memories: ${response.statusText}`,
        };
      }

      const result = (await response.json()) as SearchMemoryResponse;
      this.logger.info(
        {
          userId: params.userId,
          query: params.query,
          resultsCount: result.results?.length || 0,
        },
        "Memory search completed",
      );

      return {
        success: true,
        results: result.results,
        total: result.total,
      };
    } catch (error: any) {
      this.logger.error({ error: error.message }, "Error searching memories");
      return { success: false, error: error.message };
    }
  }

  /**
   * Store conversation context
   */
  async storeConversation(
    userId: string,
    userMessage: string,
    botResponse: string,
    metadata?: MemoryMetadata,
  ): Promise<{ success: boolean; error?: string }> {
    const conversationContent = `User: ${userMessage}\nBot: ${botResponse}`;

    return this.addMemory({
      content: conversationContent,
      userId,
      metadata: {
        ...metadata,
        category: "conversation",
        source: "whatsapp",
        conversationContext: true,
      },
      additionalTags: ["conversation_history"],
    });
  }

  /**
   * Store reminder context - why the reminder was created
   */
  async storeReminderContext(
    userId: string,
    reminderId: string,
    reminderTitle: string,
    originalMessage: string,
    metadata?: MemoryMetadata,
  ): Promise<{ success: boolean; error?: string }> {
    const contextContent = `Reminder: "${reminderTitle}"\nOriginal request: ${originalMessage}`;

    return this.addMemory({
      content: contextContent,
      userId,
      customId: `reminder_context_${reminderId}`,
      metadata: {
        ...metadata,
        category: "reminder_context",
        reminderId,
        reminderTitle,
        reminderContext: true,
      },
      additionalTags: ["reminder_context"],
    });
  }

  /**
   * Store document/note from user
   */
  async storeDocument(
    userId: string,
    content: string,
    title?: string,
    category?: string,
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    return this.addMemory({
      content,
      userId,
      metadata: {
        category: category || "document",
        title,
        source: "whatsapp",
      },
      additionalTags: ["user_document"],
    });
  }

  /**
   * Store voice note transcription
   */
  async storeVoiceNote(
    userId: string,
    transcription: string,
    audioMetadata?: any,
  ): Promise<{ success: boolean; error?: string }> {
    return this.addMemory({
      content: transcription,
      userId,
      metadata: {
        category: "voice_note",
        source: "whatsapp",
        audioMetadata,
      },
      additionalTags: ["voice_note"],
    });
  }

  /**
   * Store OCR text from image
   */
  async storeImageText(
    userId: string,
    extractedText: string,
    imageMetadata?: any,
  ): Promise<{ success: boolean; error?: string }> {
    return this.addMemory({
      content: extractedText,
      userId,
      metadata: {
        category: "image_ocr",
        source: "whatsapp",
        imageMetadata,
      },
      additionalTags: ["image_text"],
    });
  }

  /**
   * Get conversation history for context
   */
  async getConversationHistory(
    userId: string,
    limit: number = 5,
  ): Promise<{
    success: boolean;
    conversations?: MemoryResult[];
    error?: string;
  }> {
    return this.searchMemories({
      query: "conversation history",
      userId,
      limit,
      filters: {
        category: "conversation",
      },
    }).then((result) => ({
      success: result.success,
      conversations: result.results,
      error: result.error,
    }));
  }

  /**
   * Find related memories based on query
   */
  async findRelatedMemories(
    userId: string,
    query: string,
    limit: number = 5,
  ): Promise<{ success: boolean; memories?: MemoryResult[]; error?: string }> {
    return this.searchMemories({
      query,
      userId,
      limit,
      includeContext: true,
    }).then((result) => ({
      success: result.success,
      memories: result.results,
      error: result.error,
    }));
  }

  /**
   * Get user's saved documents
   */
  async getUserDocuments(
    userId: string,
    category?: string,
  ): Promise<{ success: boolean; documents?: MemoryResult[]; error?: string }> {
    return this.searchMemories({
      query: "user documents",
      userId,
      limit: 20,
      // Default to 'document' category when not specified to surface saved notes
      filters: { category: category || "document" },
    }).then((result) => ({
      success: result.success,
      documents: result.results,
      error: result.error,
    }));
  }

  /**
   * Check if service is configured
   */
  isEnabled(): boolean {
    return this.isConfigured;
  }
}
