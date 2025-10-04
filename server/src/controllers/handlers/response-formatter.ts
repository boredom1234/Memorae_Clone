import { formatInZone } from "../../utils/time-utils";

/**
 * Response Formatter Module
 * Formats AI tool results into user-friendly WhatsApp messages
 */

export class ResponseFormatter {
  /**
   * Get formatted response message for WhatsApp
   */
  getResponseMessage(result: any, timezone?: string): string {
    if (!result) return "Done!";

    // If result has text from AI, use that
    if (result.text) {
      return result.text;
    }

    if (result.message) return result.message;

    // Format different result types
    if (result.reminders) {
      if (result.reminders.length === 0) {
        return "No reminders found.";
      }
      return `📅 Your reminders:\n${result.reminders
        .map((r: any, i: number) => {
          const ts = timezone
            ? formatInZone(r.reminderTime, timezone)
            : new Date(r.reminderTime).toLocaleString();
          return `${i + 1}. ${r.title} - ${ts}`;
        })
        .join("\n")}`;
    }

    if (result.results && Array.isArray(result.results)) {
      // Search results
      if (result.results.length === 0) {
        return "No reminders found matching your search.";
      }
      return `🔍 Found ${result.total} reminder(s):\n${result.results
        .map((r: any, i: number) => {
          const ts = timezone
            ? formatInZone(r.reminderTime, timezone)
            : new Date(r.reminderTime).toLocaleString();
          return `${i + 1}. ${r.title} - ${ts}`;
        })
        .join("\n")}`;
    }

    if (result.lists) {
      if (result.lists.length === 0) {
        return "No lists found.";
      }
      return `📝 Your lists:\n${result.lists
        .map((l: any, i: number) => {
          const itemsText = l.items
            ? `\n${l.items
                .map(
                  (item: any) =>
                    `   ${item.isCompleted ? "✅" : "⬜"} ${item.content}`,
                )
                .join("\n")}`
            : "";
          return `${i + 1}. ${l.name} (${l.itemCount} items)${itemsText}`;
        })
        .join("\n\n")}`;
    }

    // Handle list items response
    if (result.items && Array.isArray(result.items)) {
      if (result.items.length === 0) {
        return `List "${result.listName || "Unknown"}" is empty.`;
      }
      return `📝 ${result.listName}:\n${result.items
        .map(
          (item: any, i: number) =>
            `${i + 1}. ${item.isCompleted ? "✅" : "⬜"} ${item.content}`,
        )
        .join("\n")}`;
    }

    // Handle batch create results
    if (result.created !== undefined && result.failed !== undefined) {
      return `✅ Created ${result.created} reminder(s)${result.failed > 0 ? `, ${result.failed} failed` : ""}`;
    }

    // Handle added/removed count
    if (result.addedCount !== undefined) {
      return `✅ Added ${result.addedCount} item(s) to list`;
    }

    if (result.removedCount !== undefined) {
      return `✅ Removed ${result.removedCount} item(s) from list`;
    }

    // Handle getCurrentTime response
    if (result.formattedTime && result.timezone) {
      return `🕐 Current time: ${result.formattedTime}`;
    }

    // Handle notes responses
    if (result.notes && Array.isArray(result.notes)) {
      if (result.notes.length === 0) {
        return "No notes found.";
      }

      const totalText = result.total
        ? ` (showing ${result.notes.length} of ${result.total})`
        : "";
      let response = `📝 Found ${result.notes.length} note(s)${totalText}:\n`;

      const formattedNotes = result.notes
        .map((note: any, i: number) => {
          const title = note.title ? `**${note.title}**` : "";
          const content =
            note.content.length > 80
              ? note.content.substring(0, 80) + "..."
              : note.content;
          const tags =
            note.tags && note.tags.length > 0
              ? ` #${note.tags.slice(0, 3).join(" #")}${note.tags.length > 3 ? "..." : ""}`
              : "";
          const pinned = note.isPinned ? "📌 " : "";
          return `${i + 1}. ${pinned}${title}${title ? "\n   " : ""}${content}${tags}`;
        })
        .join("\n\n");

      response += formattedNotes;

      // Add helpful hints for large result sets
      if (result.total && result.total > result.notes.length) {
        response += `\n\n💡 *Tip: Use more specific search terms or categories to narrow results*`;
      }

      // Truncate if response is too long (WhatsApp limit ~4000 chars)
      if (response.length > 3500) {
        const truncatedNotes = result.notes.slice(
          0,
          Math.floor(result.notes.length * 0.7),
        );
        const newResponse = `📝 Found ${result.notes.length} note(s)${totalText} (showing first ${truncatedNotes.length}):\n`;
        const truncatedFormatted = truncatedNotes
          .map((note: any, i: number) => {
            const title = note.title ? `**${note.title}**` : "";
            const content =
              note.content.length > 60
                ? note.content.substring(0, 60) + "..."
                : note.content;
            const pinned = note.isPinned ? "📌 " : "";
            return `${i + 1}. ${pinned}${title}${title ? "\n   " : ""}${content}`;
          })
          .join("\n\n");
        response =
          newResponse +
          truncatedFormatted +
          "\n\n💡 *Use more specific search to see all results*";
      }

      return response;
    }

    // Handle single note response (create/update)
    if (result.content && result.id) {
      const title = result.title ? `**${result.title}**` : "";
      const tags =
        result.tags && result.tags.length > 0
          ? ` #${result.tags.join(" #")}`
          : "";
      return `✅ Note saved!\n${title}${title ? "\n" : ""}${result.content}${tags}`;
    }

    // Handle note deletion
    if (result.success === true) {
      return "✅ Note deleted successfully!";
    }

    return "Done!";
  }
}
