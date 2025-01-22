import type { ErrorContext } from "./types";

export class DynamoError extends Error {
  constructor(
    message: string,
    public readonly originalError: Error,
    public readonly context?: ErrorContext,
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
  constructor(message: string, originalError: Error, context?: ErrorContext) {
    super(message, originalError, context);
    this.name = "ConditionalCheckFailedError";
  }
}

export class ResourceNotFoundError extends DynamoError {
  constructor(message: string, originalError: Error, context?: ErrorContext) {
    super(message, originalError, context);
    this.name = "ResourceNotFoundError";
  }
}
