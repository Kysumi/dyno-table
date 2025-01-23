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
export class ValidationError extends DynamoError {
  constructor(message: string, originalError: Error, context: ErrorContext) {
    super(message, originalError, context);
    this.name = "ValidationError";
  }

  static fromDynamoError(message: string, originalError: Error, context: ErrorContext): ValidationError {
    // Provide clearer explanations for specific error messages
    if (message.includes("The document path provided in the update expression is invalid for update")) {
      message +=
        "\n\nThe PK and/or SK provided does not find a single record in the table. Please ensure the PK and SK are correct and match the table's schema";
    } else if (message.includes("One or more parameter values were invalid")) {
      message +=
        "The operation failed due to invalid parameter values. Check your query parameters and ensure they meet the expected format and constraints.";
    } else if (message.includes("The provided key element does not match the schema")) {
      message +=
        "The key provided does not match the table's schema. Verify that your key attributes are correct and conform to the table's key schema.";
    }

    return new ValidationError(message, originalError, context);
  }
}
