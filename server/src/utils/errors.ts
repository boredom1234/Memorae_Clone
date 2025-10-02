// Custom Error Classes for better error handling

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code: string = "INTERNAL_ERROR",
    public details?: any,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} with identifier "${identifier}" not found`
      : `${resource} not found`;
    super(message, 404, "NOT_FOUND");
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 500, "DATABASE_ERROR", details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 409, "CONFLICT_ERROR", details);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = "Too many requests") {
    super(message, 429, "RATE_LIMIT_ERROR");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}

// Error handler wrapper for async functions
export function handleServiceError(error: any, context: string): never {
  if (error instanceof AppError) {
    throw error;
  }

  // Handle Supabase/PostgreSQL errors
  if (error.code) {
    switch (error.code) {
      case "23505": // unique_violation
        throw new ConflictError("Resource already exists", {
          original: error.message,
        });
      case "23503": // foreign_key_violation
        throw new ValidationError("Referenced resource does not exist", {
          original: error.message,
        });
      case "23502": // not_null_violation
        throw new ValidationError("Required field is missing", {
          original: error.message,
        });
      case "PGRST116": // No rows found
        throw new NotFoundError("Resource");
      default:
        throw new DatabaseError(`Database error in ${context}`, {
          code: error.code,
          message: error.message,
        });
    }
  }

  // Generic error
  throw new AppError(
    `Unexpected error in ${context}: ${error.message}`,
    500,
    "INTERNAL_ERROR",
    { original: error },
  );
}
