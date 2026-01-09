import { generateText } from "ai";
import { groq } from "@ai-sdk/groq";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { logInfo, logError, logWarn } from "../../utils/logger";
import { config } from "../../config/env";
// Self-healing helpers
function normalizeText(s: string) {
  return (s || "").toLowerCase().trim();
}
function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}
function bestFuzzyMatch(
  candidate: string,
  toolNames: string[],
  maxDistance = 3
): string | null {
  const c = normalizeText(candidate);
  let best: { name: string; dist: number } | null = null;
  for (const name of toolNames) {
    const dist = levenshtein(c, normalizeText(name));
    if (best === null || dist < best.dist) best = { name, dist };
  }
  if (best && best.dist <= maxDistance) return best.name;
  return null;
}
function keywordMap(userQuery: string, available: string[]): string | null {
  const q = normalizeText(userQuery);
  const tryReturn = (name: string) => (available.includes(name) ? name : null);
  // Time-left or upcoming content → retrieval tools
  if (/\b(time left|how long|time until|remaining time)\b/.test(q)) {
    return (
      tryReturn("getUpcomingReminders") || tryReturn("listReminders") || null
    );
  }
  // Explicit time/date requests
  if (
    /\b(what('s| is) the time|current time|time now|date today|what day)\b/.test(
      q
    )
  ) {
    return tryReturn("getCurrentTime");
  }
  // Bulk Reminder Operations (check BEFORE single-item patterns)
  if (
    /\b(delete|clear|remove)\s+(all|every)\s+(reminder|reminders)\s+(except|but|besides)\b/.test(
      q
    )
  ) {
    return tryReturn("bulkDeleteRemindersExcept");
  }
  if (
    /\b(complete|finish|done|mark)\s+(all|every)\s+(reminder|reminders)\b/.test(
      q
    )
  ) {
    return tryReturn("bulkCompleteReminders");
  }
  if (
    /\b(snooze|postpone|delay)\s+(all|every)\s+(reminder|reminders)\b/.test(q)
  ) {
    return tryReturn("bulkSnoozeReminders");
  }
  // Single Reminders
  if (
    /\b(remind me|set (a )?reminder|schedule (a )?(reminder|alarm)|timer|alarm|ping me|nudge me|alert me)\b/.test(
      q
    )
  ) {
    return tryReturn("createReminder");
  }
  if (/\b(upcoming|today'?s|tomorrow'?s)\s+(reminder|reminders)\b/.test(q)) {
    return tryReturn("getUpcomingReminders") || tryReturn("listReminders");
  }
  if (/\b(show|list|what (are|are my))\s+(my\s+)?reminders\b/.test(q)) {
    return tryReturn("listReminders");
  }
  if (/\b(search|find|look for)\s+(reminder|reminders)\b/.test(q)) {
    return tryReturn("searchReminders");
  }
  if (/\b(complete|mark as done|done|finish)\s+(reminder|it|this)\b/.test(q)) {
    return tryReturn("completeReminder");
  }
  if (/\b(delete|remove|cancel|clear)\s+(reminder|it|this)\b/.test(q)) {
    return tryReturn("deleteReminder");
  }
  if (/\b(snooze|postpone|delay|push back|later)\b/.test(q)) {
    return tryReturn("snoozeReminder");
  }
  // Bulk Note Operations (check BEFORE single-item patterns)
  if (
    /\b(delete|clear|remove)\s+(all|every)\s+(note|notes)\s+(except|but|besides)\b/.test(
      q
    )
  ) {
    return tryReturn("bulkDeleteNotesExcept");
  }
  if (/\b(archive)\s+(all|every)\s+(note|notes)\b/.test(q)) {
    return tryReturn("bulkArchiveNotes");
  }
  // Note operations - duplicate, merge, summarize, extract
  if (/\b(duplicate|copy)\s+(the\s+)?(note|notes)\b/.test(q)) {
    return tryReturn("duplicateNote");
  }
  if (/\b(summarize|summary)\s+(my\s+)?(note|notes)\b/.test(q)) {
    return tryReturn("summarizeNotes");
  }
  if (/\b(merge|combine|join)\s+(the\s+)?(note|notes)\b/.test(q)) {
    return tryReturn("mergeNotes");
  }
  if (
    /\b(extract|get)\s+(tasks?|todos?)\s+(from|in)\s+(the\s+)?(note|notes)\b/.test(
      q
    )
  ) {
    return tryReturn("extractTasksFromNote");
  }
  // Single Notes
  if (
    /\b(remember this|take a note|make a note|note this|^note:|save this|store this|create (a )?note)\b/.test(
      q
    )
  ) {
    return tryReturn("createNote");
  }
  if (/\b(show|list)\s+(notes|memories)\b/.test(q)) {
    return tryReturn("listNotes");
  }
  if (/^(search|find)\s+(note|notes|memory|memories)\b/.test(q)) {
    return tryReturn("searchNotes");
  }
  // Lists
  // Bulk delete lists - "delete these lists", "delete all lists except"
  if (/\b(delete|remove)\s+(all|these|multiple)\s+lists\b/.test(q)) {
    return tryReturn("bulkDeleteLists");
  }
  if (
    /\b(delete|remove)\s+(all|every)\s+lists?\s+(except|but|besides)\b/.test(q)
  ) {
    return tryReturn("bulkDeleteListsExcept");
  }
  // List operations - archive, duplicate, move, reorder, clear
  if (/\b(archive)\s+(the\s+)?(.+?\s+)?list\b/.test(q)) {
    return tryReturn("archiveList");
  }
  if (/\b(duplicate|copy)\s+(the\s+)?(.+?\s+)?list\b/.test(q)) {
    return tryReturn("duplicateList");
  }
  if (
    /\b(move|transfer)\s+.+\s+(to|into)\s+(another|different)\s+list\b/.test(q)
  ) {
    return tryReturn("moveItemToList");
  }
  if (/\b(reorder|rearrange|sort)\s+(the\s+)?(.+?\s+)?list\b/.test(q)) {
    return tryReturn("reorderListItems");
  }
  if (/\b(clear|remove)\s+(completed|done|checked)\s+(items?)?\b/.test(q)) {
    return tryReturn("clearCompletedItems");
  }
  if (/\b(complete|check|mark)\s+(all|every)\s+(items?)?\b/.test(q)) {
    return tryReturn("bulkCompleteItems");
  }
  // Single list deletion
  if (/\b(delete|remove)\s+(the\s+)?(.+?\s+)?list\b/.test(q)) {
    return tryReturn("deleteList");
  }
  if (
    /\b(show|what are|list)\s+(my\s+)?lists\b/.test(q) ||
    /\b(todo|to-do|tasks?)\b/.test(q)
  ) {
    return tryReturn("getLists");
  }
  if (/\b(what'?s on|show|list)\s+my\s+(.+?)\s+list\b/.test(q)) {
    return tryReturn("getListItems");
  }
  if (/\b(add|put|include)\s+.+\s+(to|into|onto)\s+.+\s+list\b/.test(q)) {
    return tryReturn("addItemToList");
  }
  // Bulk removal - "delete all except", "remove everything but", "clear except"
  if (
    /\b(delete|remove|clear)\s+(all|everything)\s+(except|but|besides)\b/.test(
      q
    )
  ) {
    return tryReturn("bulkRemoveItemsExcept");
  }
  if (/\b(remove|delete|take off)\s+.+\s+from\s+.+\s+list\b/.test(q)) {
    return tryReturn("removeItemFromList");
  }
  // Reminder operations - archive, batch
  if (/\b(archive)\s+(the\s+)?(reminder|reminders)\b/.test(q)) {
    return tryReturn("archiveReminder");
  }
  if (
    /\b(create|set|add)\s+(multiple|several|batch)\s+(reminder|reminders)\b/.test(
      q
    ) ||
    // "Set reminder X and reminder Y" or "Set reminder on X and on Y"
    /\b(and\s+(also\s+)?(set|create|add)?\s*(a\s+)?reminder|and\s+on\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\b/.test(
      q
    )
  ) {
    return tryReturn("batchCreateReminders");
  }
  // Media operations
  if (
    /\b(create|extract|get)\s+(reminder|reminders)\s+(from|in)\s+(this\s+)?(image|photo|picture)\b/.test(
      q
    )
  ) {
    return tryReturn("createRemindersFromImage");
  }
  if (
    /\b(extract|get)\s+(list|items)\s+(from|in)\s+(this\s+)?(image|photo|picture)\b/.test(
      q
    )
  ) {
    return tryReturn("extractListFromImage");
  }
  // Notifications
  if (/\b(send|message|notify)\b.*\b(contact|someone|friend)\b/.test(q)) {
    return tryReturn("sendCustomMessage");
  }
  return null;
}
function getRoutingModel() {
  try {
    if (config.ai.groqApiKey) return groq("llama-3.1-8b-instant");
  } catch {}
  try {
    if (config.ai.googleApiKey) return google("gemini-1.5-flash");
  } catch {}
  try {
    if (config.ai.openaiApiKey) return openai("gpt-4o-mini");
  } catch {}
  return groq("llama-3.1-8b-instant");
}
interface ToolDefinition {
  name: string;
  description: string;
}
export async function routeToTool(
  userQuery: string,
  toolDefinitions: ToolDefinition[]
): Promise<string> {
  logInfo("Routing query to a tool...", {
    query: userQuery.substring(0, 50) + "...",
  });
  const toolList = toolDefinitions
    .map((tool) => `- ${tool.name}: ${tool.description}`)
    .join("\n");
  const prompt = `You are an expert tool router for a task management system. Select the SINGLE BEST tool for the user's request.

Available tools:
${toolList}

ROUTING RULES:
1. **RETRIEVAL TOOLS** (list, get, show, search) - Use for ANY query asking to see/view/retrieve data:
   - "my reminders" → YES, use listReminders or getUpcomingReminders
   - "upcoming reminders?" → YES, use getUpcomingReminders
   - "what's on my list?" → YES, use getListItems
   - "show notes" → YES, use listNotes
   - "time left for reminder" → YES, use listReminders (NOT getCurrentTime)
   - "how long until" → YES, use getUpcomingReminders (NOT getCurrentTime)
   
2. **MUTATION TOOLS** (create, update, delete) - ONLY use when user clearly wants to modify data:
   - Must have enough context to perform the action
   - If unclear, prefer "no_tool_needed" to let AI ask for clarification
   
3. **getCurrentTime** - ONLY use when user asks EXPLICITLY for current time/date:
   - "what time is it?" → YES
   - "what's the date?" → YES
   - "time left for reminder" → NO (use listReminders instead)
   - "how long until" → NO (use getUpcomingReminders instead)
   
4. **NO TOOL** for:
   - Greetings, off-topic questions, gratitude
   - Vague follow-ups without context ("what?", "when?", "which one?")
   - General knowledge questions not related to user's data

EXAMPLES - RETRIEVAL TOOLS (LOW threshold):
"my upcoming reminders?" → {"toolName": "getUpcomingReminders"}
"upcoming reminders" → {"toolName": "getUpcomingReminders"}
"show my reminders" → {"toolName": "listReminders"}
"what reminders do I have today?" → {"toolName": "getUpcomingReminders"}
"reminders for today" → {"toolName": "getUpcomingReminders"}
"today's reminders" → {"toolName": "getUpcomingReminders"}
"my reminders" → {"toolName": "listReminders"}
"how much time is left for my reminder?" → {"toolName": "listReminders"}
"time left for the reminder" → {"toolName": "listReminders"}
"how long until my reminder?" → {"toolName": "getUpcomingReminders"}
"when is my reminder?" → {"toolName": "listReminders"}
"what's on my shopping list?" → {"toolName": "getListItems"}
"show me my grocery list" → {"toolName": "getListItems"}
"my lists" → {"toolName": "getLists"}
"show my notes" → {"toolName": "listNotes"}
"search my notes for meeting" → {"toolName": "searchNotes"}
"find reminders about doctor" → {"toolName": "searchReminders"}

EXAMPLES - getCurrentTime (ONLY explicit time requests):
"what time is it?" → {"toolName": "getCurrentTime"}
"what's the time now?" → {"toolName": "getCurrentTime"}
"current date?" → {"toolName": "getCurrentTime"}
"what day is today?" → {"toolName": "getCurrentTime"}

EXAMPLES - MUTATION TOOLS (HIGHER threshold):
"remind me to call mom at 5pm" → {"toolName": "createReminder"}
"set a reminder for dentist appointment tomorrow 2pm" → {"toolName": "createReminder"}
"add milk to groceries" → {"toolName": "addItemToList"}
"add eggs and bread to shopping list" → {"toolName": "addItemToList"}
"delete reminder about dentist" → {"toolName": "deleteReminder"}
"remove the dentist reminder" → {"toolName": "deleteReminder"}
"remember that John's birthday is May 5th" → {"toolName": "createNote"}
"note: meeting notes from today" → {"toolName": "createNote"}
"create a new todo list" → {"toolName": "createList"}
"make a shopping list" → {"toolName": "createList"}

EXAMPLES - NO TOOL:
"hey how are you?" → {"toolName": "no_tool_needed"}
"what's the weather?" → {"toolName": "no_tool_needed"}
"which day?" → {"toolName": "no_tool_needed"}
"what?" → {"toolName": "no_tool_needed"}
"when?" → {"toolName": "no_tool_needed"}
"tell me more" → {"toolName": "no_tool_needed"}
"thanks" → {"toolName": "no_tool_needed"}
"ok" → {"toolName": "no_tool_needed"}

IMPORTANT:
- Return ONLY valid JSON: {"toolName": "exact_tool_name"}
- Tool name must exactly match one from the list above OR be "no_tool_needed"
- No markdown, no explanations, ONLY JSON

User query: "${userQuery}"
Your response:`;
  try {
    const { text } = await generateText({
      model: getRoutingModel(),
      prompt: prompt,
      temperature: 0,
    });
    let selectedTool = "no_tool_needed";
    try {
      const parsed = JSON.parse(text);
      selectedTool = parsed.toolName;
    } catch (e) {
      const match = text.match(/\{[\s\S]*\}/g);
      if (match && match.length > 0) {
        try {
          const parsed = JSON.parse(match[match.length - 1]);
          selectedTool = parsed.toolName || "no_tool_needed";
        } catch (e2) {
          logWarn(
            "Router JSON parse fallback failed; defaulting to no_tool_needed."
          );
          selectedTool = "no_tool_needed";
        }
      } else {
        logWarn("Router returned non-JSON; defaulting to no_tool_needed.");
      }
    }
    const availableNames = toolDefinitions.map((t) => t.name);
    // If router said 'no_tool_needed', try deterministic keyword mapping first
    if (selectedTool === "no_tool_needed") {
      const byKeyword = keywordMap(userQuery, availableNames);
      if (byKeyword) {
        logInfo(`Keyword mapping selected tool: ${byKeyword}`);
        return byKeyword;
      }
    }
    // If router produced an invalid tool name, try fuzzy match to the closest available
    if (selectedTool !== "no_tool_needed") {
      const exact = availableNames.includes(selectedTool);
      if (!exact) {
        const fuzzy = bestFuzzyMatch(selectedTool, availableNames, 3);
        if (fuzzy) {
          logWarn(
            `Router selected invalid tool '${selectedTool}'. Fuzzy-mapped to '${fuzzy}'.`
          );
          return fuzzy;
        }
        // As a last resort, try keyword mapping from the user query
        const byKeyword = keywordMap(userQuery, availableNames);
        if (byKeyword) {
          logWarn(
            `Router selected invalid tool '${selectedTool}'. Keyword-mapped to '${byKeyword}'.`
          );
          return byKeyword;
        }
        logWarn(
          `Router selected invalid tool: ${selectedTool}. Available tools: ${availableNames.join(
            ", "
          )}`
        );
        return "no_tool_needed";
      }
    }
    logInfo(`Router selected tool: ${selectedTool}`);
    return selectedTool;
  } catch (error) {
    logError("Error in tool router LLM call", error, { userQuery });
    // On error, try a deterministic mapping so simple requests still work
    try {
      const availableNames = toolDefinitions.map((t) => t.name);
      const byKeyword = keywordMap(userQuery, availableNames);
      if (byKeyword) return byKeyword;
    } catch {}
    return "no_tool_needed";
  }
}
