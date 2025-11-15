/**
 * Utility functions for error handling
 *
 * This module provides helper functions for wrapping AWS SDK errors,
 * extracting information from errors, and formatting error context.
 */

import type {
  BatchError,
  ConfigurationError,
  DynoTableError,
  EntityError,
  EntityValidationError,
  ExpressionError,
  IndexGenerationError,
  KeyGenerationError,
  OperationError,
  TransactionError,
  ValidationError,
} from "../errors";

/**
 * Checks if an error is a DynamoDB conditional check failure
 *
 * @param error - The error to check
 * @returns true if the error is a conditional check failure
 */
export function isConditionalCheckFailed(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "name" in error) {
    return error.name === "ConditionalCheckFailedException";
  }
  return false;
}

/**
 * Checks if an error is a DynamoDB transaction cancellation
 *
 * @param error - The error to check
 * @returns true if the error is a transaction cancellation
 */
export function isTransactionCanceled(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "name" in error) {
    return error.name === "TransactionCanceledException";
  }
  return false;
}

/**
 * Checks if an error is a DynamoDB validation exception
 *
 * @param error - The error to check
 * @returns true if the error is a validation exception
 */
export function isValidationException(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "name" in error) {
    return error.name === "ValidationException";
  }
  return false;
}

/**
 * Checks if an error is a DynamoDB provisioned throughput exceeded exception
 *
 * @param error - The error to check
 * @returns true if the error is a throughput exceeded exception
 */
export function isProvisionedThroughputExceeded(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "name" in error) {
    return error.name === "ProvisionedThroughputExceededException";
  }
  return false;
}

/**
 * Checks if an error is a retryable error
 *
 * Retryable errors include:
 * - ProvisionedThroughputExceededException
 * - ThrottlingException
 * - RequestLimitExceeded
 * - InternalServerError
 * - ServiceUnavailable
 *
 * @param error - The error to check
 * @returns true if the error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "name" in error) {
    const errorName = (error as { name: string }).name;
    return (
      errorName === "ProvisionedThroughputExceededException" ||
      errorName === "ThrottlingException" ||
      errorName === "RequestLimitExceeded" ||
      errorName === "InternalServerError" ||
      errorName === "ServiceUnavailable"
    );
  }
  return false;
}

/**
 * Extracts the AWS error code from an error
 *
 * @param error - The error to extract the code from
 * @returns The error code, or undefined if not found
 */
export function getAwsErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "name" in error) {
    return (error as { name: string }).name;
  }
  return undefined;
}

/**
 * Extracts the AWS error message from an error
 *
 * @param error - The error to extract the message from
 * @returns The error message, or undefined if not found
 */
export function getAwsErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message);
  }
  return undefined;
}

/**
 * Attempts to extract required attribute names from an error message
 *
 * This is a best-effort function that looks for common patterns in error
 * messages to identify which attributes are missing or required.
 *
 * @param error - The error to extract attributes from
 * @returns Array of attribute names, or undefined if none found
 */
export function extractRequiredAttributes(error: unknown): string[] | undefined {
  const message = getAwsErrorMessage(error);
  if (!message) return undefined;

  // Common patterns for missing attributes
  const patterns = [
    /(?:missing|required)\s+(?:attribute|field|property)(?:s)?[:\s]+([a-zA-Z0-9_,\s]+)/i,
    /(?:attribute|field|property)[:\s]+([a-zA-Z0-9_]+)\s+is\s+(?:missing|required)/i,
    /"([a-zA-Z0-9_]+)"\s+is\s+(?:missing|required)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      // Split by commas and clean up whitespace
      return match[1]
        .split(",")
        .map((attr) => attr.trim())
        .filter((attr) => attr.length > 0);
    }
  }

  return undefined;
}

/**
 * Formats error context for logging
 *
 * Converts the error context object to a readable string format,
 * handling special types like arrays and nested objects.
 *
 * @param context - The error context to format
 * @param indent - The indentation level (for nested objects)
 * @returns Formatted context string
 */
