export class DynamoError extends Error {
  constructor(
    message: string,
    public readonly originalError: Error,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DynamoError";

    // Maintains proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DynamoError);
    }
  }
}

export class ConditionalCheckFailedError extends DynamoError {
  constructor(message: string, originalError: Error, context?: Record<string, unknown>) {
    super(message, originalError, context);
    this.name = "ConditionalCheckFailedError";
  }
}

export class ResourceNotFoundError extends DynamoError {
  constructor(message: string, originalError: Error, context?: Record<string, unknown>) {
    super(message, originalError, context);
    this.name = "ResourceNotFoundError";
  }
}
