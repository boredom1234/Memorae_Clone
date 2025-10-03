import pino from "pino";

// Create logger instance
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        }
      : undefined,
});

// Helper functions for structured logging
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

// Performance logging
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

// Audit logging
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