export function formatErrorContext(context: Record<string, unknown>, indent = 0): string {
  const indentStr = "  ".repeat(indent);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(context)) {
    if (value === undefined || value === null) {
      lines.push(`${indentStr}${key}: ${value}`);
    } else if (Array.isArray(value)) {
      lines.push(`${indentStr}${key}: [${value.map((v) => JSON.stringify(v)).join(", ")}]`);
    } else if (typeof value === "object") {
      lines.push(`${indentStr}${key}:`);
      lines.push(formatErrorContext(value as Record<string, unknown>, indent + 1));
    } else if (typeof value === "string" && value.length > 100) {
      lines.push(`${indentStr}${key}: ${value.substring(0, 100)}...`);
    } else {
      lines.push(`${indentStr}${key}: ${JSON.stringify(value)}`);
    }
  }

  return lines.join("\n");
}

/**
 * Creates a detailed error summary including context
 *
 * Useful for logging or displaying error information to developers.
 *
 * @param error - The DynoTableError to summarize
 * @returns Formatted error summary
 */
export function getErrorSummary(error: DynoTableError): string {
  const parts: string[] = [];

  parts.push(`Error: ${error.name}`);
  parts.push(`Code: ${error.code}`);
  parts.push(`Message: ${error.message}`);

  if (Object.keys(error.context).length > 0) {
    parts.push("Context:");
    parts.push(formatErrorContext(error.context, 1));
  }

  if (error.cause) {
    parts.push(`Caused by: ${error.cause.name}: ${error.cause.message}`);
  }

  return parts.join("\n");
}

/**
 * Type guard to check if an error is a DynoTableError
 *
 * @param error - The error to check
 * @returns true if the error is a DynoTableError
 */
export function isDynoTableError(error: unknown): error is DynoTableError {
  return typeof error === "object" && error !== null && "code" in error && "context" in error && error instanceof Error;
}

/**
 * Type guard to check if an error is a ValidationError
 *
 * @param error - The error to check
 * @returns true if the error is a ValidationError
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof Error && error.name === "ValidationError";
}

/**
 * Type guard to check if an error is an OperationError
 *
 * @param error - The error to check
 * @returns true if the error is an OperationError
 */
export function isOperationError(error: unknown): error is OperationError {
  return error instanceof Error && error.name === "OperationError";
}

/**
 * Type guard to check if an error is a TransactionError
 *
 * @param error - The error to check
 * @returns true if the error is a TransactionError
 */
export function isTransactionError(error: unknown): error is TransactionError {
  return error instanceof Error && error.name === "TransactionError";
}

/**
 * Type guard to check if an error is a BatchError
 *
 * @param error - The error to check
 * @returns true if the error is a BatchError
 */
export function isBatchError(error: unknown): error is BatchError {
  return error instanceof Error && error.name === "BatchError";
}

/**
 * Type guard to check if an error is an ExpressionError
 *
 * @param error - The error to check
 * @returns true if the error is an ExpressionError
 */
export function isExpressionError(error: unknown): error is ExpressionError {
  return error instanceof Error && error.name === "ExpressionError";
}

/**
 * Type guard to check if an error is a ConfigurationError
 *
 * @param error - The error to check
 * @returns true if the error is a ConfigurationError
 */
export function isConfigurationError(error: unknown): error is ConfigurationError {
  return error instanceof Error && error.name === "ConfigurationError";
}

/**
 * Type guard to check if an error is an EntityError
 *
 * @param error - The error to check
 * @returns true if the error is an EntityError
 */
export function isEntityError(error: unknown): error is EntityError {
  return error instanceof Error && error.name === "EntityError";
}

/**
 * Type guard to check if an error is a KeyGenerationError
 *
 * @param error - The error to check
 * @returns true if the error is a KeyGenerationError
 */
export function isKeyGenerationError(error: unknown): error is KeyGenerationError {
  return error instanceof Error && error.name === "KeyGenerationError";
}

/**
 * Type guard to check if an error is an IndexGenerationError
 *
 * @param error - The error to check
 * @returns true if the error is an IndexGenerationError
 */
export function isIndexGenerationError(error: unknown): error is IndexGenerationError {
  return error instanceof Error && error.name === "IndexGenerationError";
}

/**
 * Type guard to check if an error is an EntityValidationError
 *
 * @param error - The error to check
 * @returns true if the error is an EntityValidationError
 */
export function isEntityValidationError(error: unknown): error is EntityValidationError {
  return error instanceof Error && error.name === "EntityValidationError";
}
