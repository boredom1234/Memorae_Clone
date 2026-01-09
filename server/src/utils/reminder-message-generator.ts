import { generateText } from "ai";
import { groq } from "@ai-sdk/groq";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { config } from "../config/env";
import pino from "pino";

const logger = pino({ level: "info" });

interface ReminderContext {
  title: string;
  notes?: string;
  priority: "low" | "medium" | "high";
  isRecurring: boolean;
  timeStr: string;
  dateStr: string;
  userName?: string;
}

// Templates for variety when AI is unavailable
const FRIENDLY_TEMPLATES = [
  (ctx: ReminderContext) =>
    `Hey${
      ctx.userName ? ` ${ctx.userName}` : ""
    }! 👋 Quick heads up - it's time for "${ctx.title}"${
      ctx.notes ? `. ${ctx.notes}` : ""
    }`,
  (ctx: ReminderContext) =>
    `Just a friendly nudge${ctx.userName ? `, ${ctx.userName}` : ""} 🔔 "${
      ctx.title
    }" is due now!${ctx.notes ? ` (${ctx.notes})` : ""}`,
  (ctx: ReminderContext) =>
    `${ctx.priority === "high" ? "🔥 Important! " : ""}Time to "${ctx.title}"${
      ctx.userName ? `, ${ctx.userName}` : ""
    }!${ctx.notes ? ` Remember: ${ctx.notes}` : ""}`,
  (ctx: ReminderContext) =>
    `Don't forget${ctx.userName ? `, ${ctx.userName}` : ""}! ⏰ "${
      ctx.title
    }" is happening now.${ctx.notes ? ` Notes: ${ctx.notes}` : ""}`,
  (ctx: ReminderContext) =>
    `${ctx.userName ? `${ctx.userName}, ` : ""}Your reminder: "${
      ctx.title
    }" 📌${ctx.priority === "high" ? " (High priority!)" : ""}${
      ctx.notes ? ` - ${ctx.notes}` : ""
    }`,
];

function getRandomTemplate(ctx: ReminderContext): string {
  const template =
    FRIENDLY_TEMPLATES[Math.floor(Math.random() * FRIENDLY_TEMPLATES.length)];
  let message = template(ctx);

  // Add time info
  message += `\n\n📅 ${ctx.dateStr} at ${ctx.timeStr}`;

  if (ctx.isRecurring) {
    message += "\n🔄 This repeats on schedule";
  }

  return message;
}

function getModel() {
  try {
    // Prefer fast models for notifications
    if (config.ai.groqApiKey) {
      return groq("llama-3.1-8b-instant");
    }
    if (config.ai.openaiApiKey) {
      return openai("gpt-4o-mini");
    }
    if (config.ai.googleApiKey) {
      return google("gemini-2.0-flash");
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Generate a natural, friendly reminder notification message using AI.
 * Falls back to templates if AI is unavailable or slow.
 */
export async function generateReminderMessage(
  ctx: ReminderContext
): Promise<string> {
  const model = getModel();

  // If no AI model available, use templates
  if (!model) {
    return getRandomTemplate(ctx);
  }

  try {
    const hasNotes = ctx.notes && ctx.notes.trim().length > 0;
    const prompt = `Write a SHORT, friendly reminder notification. Use ONLY the exact information provided below. DO NOT invent or add any details.

EXACT DATA (use only this):
- Task name: "${ctx.title}"
- Time: ${ctx.dateStr} at ${ctx.timeStr}
${hasNotes ? `- Notes: "${ctx.notes}"` : "- Notes: (none provided)"}
- Priority: ${ctx.priority}
- Recurring: ${ctx.isRecurring ? "yes" : "no"}
${ctx.userName ? `- Name: ${ctx.userName}` : ""}

STRICT RULES:
1. ONLY mention information from the EXACT DATA above
2. NEVER invent details, examples, or suggestions
3. Keep it to 1-2 short sentences max
4. Use the task name exactly as given
5. ${
      hasNotes
        ? "Include the notes exactly as provided"
        : "Do NOT mention notes since none were provided"
    }
6. Add 1 emoji at most
7. Be friendly but brief

Output only the message, nothing else.`;

    const result = await Promise.race([
      generateText({
        model,
        prompt,
      } as any),
      // Timeout after 3 seconds - notifications should be fast
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);

    if (
      result &&
      typeof result === "object" &&
      "text" in result &&
      result.text
    ) {
      const aiMessage = result.text.trim();
      // Validate the AI response is reasonable
      if (aiMessage.length > 10 && aiMessage.length < 500) {
        return aiMessage;
      }
    }

    // AI failed or timed out, use template
    return getRandomTemplate(ctx);
  } catch (error) {
    logger.warn({ error }, "AI message generation failed, using template");
    return getRandomTemplate(ctx);
  }
}

/**
 * Quick sync version using only templates (no AI)
 * Use this when you need instant response
 */
export function generateReminderMessageSync(ctx: ReminderContext): string {
  return getRandomTemplate(ctx);
}
