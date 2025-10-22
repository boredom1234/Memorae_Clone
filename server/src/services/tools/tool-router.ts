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
  const prompt = `You are an expert AI router. Your task is to select the single most appropriate tool to handle the user's request.
You must choose from the following list of tools:
${toolList}

Analyze the user's query and determine which tool is the best fit.

- If the query is a command or a request that a tool can handle, respond with the name of that tool.
- If the query is a simple greeting, a question, or a conversation that does not require a tool, respond with "no_tool_needed".
- If multiple tools seem relevant, choose the one that is most specific to the user's primary intent.
- Your response MUST be a JSON object with a single key "toolName" and the string value of the selected tool name.
 - Return only JSON. No prose. No markdown. No extra text.

Example user query: "remind me to call mom at 5pm"
Your response: { "toolName": "createReminder" }

Example user query: "hey how are you?"
Your response: { "toolName": "no_tool_needed" }

User query: ${userQuery}
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
    logInfo(`Router selected tool: ${selectedTool}`);
    return selectedTool;
  } catch (error) {
    logError("Error in tool router LLM call", error, { userQuery });
    return "no_tool_needed";
  }
}
