/**
 * Base error class for all dyno-table errors
 *
 * All custom errors in the library extend this class, allowing consumers
 * to catch all library errors with a single catch block if needed.
 */
export class DynoTableError extends Error {
  /**
   * Machine-readable error code for programmatic error handling
   * @example "KEY_GENERATION_FAILED", "VALIDATION_ERROR", etc.
   */
  public readonly code: string;

  /**
   * Additional context about the error
   * Contains operation-specific details like entity names, table names,
   * expressions, conditions, and other relevant debugging information
   */
  public readonly context: Record<string, unknown>;

  /**
   * The original error that caused this error (if wrapping another error)
   * Useful for preserving AWS SDK errors or other underlying errors
   */
  public override readonly cause?: Error;

  constructor(message: string, code: string, context: Record<string, unknown> = {}, cause?: Error) {
    super(message);
    this.name = "DynoTableError";
    this.code = code;
    this.context = context;
    this.cause = cause;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error for schema validation and input validation failures
 *
 * Thrown when user-provided data doesn't match the expected schema
 * or when required fields are missing.
 */
export class ValidationError extends DynoTableError {
  constructor(message: string, code: string, context: Record<string, unknown> = {}, cause?: Error) {
    super(message, code, context, cause);
    this.name = "ValidationError";
  }
}

/**
 * Error for DynamoDB operation failures
 *
 * Wraps AWS SDK errors and adds library-specific context like
 * the operation type, table name, and generated expressions.
 */
export class OperationError extends DynoTableError {
  constructor(message: string, code: string, context: Record<string, unknown> = {}, cause?: Error) {
    super(message, code, context, cause);
    this.name = "OperationError";
  }
}

/**
 * Error for transaction-specific failures
 *
 * Thrown when transaction operations fail, including duplicate item
 * detection, transaction cancellation, and other transaction-related issues.
 */
export class TransactionError extends DynoTableError {
  constructor(message: string, code: string, context: Record<string, unknown> = {}, cause?: Error) {
    super(message, code, context, cause);
    this.name = "TransactionError";
  }
}

/**
 * Error for batch operation failures
 *
 * Thrown when batch operations fail or when batch limits are exceeded.
 * Includes information about unprocessed items and operation details.
 */
export class BatchError extends DynoTableError {
  /**
   * The type of batch operation that failed
   */
  public readonly operation: "write" | "read";

  /**
   * The items that were not processed during the batch operation
   */
  public readonly unprocessedItems: unknown[];

  constructor(
    message: string,
    code: string,
    operation: "write" | "read",
    unprocessedItems: unknown[] = [],
    context: Record<string, unknown> = {},
    cause?: Error,
  ) {
    super(message, code, context, cause);
    this.name = "BatchError";
    this.operation = operation;
    this.unprocessedItems = unprocessedItems;
  }
}

/**
 * Error for expression building failures
 *
 * Thrown when building DynamoDB expressions (condition, filter, update, etc.)
 * fails due to invalid conditions or missing required fields.
 */
export class ExpressionError extends DynoTableError {
  constructor(message: string, code: string, context: Record<string, unknown> = {}, cause?: Error) {
    super(message, code, context, cause);
    this.name = "ExpressionError";
  }
}

/**
 * Error for table/index configuration issues
 *
 * Thrown when there are problems with table configuration,
 * such as missing GSIs or invalid index references.
 */
export class ConfigurationError extends DynoTableError {
  constructor(message: string, code: string, context: Record<string, unknown> = {}, cause?: Error) {
    super(message, code, context, cause);
    this.name = "ConfigurationError";
  }
}

/**
 * Base error for all entity-related errors
 *
 * Parent class for entity-specific errors like key generation
 * and index generation failures.
 */
export class EntityError extends DynoTableError {
  constructor(message: string, code: string, context: Record<string, unknown> = {}, cause?: Error) {
    super(message, code, context, cause);
    this.name = "EntityError";
  }
}

/**
 * Error for primary key generation failures
 *
 * Thrown when generating entity primary keys fails due to missing
 * attributes or invalid key formats.
 *
 * @example
 * ```typescript
 * try {
 *   await userRepo.create({ name: "John" }).execute();
 * } catch (error) {
 *   if (error instanceof KeyGenerationError) {
 *     console.error("Failed to generate key");
 *     console.error("Entity:", error.context.entityName);
 *     console.error("Required attributes:", error.context.requiredAttributes);
 *   }
 * }
 * ```
 */
export class KeyGenerationError extends EntityError {
  constructor(message: string, code: string, context: Record<string, unknown> = {}, cause?: Error) {
    super(message, code, context, cause);
    this.name = "KeyGenerationError";
  }
}

/**
 * Error for index key generation failures
 *
 * Thrown when generating secondary index keys fails due to missing
 * attributes or when trying to update readonly indexes without forcing.
 *
 * @example
 * ```typescript
 * try {
 *   await orderRepo.update({ id: "123" }, { status: "shipped" }).execute();
 * } catch (error) {
 *   if (error instanceof IndexGenerationError) {
 *     console.error("Index failed:", error.context.indexName);
 *     console.error("Suggestion:", error.context.suggestion);
 *   }
 * }
 * ```
 */
export class IndexGenerationError extends EntityError {
  constructor(message: string, code: string, context: Record<string, unknown> = {}, cause?: Error) {
    super(message, code, context, cause);
    this.name = "IndexGenerationError";
  }
}

/**
 * Error for entity schema validation failures
 *
 * Thrown when entity data doesn't pass schema validation.
 * Includes validation issues and the entity context.
 */
export class EntityValidationError extends ValidationError {
  constructor(message: string, code: string, context: Record<string, unknown> = {}, cause?: Error) {
    super(message, code, context, cause);
    this.name = "EntityValidationError";
  }
}

/**
 * Error codes used throughout the library
 *
 * These codes allow for programmatic error handling and can be used
 * to implement retry logic, user-friendly error messages, etc.
 */
export const ErrorCodes = {
  // Key Generation Errors
  KEY_GENERATION_FAILED: "KEY_GENERATION_FAILED",
  KEY_MISSING_ATTRIBUTES: "KEY_MISSING_ATTRIBUTES",
  KEY_INVALID_FORMAT: "KEY_INVALID_FORMAT",

  // Index Errors
  INDEX_GENERATION_FAILED: "INDEX_GENERATION_FAILED",
  INDEX_MISSING_ATTRIBUTES: "INDEX_MISSING_ATTRIBUTES",
  INDEX_NOT_FOUND: "INDEX_NOT_FOUND",
  INDEX_READONLY_UPDATE_FAILED: "INDEX_READONLY_UPDATE_FAILED",
  INDEX_UNDEFINED_VALUES: "INDEX_UNDEFINED_VALUES",

  // Validation Errors
  ENTITY_VALIDATION_FAILED: "ENTITY_VALIDATION_FAILED",
  ASYNC_VALIDATION_NOT_SUPPORTED: "ASYNC_VALIDATION_NOT_SUPPORTED",
  QUERY_INPUT_VALIDATION_FAILED: "QUERY_INPUT_VALIDATION_FAILED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  SCHEMA_VALIDATION_FAILED: "SCHEMA_VALIDATION_FAILED",
  INVALID_PARAMETER: "INVALID_PARAMETER",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",

  // Expression Errors
  EXPRESSION_MISSING_ATTRIBUTE: "EXPRESSION_MISSING_ATTRIBUTE",
  EXPRESSION_MISSING_VALUE: "EXPRESSION_MISSING_VALUE",
  EXPRESSION_INVALID_CONDITION: "EXPRESSION_INVALID_CONDITION",
  EXPRESSION_EMPTY_ARRAY: "EXPRESSION_EMPTY_ARRAY",
  EXPRESSION_UNKNOWN_TYPE: "EXPRESSION_UNKNOWN_TYPE",
  EXPRESSION_INVALID: "EXPRESSION_INVALID",
  EXPRESSION_INVALID_OPERATOR: "EXPRESSION_INVALID_OPERATOR",

  // Operation Errors
  QUERY_FAILED: "QUERY_FAILED",
  SCAN_FAILED: "SCAN_FAILED",
  GET_FAILED: "GET_FAILED",
  PUT_FAILED: "PUT_FAILED",
  DELETE_FAILED: "DELETE_FAILED",
  UPDATE_FAILED: "UPDATE_FAILED",
  BATCH_GET_FAILED: "BATCH_GET_FAILED",
  BATCH_WRITE_FAILED: "BATCH_WRITE_FAILED",
  NO_UPDATE_ACTIONS: "NO_UPDATE_ACTIONS",
  CONDITIONAL_CHECK_FAILED: "CONDITIONAL_CHECK_FAILED",

  // Transaction Errors
  TRANSACTION_FAILED: "TRANSACTION_FAILED",
  TRANSACTION_DUPLICATE_ITEM: "TRANSACTION_DUPLICATE_ITEM",
  TRANSACTION_EMPTY: "TRANSACTION_EMPTY",
  TRANSACTION_UNSUPPORTED_TYPE: "TRANSACTION_UNSUPPORTED_TYPE",
  TRANSACTION_ITEM_LIMIT: "TRANSACTION_ITEM_LIMIT",
  TRANSACTION_CANCELLED: "TRANSACTION_CANCELLED",

  // Batch Errors
  BATCH_EMPTY: "BATCH_EMPTY",
  BATCH_UNSUPPORTED_TYPE: "BATCH_UNSUPPORTED_TYPE",
  BATCH_UNPROCESSED_ITEMS: "BATCH_UNPROCESSED_ITEMS",
  BATCH_SIZE_EXCEEDED: "BATCH_SIZE_EXCEEDED",

  // Configuration Errors
  GSI_NOT_FOUND: "GSI_NOT_FOUND",
  SORT_KEY_REQUIRED: "SORT_KEY_REQUIRED",
  SORT_KEY_NOT_DEFINED: "SORT_KEY_NOT_DEFINED",
  PRIMARY_KEY_MISSING: "PRIMARY_KEY_MISSING",
  INVALID_CHUNK_SIZE: "INVALID_CHUNK_SIZE",
  CONDITION_REQUIRED: "CONDITION_REQUIRED",
  CONDITION_GENERATION_FAILED: "CONDITION_GENERATION_FAILED",
  PK_EXTRACTION_FAILED: "PK_EXTRACTION_FAILED",
  CONFIGURATION_INVALID: "CONFIGURATION_INVALID",
  CONFIGURATION_MISSING_SORT_KEY: "CONFIGURATION_MISSING_SORT_KEY",
  CONFIGURATION_INVALID_GSI: "CONFIGURATION_INVALID_GSI",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
