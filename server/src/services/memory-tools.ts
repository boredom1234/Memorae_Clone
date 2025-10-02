import { z } from "zod";
import { tool } from "ai";
import { SupermemoryService } from "./supermemory-service";
import pino from "pino";

/**
 * Memory-related tools for AI to use
 * These tools enable the AI to store and retrieve information from Supermemory
 */
export class MemoryTools {
  private supermemory: SupermemoryService;
  private logger = pino({ level: "info" });
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
    this.supermemory = new SupermemoryService();
  }

  /**
   * Get all memory-related tools for AI SDK
   */
  getTools() {
    if (!this.supermemory.isEnabled()) {
      this.logger.warn("Supermemory not enabled, memory tools disabled");
      return {};
    }

    return {
      saveNote: tool({
        description:
          "Save a note, document, or piece of information for the user to retrieve later. Use this when the user explicitly asks to save, remember, or store something.",
        inputSchema: z.object({
          content: z.string().describe("The content to save"),
          title: z.string().optional().describe("Optional title for the note"),
          category: z
            .string()
            .optional()
            .describe(
              "Category: personal, work, recipe, idea, reference, etc.",
            ),
        }),
        execute: async (args: {
          content: string;
          title?: string;
          category?: string;
        }) => {
          this.logger.info(
            { userId: this.userId, title: args.title },
            "Saving note",
          );

          const result = await this.supermemory.storeDocument(
            this.userId,
            args.content,
            args.title,
            args.category,
          );

          if (result.success) {
            return {
              success: true,
              message: `✅ Saved! I'll remember that for you.${args.title ? ` (${args.title})` : ""}`,
            };
          } else {
            return {
              success: false,
              message: "❌ Failed to save the note. Please try again.",
            };
          }
        },
      }),

      searchMemories: tool({
        description:
          "Search through the user's saved notes, past conversations, and stored information. Use this when the user asks to find, recall, or retrieve something they mentioned before.",
        inputSchema: z.object({
          query: z.string().describe("What to search for"),
          category: z
            .string()
            .optional()
            .describe(
              "Filter by category: conversation, document, reminder_context, voice_note, image_ocr, personal, work, recipe, etc.",
            ),
          limit: z
            .number()
            .optional()
            .default(5)
            .describe("Maximum number of results to return"),
        }),
        execute: async (args: {
          query: string;
          category?: string;
          limit?: number;
        }) => {
          this.logger.info(
            { userId: this.userId, query: args.query },
            "Searching memories",
          );

          const result = await this.supermemory.searchMemories({
            query: args.query,
            userId: this.userId,
            limit: args.limit || 5,
            filters: args.category ? { category: args.category } : undefined,
          });

          if (result.success && result.results && result.results.length > 0) {
            const memories = result.results.map((r, i) => ({
              rank: i + 1,
              content: r.memory,
              relevance: Math.round(r.similarity * 100),
              date: new Date(r.updatedAt).toLocaleDateString(),
              category: r.metadata.category,
            }));

            return {
              success: true,
              found: result.total,
              memories,
              message: `🔍 Found ${result.total} result(s):\n\n${memories
                .map(
                  (m) =>
                    `${m.rank}. ${m.content}\n   📅 ${m.date} | 🎯 ${m.relevance}% match${m.category ? ` | 📁 ${m.category}` : ""}`,
                )
                .join("\n\n")}`,
            };
          } else {
            return {
              success: true,
              found: 0,
              message: "🔍 No memories found matching your search.",
            };
          }
        },
      }),

      getMyNotes: tool({
        description:
          "Get all saved notes and documents for the user. Use this when the user asks to see their saved notes, documents, or what they've stored.",
        inputSchema: z.object({
          category: z
            .string()
            .optional()
            .describe(
              "Filter by category: personal, work, recipe, idea, reference, etc.",
            ),
        }),
        execute: async (args: { category?: string }) => {
          this.logger.info(
            { userId: this.userId, category: args.category },
            "Getting user notes",
          );

          const result = await this.supermemory.getUserDocuments(
            this.userId,
            args.category,
          );

          if (
            result.success &&
            result.documents &&
            result.documents.length > 0
          ) {
            const notes = result.documents.map((doc, i) => ({
              rank: i + 1,
              content:
                doc.memory.substring(0, 100) +
                (doc.memory.length > 100 ? "..." : ""),
              title: doc.metadata.title,
              category: doc.metadata.category,
              date: new Date(doc.updatedAt).toLocaleDateString(),
            }));

            return {
              success: true,
              count: notes.length,
              notes,
              message: `📝 Your saved notes${args.category ? ` (${args.category})` : ""}:\n\n${notes
                .map(
                  (n) =>
                    `${n.rank}. ${n.title || "Untitled"}\n   ${n.content}\n   📅 ${n.date}${n.category ? ` | 📁 ${n.category}` : ""}`,
                )
                .join("\n\n")}`,
            };
          } else {
            return {
              success: true,
              count: 0,
              message: `📝 You don't have any saved notes yet${args.category ? ` in the ${args.category} category` : ""}.`,
            };
          }
        },
      }),

      recallConversation: tool({
        description:
          "Recall past conversations with the user. Use this when the user asks about what they said before, past discussions, or conversation history.",
        inputSchema: z.object({
          topic: z
            .string()
            .optional()
            .describe("Specific topic to search for in conversations"),
          limit: z
            .number()
            .optional()
            .default(5)
            .describe("Number of conversations to retrieve"),
        }),
        execute: async (args: { topic?: string; limit?: number }) => {
          this.logger.info(
            { userId: this.userId, topic: args.topic },
            "Recalling conversation",
          );

          let result;
          if (args.topic) {
            // Search for specific topic
            result = await this.supermemory.searchMemories({
              query: args.topic,
              userId: this.userId,
              limit: args.limit || 5,
              filters: { category: "conversation" },
            });
          } else {
            // Get recent conversation history
            result = await this.supermemory.getConversationHistory(
              this.userId,
              args.limit || 5,
            );
          }

          // Handle both response types (searchMemories returns 'results', getConversationHistory returns 'conversations')
          const conversationResults = result.success
            ? ("conversations" in result && result.conversations) ||
              ("results" in result && result.results) ||
              []
            : [];

          if (result.success && conversationResults.length > 0) {
            const conversations = conversationResults.map(
              (conv: any, i: number) => ({
                rank: i + 1,
                content: conv.memory,
                date: new Date(conv.updatedAt).toLocaleDateString(),
                time: new Date(conv.updatedAt).toLocaleTimeString(),
              }),
            );

            return {
              success: true,
              count: conversations.length,
              conversations,
              message: `💬 Past conversations${args.topic ? ` about "${args.topic}"` : ""}:\n\n${conversations
                .map(
                  (c: any) =>
                    `${c.rank}. ${c.content}\n   🕐 ${c.date} at ${c.time}`,
                )
                .join("\n\n")}`,
            };
          } else {
            return {
              success: true,
              count: 0,
              message: `💬 No past conversations found${args.topic ? ` about "${args.topic}"` : ""}.`,
            };
          }
        },
      }),

      getReminderContext: tool({
        description:
          "Get the original context and reason why a reminder was created. Use this when the user asks why they set a reminder or what the context was.",
        inputSchema: z.object({
          reminderTitle: z
            .string()
            .describe(
              "The title or description of the reminder to find context for",
            ),
        }),
        execute: async (args: { reminderTitle: string }) => {
          this.logger.info(
            { userId: this.userId, reminderTitle: args.reminderTitle },
            "Getting reminder context",
          );

          const result = await this.supermemory.searchMemories({
            query: args.reminderTitle,
            userId: this.userId,
            limit: 3,
            filters: { category: "reminder_context" },
          });

          if (result.success && result.results && result.results.length > 0) {
            const context = result.results[0];
            return {
              success: true,
              context: context.memory,
              date: new Date(context.updatedAt).toLocaleDateString(),
              message: `📌 Reminder Context:\n\n${context.memory}\n\n📅 Created: ${new Date(context.updatedAt).toLocaleDateString()}`,
            };
          } else {
            return {
              success: true,
              found: false,
              message: `📌 No context found for that reminder. It might have been created without storing context.`,
            };
          }
        },
      }),

      findRelatedInfo: tool({
        description:
          "Find information related to a topic across all stored data (notes, conversations, reminders). Use this for broad searches across everything the user has stored.",
        inputSchema: z.object({
          topic: z
            .string()
            .describe("The topic to find related information about"),
          limit: z
            .number()
            .optional()
            .default(10)
            .describe("Maximum number of results"),
        }),
        execute: async (args: { topic: string; limit?: number }) => {
          this.logger.info(
            { userId: this.userId, topic: args.topic },
            "Finding related info",
          );

          const result = await this.supermemory.findRelatedMemories(
            this.userId,
            args.topic,
            args.limit || 10,
          );

          if (result.success && result.memories && result.memories.length > 0) {
            const grouped = result.memories.reduce((acc: any, mem) => {
              const category = mem.metadata.category || "other";
              if (!acc[category]) acc[category] = [];
              acc[category].push(mem);
              return acc;
            }, {});

            let message = `🔍 Related information about "${args.topic}":\n\n`;

            for (const [category, items] of Object.entries(grouped) as [
              string,
              any,
            ][]) {
              message += `📁 ${category.toUpperCase()}:\n`;
              items.forEach((item: any, i: number) => {
                message += `  ${i + 1}. ${item.memory.substring(0, 100)}${item.memory.length > 100 ? "..." : ""}\n`;
              });
              message += "\n";
            }

            return {
              success: true,
              found: result.memories.length,
              categories: Object.keys(grouped),
              message,
            };
          } else {
            return {
              success: true,
              found: 0,
              message: `🔍 No related information found about "${args.topic}".`,
            };
          }
        },
      }),
    };
  }

  /**
   * Check if memory tools are enabled
   */
  isEnabled(): boolean {
    return this.supermemory.isEnabled();
  }
}
