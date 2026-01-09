import { formatInZone } from "../../utils/time-utils";
export class ResponseFormatter {
  private escapeMarkdown(text: string): string {
    if (!text || typeof text !== "string") return text;
    return text.replace(/([*_`\[\]()~>#+=|{}.!-])/g, "\\$1");
  }
  private stripMarkdown(text: string): string {
    if (!text || typeof text !== "string") return text;
    return text
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*\s+/g, "• ")
      .replace(/\*([^*\n]+)\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/_([^_\n]+)_/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  }
  getResponseMessage(result: any, timezone?: string): string {
    const unwrap = (obj: any) => {
      if (!obj || typeof obj !== "object") return obj;
      if ("result" in obj) return (obj as any).result;
      if ("toolResult" in obj) return (obj as any).toolResult;
      if ("output" in obj) return (obj as any).output;
      if ("data" in obj) return (obj as any).data;
      return obj;
    };
    const r = unwrap(result);
    if (!r) return JSON.stringify(result, null, 2);
    const getDisplayTime = (item: any): string | undefined => {
      try {
        const formatted =
          item.reminderTimeFormatted || item.reminder_time_formatted;
        if (formatted && typeof formatted === "string") return formatted;
        const raw = item.reminderTime || item.reminder_time;
        if (!raw) return undefined;
        if (timezone) return formatInZone(raw, timezone);
        const d = new Date(raw);
        return isNaN(d.getTime()) ? String(raw) : d.toLocaleString();
      } catch {
        return undefined;
      }
    };
    if ((r as any).text) {
      const text = (r as any).text;
      if (
        text &&
        text.trim() &&
        !text.match(/^(processed your request\.?|done\.?)$/i)
      ) {
        return this.stripMarkdown(text);
      }
    }
    if ((r as any).message) {
      try {
        const sched = (r as any).scheduledFor || (r as any).scheduled_for;
        if (sched) {
          const ts = timezone
            ? formatInZone(sched, timezone, "MMM d, yyyy 'at' h:mm a")
            : new Date(sched).toLocaleString();
          return `${(r as any).message} for ${ts}.`;
        }
      } catch {}
      return (r as any).message;
    }
    if ((r as any).reminders) {
      const reminders = (r as any).reminders;
      if (reminders.length === 0) {
        return "No reminders found.";
      }
      return `📅 Your reminders:\n${reminders
        .map((rem: any, i: number) => {
          const ts = getDisplayTime(rem) || "";
          const recurrence = rem.isRecurring || rem.recurrenceRule ? " 🔁" : "";
          return `${i + 1}. ${this.escapeMarkdown(rem.title)}${recurrence}${ts ? " - " + ts : ""}`;
        })
        .join("\n")}`;
    }
    if ((r as any).results && Array.isArray((r as any).results)) {
      const resultsArr = (r as any).results as any[];
      if (resultsArr.length === 0) {
        return "No reminders found matching your search.";
      }
      return `🔍 Found ${(r as any).total} reminder(s):\n${resultsArr
        .map((rem: any, i: number) => {
          const ts = timezone
            ? formatInZone(rem.reminderTime, timezone)
            : new Date(rem.reminderTime).toLocaleString();
          return `${i + 1}. ${this.escapeMarkdown(rem.title)} - ${ts}`;
        })
        .join("\n")}`;
    }
    if ((r as any).lists) {
      const lists = (r as any).lists as any[];
      if (lists.length === 0) {
        return "No lists found.";
      }
      return `📝 Your lists:\n${lists
        .map((l: any, i: number) => {
          const itemsText = l.items
            ? `\n${l.items
                .map(
                  (item: any) =>
                    `   ${item.isCompleted ? "✅" : "⬜"} ${this.escapeMarkdown(item.content)}`,
                )
                .join("\n")}`
            : "";
          return `${i + 1}. ${this.escapeMarkdown(l.name)} (${l.itemCount} items)${itemsText}`;
        })
        .join("\n\n")}`;
    }
    if ((r as any).items && Array.isArray((r as any).items)) {
      const items = (r as any).items as any[];
      if (items.length === 0) {
        return `List "${this.escapeMarkdown((r as any).listName || "Unknown")}" is empty.`;
      }
      return `📝 ${this.escapeMarkdown((r as any).listName)}:\n${items
        .map(
          (item: any, i: number) =>
            `${i + 1}. ${item.isCompleted ? "✅" : "⬜"} ${this.escapeMarkdown(item.content)}`,
        )
        .join("\n")}`;
    }
    if ((r as any).created !== undefined && (r as any).failed !== undefined) {
      return `✅ Created ${(r as any).created} reminder(s)${(r as any).failed > 0 ? `, ${(r as any).failed} failed` : ""}`;
    }
    if ((r as any).addedCount !== undefined) {
      return `✅ Added ${(r as any).addedCount} item(s) to list`;
    }
    if ((r as any).removedCount !== undefined) {
      return `✅ Removed ${(r as any).removedCount} item(s) from list`;
    }
    if ((r as any).formattedTime && (r as any).timezone) {
      return `🕐 Current time: ${(r as any).formattedTime}`;
    }
    if (
      (r as any).timezone &&
      (r as any).language &&
      ((r as any).notificationPreferences !== undefined ||
        (r as any).defaultReminderTime !== undefined ||
        (r as any).quietHours !== undefined)
    ) {
      const name = (r as any).name || "(not set)";
      const tz = (r as any).timezone || "UTC";
      const lang = (r as any).language || "en";
      const defaultTime = (r as any).defaultReminderTime || "(not set)";
      const np = (r as any).notificationPreferences || {};
      const notifEnabled = np.enabled === true ? "enabled" : "disabled";
      const advance = np.advanceNotice ?? "(default)";
      const qh = (r as any).quietHours || {};
      const qhEnabled = qh.enabled ? "enabled" : "disabled";
      const qhWindow = qh.enabled
        ? `${qh.startTime || "?"} - ${qh.endTime || "?"}`
        : "";
      const qhDays =
        qh.enabled && Array.isArray(qh.days) && qh.days.length > 0
          ? ` (${qh.days.join(", ")})`
          : "";
      const calendars = (r as any).calendarConnections || [];
      const calendarsText =
        calendars.length > 0 ? calendars.join(", ") : "none";
      return (
        `👤 Your settings:\n` +
        `- Name: ${name}\n` +
        `- Timezone: ${tz}\n` +
        `- Language: ${lang}\n` +
        `- Default reminder time: ${defaultTime}\n` +
        `- Notifications: ${notifEnabled}${np.enabled ? ` (advance notice: ${advance} min)` : ""}\n` +
        `- Quiet hours: ${qhEnabled}${qh.enabled ? ` (${qhWindow}${qhDays})` : ""}\n` +
        `- Linked calendars: ${calendarsText}`
      );
    }
    if ((r as any).notes && Array.isArray((r as any).notes)) {
      const notes = (r as any).notes as any[];
      if (notes.length === 0) {
        return "No notes found.";
      }
      const totalText = (r as any).total
        ? ` (showing ${notes.length} of ${(r as any).total})`
        : "";
      let response = `📝 Found ${notes.length} note(s)${totalText}:\n`;
      const formattedNotes = notes
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
      if ((r as any).total && (r as any).total > notes.length) {
        response += `\n\n💡 *Tip: Use more specific search terms or categories to narrow results*`;
      }
      if (response.length > 3500) {
        const truncatedNotes = notes.slice(0, Math.floor(notes.length * 0.7));
        const newResponse = `📝 Found ${notes.length} note(s)${totalText} (showing first ${truncatedNotes.length}):\n`;
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
    if ((r as any).content && (r as any).id) {
      const title = (r as any).title ? `**${(r as any).title}**` : "";
      const tags =
        (r as any).tags && (r as any).tags.length > 0
          ? ` #${(r as any).tags.join(" #")}`
          : "";
      return `✅ Note saved!\n${title}${title ? "\n" : ""}${(r as any).content}${tags}`;
    }
    if ((r as any).success === true) {
      if ((r as any).message) return (r as any).message;
      return "✅ Success.";
    }
    return "I couldn't format that result.";
  }
}
