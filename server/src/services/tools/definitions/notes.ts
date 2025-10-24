import { tool } from "ai";
import { z } from "zod";
import { DedupeFunction, ToolServices } from "../tool-definitions";
export function createNotesAITools(
  userId: string,
  services: ToolServices,
  dedupe: DedupeFunction,
) {
  const { notesService, notesQueryService } = services;
  return {
    createNote: tool({
      description:
        "Save information, facts, or memories for later reference. Use when user wants to remember something without a specific time. Examples: 'remember that X', 'note: X', 'save this info', 'keep track of X', 'make a note about X', 'store this'. Different from reminders - notes are for reference, reminders are for time-based alerts.",
      inputSchema: z.object({
        content: z
          .string()
          .describe("The information/note content to remember"),
        title: z
          .string()
          .optional()
          .describe(
            "Optional title for the note - ALWAYS try to generate a descriptive title from the content",
          ),
        category: z
          .string()
          .optional()
          .describe(
            "Category like 'personal', 'work', 'general', 'shopping', 'health', 'finance' - infer from content context",
          ),
        tags: z
          .array(z.string())
          .optional()
          .describe(
            "Optional tags for organization - extract relevant keywords from content as tags",
          ),
        isPinned: z
          .boolean()
          .optional()
          .describe(
            "Mark as important/pinned - set to true if user says 'important', 'remember this', 'don\'t forget'",
          ),
      }),
      execute: dedupe("createNote", async (params) => {
        const ctx = (params as any)._context || {};
        let content = params.content;
        if (!content && ctx.originalMessage) {
          content = ctx.originalMessage;
        }
        if (!content || content.trim().length === 0) {
          throw new Error("Note content cannot be empty");
        }
        let title = params.title;
        if (!title && content) {
          const firstLine = content.split("\n")[0];
          title =
            firstLine.length > 50
              ? firstLine.substring(0, 47) + "..."
              : firstLine;
        }
        let category = params.category || "general";
        if (!params.category) {
          const contentLower = content.toLowerCase();
          if (
            contentLower.includes("work") ||
            contentLower.includes("office") ||
            contentLower.includes("meeting")
          ) {
            category = "work";
          } else if (
            contentLower.includes("buy") ||
            contentLower.includes("shop") ||
            contentLower.includes("price")
          ) {
            category = "shopping";
          } else if (
            contentLower.includes("health") ||
            contentLower.includes("doctor") ||
            contentLower.includes("medicine")
          ) {
            category = "health";
          } else if (
            contentLower.includes("money") ||
            contentLower.includes("payment") ||
            contentLower.includes("bill")
          ) {
            category = "finance";
          } else if (
            contentLower.includes("family") ||
            contentLower.includes("friend") ||
            contentLower.includes("personal")
          ) {
            category = "personal";
          }
        }
        return await notesService.createNote({
          userId,
          content: content,
          title: title,
          category: category,
          tags: params.tags,
          isPinned: params.isPinned || false,
        });
      }),
    }),
    searchNotes: tool({
      description:
        "Search through saved notes to find specific information. Use when user wants to find or recall something they saved. Examples: 'what did I save about X?', 'find my notes on Y', 'do you remember what I said about Z?', 'search for notes containing X', 'what was that thing about Y'.",
      inputSchema: z.object({
        query: z.string().describe("Search query to find in notes"),
        category: z.string().optional().describe("Filter by category"),
        tags: z.array(z.string()).optional().describe("Filter by tags"),
        limit: z.number().optional().describe("Maximum results to return"),
      }),
      execute: dedupe("searchNotes", async (params) => {
        return await notesQueryService.searchNotes({
          userId,
          query: params.query,
          category: params.category,
          tags: params.tags,
          limit: Math.min(params.limit || 5, 10),
          includeArchived: false,
        });
      }),
    }),
    listNotes: tool({
      description:
        "Show all saved notes. Triggers: show notes, list memories, what have I saved.",
      inputSchema: z.object({
        category: z.string().optional().describe("Filter by category"),
        tags: z.array(z.string()).optional().describe("Filter by tags"),
        onlyPinned: z
          .boolean()
          .optional()
          .describe("Show only pinned/important notes"),
        limit: z.number().optional().describe("Maximum results to return"),
      }),
      execute: dedupe("listNotes", async (params) => {
        return await notesQueryService.listNotes({
          userId,
          category: params.category,
          tags: params.tags,
          onlyPinned: params.onlyPinned || false,
          limit: Math.min(params.limit || 10, 15),
          includeArchived: false,
          sortBy: "created",
          sortOrder: "desc",
        });
      }),
    }),
    updateNote: tool({
      description:
        "Modify existing note. Triggers: update, change, modify, edit, correct.",
      inputSchema: z.object({
        searchQuery: z
          .string()
          .describe("Text to search for the note to update"),
        content: z.string().optional().describe("New content for the note"),
        title: z.string().optional().describe("New title for the note"),
        category: z.string().optional().describe("New category"),
        tags: z.array(z.string()).optional().describe("New tags"),
        isPinned: z.boolean().optional().describe("Mark as pinned/unpinned"),
      }),
      execute: dedupe("updateNote", async (params) => {
        const searchResult = await notesQueryService.searchNotes({
          userId,
          query: params.searchQuery,
          limit: 5,
          includeArchived: false,
        });
        if (searchResult.notes.length === 0) {
          throw new Error(
            `Could not find any notes matching "${params.searchQuery}"`
          );
        }
        if (searchResult.notes.length > 1) {
          return {
            needsSelection: true,
            message: "I found multiple notes. Which one did you mean?",
            candidates: searchResult.notes.map((n: any, idx: number) => ({
              id: n.id,
              number: idx + 1,
              title: n.title,
              preview: n.content.substring(0, 60),
              type: "note",
            })),
          };
        }
        return await notesService.updateNote({
          userId,
          noteId: searchResult.notes[0].id,
          content: params.content,
          title: params.title,
          category: params.category,
          tags: params.tags,
          isPinned: params.isPinned,
        });
      }),
    }),
    deleteNote: tool({
      description:
        "Delete note permanently. Triggers: delete, remove, forget, clear.",
      inputSchema: z.object({
        searchQuery: z
          .string()
          .describe("Text to search for the note to delete"),
      }),
      execute: dedupe("deleteNote", async (params) => {
        const searchResult = await notesQueryService.searchNotes({
          userId,
          query: params.searchQuery,
          limit: 5,
          includeArchived: false,
        });
        if (searchResult.notes.length === 0) {
          throw new Error(
            `Could not find any notes matching "${params.searchQuery}"`
          );
        }
        if (searchResult.notes.length > 1) {
          return {
            needsSelection: true,
            message:
              "I found multiple notes. Which one do you want to delete?",
            candidates: searchResult.notes.map((n: any, idx: number) => ({
              id: n.id,
              number: idx + 1,
              title: n.title,
              preview: n.content.substring(0, 60),
              type: "note",
            })),
          };
        }
        return await notesService.deleteNote(userId, searchResult.notes[0].id);
      }),
    }),
    duplicateNote: tool({
      description:
        "Clone/copy a note. Triggers: duplicate note, copy note, clone note.",
      inputSchema: z.object({
        searchQuery: z
          .string()
          .describe("Text to search for the note to duplicate"),
        newTitle: z
          .string()
          .optional()
          .describe("Optional new title for the duplicate"),
      }),
      execute: dedupe("duplicateNote", async (params) => {
        const searchResult = await notesQueryService.searchNotes({
          userId,
          query: params.searchQuery,
          limit: 5,
          includeArchived: false,
        });
        if (searchResult.notes.length === 0) {
          throw new Error(
            `Could not find any notes matching "${params.searchQuery}"`
          );
        }
        if (searchResult.notes.length > 1) {
          return {
            needsSelection: true,
            message:
              "I found multiple notes. Which one do you want to duplicate?",
            candidates: searchResult.notes.map((n: any, idx: number) => ({
              id: n.id,
              number: idx + 1,
              title: n.title,
              preview: n.content.substring(0, 60),
              type: "note",
            })),
          };
        }
        return await notesService.duplicateNote({
          userId,
          noteId: searchResult.notes[0].id,
          newTitle: params.newTitle,
        });
      }),
    }),
  };
}
