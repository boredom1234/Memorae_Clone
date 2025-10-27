import pino from "pino";
import { ToolsRegistry } from "../tools-registry";
const logger = pino({ level: "info" });
export async function handleTimeLeftQuery(
  textForProcessing: string,
  result: any,
  toolsRegistry: ToolsRegistry,
  userId: string,
  timezone: string,
): Promise<string | null> {
  const isTimeLeftQuery =
    /\b(time left|how long|how much time|remaining time|time until)\b/i.test(
      textForProcessing,
    );
  const looksGeneric =
    !result.text || /processed your request\.?/i.test(result.text || "");
  if (isTimeLeftQuery && looksGeneric) {
    logger.info("Applying deterministic fallback for time-left query");
    let currentTimeISO: string | null = null;
    try {
      const ctRes = (result.toolResults || []).find(
        (r: any) => r?.toolName === "getCurrentTime",
      );
      currentTimeISO = ctRes?.output?.currentTime || null;
    } catch {}
    if (!currentTimeISO) {
      const ct = await toolsRegistry.executeTool("getCurrentTime", {
        timezone,
      });
      currentTimeISO = ct?.currentTime || new Date().toISOString();
    }
    const quoted = (textForProcessing.match(/"([^"]+)"|'([^']+)'/) || [])
      .slice(1)
      .find(Boolean);
    let target: {
      title: string;
      reminder_time: string;
    } | null = null;
    if (quoted) {
      const sr = await toolsRegistry.executeTool("searchReminders", {
        userId,
        query: quoted,
        limit: 5,
      });
      const candidates: any[] = sr?.results || [];
      const nowMs = currentTimeISO
        ? new Date(currentTimeISO).getTime()
        : Date.now();
      target =
        candidates
          .map((r) => ({
            title: r.title,
            reminder_time: r.reminder_time || r.reminderTime,
          }))
          .filter(
            (r) =>
              r.reminder_time && new Date(r.reminder_time).getTime() > nowMs,
          )
          .sort(
            (a, b) =>
              new Date(a.reminder_time).getTime() -
              new Date(b.reminder_time).getTime(),
          )[0] || null;
      if (!target && candidates.length > 0) {
        const r0 = candidates[0];
        target = {
          title: r0.title,
          reminder_time: r0.reminder_time || r0.reminderTime,
        };
      }
    }
    if (!target) {
      const lr = await toolsRegistry.executeTool("listReminders", {
        userId,
        status: "pending",
        limit: 20,
      });
      const items: any[] = lr?.results || lr?.reminders || [];
      const nowMs = currentTimeISO
        ? new Date(currentTimeISO).getTime()
        : Date.now();
      target =
        items
          .map((r) => ({
            title: r.title,
            reminder_time: r.reminder_time || r.reminderTime,
          }))
          .filter(
            (r) =>
              r.reminder_time && new Date(r.reminder_time).getTime() > nowMs,
          )
          .sort(
            (a, b) =>
              new Date(a.reminder_time).getTime() -
              new Date(b.reminder_time).getTime(),
          )[0] || null;
    }
    if (target && target.reminder_time) {
      const now = currentTimeISO
        ? new Date(currentTimeISO).getTime()
        : Date.now();
      const due = new Date(target.reminder_time).getTime();
      const diffMs = due - now;
      const absMs = Math.abs(diffMs);
      const sec = Math.floor(absMs / 1000) % 60;
      const min = Math.floor(absMs / (1000 * 60)) % 60;
      const hrs = Math.floor(absMs / (1000 * 60 * 60));
      const parts = [] as string[];
      if (hrs > 0) parts.push(`${hrs} hour${hrs !== 1 ? "s" : ""}`);
      if (min > 0) parts.push(`${min} minute${min !== 1 ? "s" : ""}`);
      if (sec > 0 || parts.length === 0)
        parts.push(`${sec} second${sec !== 1 ? "s" : ""}`);
      const formatted = parts.join(", ").replace(/, (?=[^,]*$)/, ", and ");
      if (diffMs >= 0) {
        return `Your reminder${quoted ? ` "${quoted}"` : target.title ? ` "${target.title}"` : ""} is in ${formatted}.`;
      } else {
        return `Your reminder${quoted ? ` "${quoted}"` : target.title ? ` "${target.title}"` : ""} was due ${formatted} ago (overdue).`;
      }
    } else {
      return "I couldn't find an upcoming reminder to calculate the time left. Please specify the reminder title or create one.";
    }
  }
  return null;
}
export async function handleGenericRetrieval(
  finalText: string,
  textForProcessing: string,
  toolsRegistry: ToolsRegistry,
  userId: string,
): Promise<string> {
  const looksGenericText =
    !finalText ||
    /^(processed your request\.?|done\.?)$/i.test(finalText.trim());
  if (looksGenericText) {
    const lower = (textForProcessing || "").toLowerCase();
    if (/\b(show|list|what|my)\b.*\breminders?\b/.test(lower)) {
      let timeframe: "today" | "tomorrow" | "week" | "month" | null = null;
      if (/\btoday'?s?|\btoday\b/.test(lower)) timeframe = "today";
      else if (/\btomorrow'?s?|\btomorrow\b/.test(lower))
        timeframe = "tomorrow";
      else if (/\bthis\s+week\b|\bweek\b/.test(lower)) timeframe = "week";
      else if (/\bthis\s+month\b|\bmonth\b/.test(lower)) timeframe = "month";
      if (timeframe) {
        const up = await toolsRegistry.executeTool("getUpcomingReminders", {
          userId,
          timeframe,
          limit: 10,
        });
        const arr: any[] = up?.reminders || [];
        if (arr.length === 0) {
          return `You have no ${timeframe} reminders.`;
        } else {
          const lines = arr.map(
            (r: any, i: number) =>
              `${i + 1}. ${r.title} - ${r.reminderTimeFormatted}${r.timeUntil ? ` (in ${r.timeUntil})` : ""}`,
          );
          return `Here ${arr.length === 1 ? "is" : "are"} your ${timeframe} reminder${arr.length === 1 ? "" : "s"}:\n${lines.join("\n")}`;
        }
      } else {
        const lr = await toolsRegistry.executeTool("listReminders", {
          userId,
          status: "pending",
          limit: 10,
        });
        const arr: any[] = lr?.reminders || [];
        if (arr.length === 0) {
          return "You have no pending reminders.";
        } else {
          const lines = arr.map(
            (r: any, i: number) =>
              `${i + 1}. ${r.title} - ${r.reminderTimeFormatted || r.reminderTime}`,
          );
          return `Your pending reminders:\n${lines.join("\n")}`;
        }
      }
    }
    if (/\b(show|list|what|my)\b.*\blists\b/.test(lower)) {
      const res = await toolsRegistry.executeTool("getLists", {
        userId,
        limit: 20,
      });
      const lists: any[] = res?.lists || [];
      if (lists.length === 0) {
        return "You don't have any lists yet.";
      } else {
        const lines = lists.map(
          (l: any, i: number) =>
            `${i + 1}. ${l.name}${l.description ? ` - ${l.description}` : ""}`,
        );
        return `Your lists:\n${lines.join("\n")}`;
      }
    }
    const m = lower.match(
      /(?:what(?:'| i)?s|show|list|display|view|get)\s+(?:on|in)\s+(?:my\s+)?([^\n]+?)\s+list/,
    );
    if (m && m[1]) {
      const listName = m[1].trim();
      const res = await toolsRegistry.executeTool("getListItems", {
        userId,
        listName,
        includeCompleted: false,
      });
      const items: any[] = res?.items || [];
      if (items.length === 0) {
        return `Your "${listName}" list is empty.`;
      } else {
        const lines = items.map(
          (it: any, i: number) =>
            `${i + 1}. ${it.isCompleted ? "✅" : "⬜"} ${it.content}`,
        );
        return `Here is your "${listName}" list:\n${lines.join("\n")}`;
      }
    }
    if (/\b(show|list)\b.*\b(notes|memories)\b/.test(lower)) {
      const res = await toolsRegistry.executeTool("listNotes", {
        userId,
        limit: 20,
      });
      const notes: any[] = res?.notes || [];
      if (notes.length === 0) {
        return "You have no notes.";
      } else {
        const lines = notes.map(
          (n: any, i: number) =>
            `${i + 1}. ${n.title ? n.title + ": " : ""}${(n.content || "").slice(0, 80)}${(n.content || "").length > 80 ? "..." : ""}`,
        );
        return `Your notes:\n${lines.join("\n")}`;
      }
    } else {
      const ms = lower.match(
        /\b(search|find)\b.*\bnotes?\b.*(?:for\s+)?"?([^"\n]+)"?/,
      );
      if (ms && ms[2]) {
        const query = ms[2];
        const res = await toolsRegistry.executeTool("searchNotes", {
          userId,
          query,
          limit: 20,
        });
        const results: any[] = res?.notes || res?.results || [];
        if (results.length === 0) {
          return `No notes found for "${query}".`;
        } else {
          const lines = results.map(
            (n: any, i: number) =>
              `${i + 1}. ${n.title ? n.title + ": " : ""}${(n.content || n.excerpt || "").slice(0, 80)}${(n.content || n.excerpt || "").length > 80 ? "..." : ""}`,
          );
          return `Found ${results.length} note${results.length === 1 ? "" : "s"} for "${query}":\n${lines.join("\n")}`;
        }
      }
    }
    const mediaTypeMatch = lower.match(
      /\b(images?|photos?|pictures?)\b|\baudio\b|\bvideos?\b|\bdocuments?\b/,
    );
    if (
      /\b(show|list|what)\b.*\b(media|attachments?)\b/.test(lower) ||
      mediaTypeMatch
    ) {
      let mediaType: "image" | "audio" | "video" | "document" | undefined;
      if (mediaTypeMatch) {
        const t = mediaTypeMatch[0];
        if (/images?|photos?|pictures?/.test(t)) mediaType = "image";
        else if (/audio/.test(t)) mediaType = "audio";
        else if (/videos?/.test(t)) mediaType = "video";
        else if (/documents?/.test(t)) mediaType = "document";
      }
      const res = await toolsRegistry.executeTool("getMediaHistory", {
        userId,
        mediaType,
        limit: 10,
      });
      const list: any[] = res?.attachments || res?.history || res?.media || [];
      if (!list || list.length === 0) {
        return `No ${mediaType || "recent"} media found.`;
      } else {
        const lines = list.map(
          (m: any, i: number) =>
            `${i + 1}. ${(m.media_type || m.mediaType || "file").toString()} - ${(m.file_url || m.fileUrl || m.title || "").toString().slice(0, 60)}`,
        );
        return `Your ${mediaType || "recent"} media:\n${lines.join("\n")}`;
      }
    }
    if (finalText) return finalText;
  }
  return finalText;
}
