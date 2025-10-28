import pino from "pino";
const isProd = process.env.NODE_ENV === "production";
export const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),
  base: { service: "memorae-server" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "*.password",
      "*.token",
      "*.accessToken",
      "*.refreshToken",
      "*.apiKey",
      "headers.authorization",
      "req.headers.authorization",
      "request.headers.authorization",
      "config.ai.*ApiKey",
      "config.*.*ApiKey",
      "process.env.*_KEY",
      "process.env.*_TOKEN",
    ],
    censor: "[REDACTED]",
  },
  transport: !isProd
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "UTC:yyyy-mm-dd'T'HH:MM:ss.l'Z'",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});
export const createLogger = (bindings: Record<string, any>) =>
  logger.child(bindings || {});
export const logInfo = (message: string, data?: any) => {
  logger.info(data || {}, message);
};
export const logError = (message: string, error: any, context?: any) => {
  logger.error(
    {
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code,
        statusCode: error.statusCode,
      },
      context,
    },
    message,
  );
};
export const logWarn = (message: string, data?: any) => {
  logger.warn(data || {}, message);
};
export const logDebug = (message: string, data?: any) => {
  logger.debug(data || {}, message);
};
export const logPerformance = (
  operation: string,
  duration: number,
  metadata?: any,
) => {
  logger.info(
    {
      operation,
      duration_ms: duration,
      ...metadata,
    },
    `Performance: ${operation} took ${duration}ms`,
  );
};
export const logAudit = (
  action: string,
  userId: string,
  resource: string,
  metadata?: any,
) => {
  logger.info(
    {
      audit: true,
      action,
      userId,
      resource,
      timestamp: new Date().toISOString(),
      ...metadata,
    },
    `Audit: ${action} on ${resource} by user ${userId}`,
  );
};
export async function withTiming<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, any>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    logPerformance(operation, Date.now() - start, metadata);
    return result;
  } catch (error: any) {
    logError(`Operation failed: ${operation}`, error, metadata);
    throw error;
  }
}
