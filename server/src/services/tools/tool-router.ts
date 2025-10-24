import { generateText } from "ai";
import { groq } from "@ai-sdk/groq";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { logInfo, logError, logWarn } from "../../utils/logger";
import { config } from "../../config/env";
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
  toolDefinitions: ToolDefinition[],
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
   
2. **MUTATION TOOLS** (create, update, delete) - ONLY use when user clearly wants to modify data:
   - Must have enough context to perform the action
   - If unclear, prefer "no_tool_needed" to let AI ask for clarification
   
3. **NO TOOL** for:
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
"what's on my shopping list?" → {"toolName": "getListItems"}
"show me my grocery list" → {"toolName": "getListItems"}
"my lists" → {"toolName": "getLists"}
"show my notes" → {"toolName": "listNotes"}
"search my notes for meeting" → {"toolName": "searchNotes"}
"find reminders about doctor" → {"toolName": "searchReminders"}

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
            "Router JSON parse fallback failed; defaulting to no_tool_needed.",
          );
          selectedTool = "no_tool_needed";
        }
      } else {
        logWarn("Router returned non-JSON; defaulting to no_tool_needed.");
      }
    }
    if (!selectedTool) {
      logWarn(
        "Tool router did not return a tool name. Defaulting to no_tool_needed.",
      );
      return "no_tool_needed";
    }
    if (selectedTool !== "no_tool_needed") {
      const toolExists = toolDefinitions.some((t) => t.name === selectedTool);
      if (!toolExists) {
        logWarn(
          `Router selected invalid tool: ${selectedTool}. Available tools: ${toolDefinitions.map((t) => t.name).join(", ")}`,
        );
        return "no_tool_needed";
      }
    }
    logInfo(`Router selected tool: ${selectedTool}`);
    return selectedTool;
  } catch (error) {
    logError("Error in tool router LLM call", error, { userQuery });
    return "no_tool_needed";
  }
}
