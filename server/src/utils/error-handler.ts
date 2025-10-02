import { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "./errors";
import pino from "pino";

const logger = pino({ level: "info" });

export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  timestamp: string;
  path?: string;
  requestId?: string;
}

/**
 * Global error handler for Fastify
 */
export function globalErrorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const timestamp = new Date().toISOString();
  const path = request.url;
  const requestId = request.id;

  // Log the error with context
  logger.error({
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      statusCode: error.statusCode,
    },
    request: {
      method: request.method,
      url: request.url,
      headers: request.headers,
      params: request.params,
      query: request.query,
      ip: request.ip,
    },
    requestId,
  }, "Request error occurred");

  let statusCode = 500;
  let message = "Internal Server Error";
  let errorType = "INTERNAL_ERROR";

  // Handle different error types
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = error.message;
    errorType = error.code;
  } else if (error.statusCode) {
    statusCode = error.statusCode;
    message = error.message;
  } else if (error.name === "ValidationError") {
    statusCode = 400;
    message = "Invalid request data";
    errorType = "VALIDATION_ERROR";
  } else if (error.name === "UnauthorizedError") {
    statusCode = 401;
    message = "Unauthorized";
    errorType = "UNAUTHORIZED";
  } else if (error.code === "ECONNREFUSED") {
    statusCode = 503;
    message = "Service temporarily unavailable";
    errorType = "SERVICE_UNAVAILABLE";
  }

  // Don't expose internal errors in production
  if (process.env.NODE_ENV === "production" && statusCode === 500) {
    message = "Internal Server Error";
  }

  const errorResponse: ErrorResponse = {
    error: errorType,
    message,
    statusCode,
    timestamp,
    path,
    requestId,
  };

  reply.status(statusCode).send(errorResponse);
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler<T extends any[], R>(
  fn: (...args: T) => Promise<R>
) {
  return (...args: T): Promise<R> => {
    return Promise.resolve(fn(...args)).catch((error) => {
      // Re-throw to be caught by global error handler
      throw error;
    });
  };
}

/**
 * Safe async execution with error handling
 */
export async function safeAsync<T>(
  operation: () => Promise<T>,
  fallback?: T,
  context?: string
): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error) {
    logger.error({ error, context }, "Safe async operation failed");
    return fallback;
  }
}

/**
 * Retry mechanism for operations
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000,
  context?: string
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      logger.warn({
        error: lastError.message,
        attempt,
        maxRetries,
        context,
      }, "Operation failed, retrying...");

      if (attempt === maxRetries) {
        break;
      }

      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt - 1)));
    }
  }

  throw new AppError(
    `Operation failed after ${maxRetries} attempts: ${lastError!.message}`,
    500,
    "RETRY_EXHAUSTED"
  );
}

/**
 * Circuit breaker pattern for external services
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000 // 1 minute
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new AppError(
          'Circuit breaker is OPEN',
          503,
          'CIRCUIT_BREAKER_OPEN'
        );
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
    }
  }

  getState() {
    return this.state;
  }
}
