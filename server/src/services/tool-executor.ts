import { AppError } from "../utils/errors";
import { logError, logInfo } from "../utils/logger";
export async function executeTool(
  toolName: string,
  params: any,
  getTools: () => any,
): Promise<any> {
  try {
    logInfo(`Executing tool: ${toolName}`, { toolName, hasParams: !!params });
    const tools = getTools();
    const tool = tools[toolName as keyof typeof tools];
    if (!tool) {
      throw new AppError(`Tool "${toolName}" not found`, 404, "TOOL_NOT_FOUND");
    }
    const result = await tool.handler(params);
    logInfo(`Tool executed successfully: ${toolName}`, { toolName });
    return result;
  } catch (error) {
    logError(`Failed to execute tool: ${toolName}`, error, {
      toolName,
      params,
    });
    if (error instanceof AppError) {
      // Don't throw, return the error as a result so the LLM can see it
      return {
        success: false,
        error: error.message,
        code: error.statusCode,
        details: error.details,
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      code: 500,
      details: { toolName, originalError: error },
    };
  }
}
