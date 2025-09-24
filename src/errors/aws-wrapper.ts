import { DynamoDBServiceException } from "@aws-sdk/client-dynamodb";
import { ConfigurationError, OperationError, ValidationError } from "./base.js";
import { AwsErrorFactories, ConfigurationErrors, ValidationErrors } from "./factories.js";
import { createMarshallingError, isMarshallingError, type MarshallingError } from "./marshalling-enhancer.js";

/**
 * Type for AWS SDK errors that we can handle
 */
type AwsError = DynamoDBServiceException | Error;

/**
 * Checks if an error is retryable based on AWS SDK error properties
 */
function isRetryableAwsError(error: AwsError): boolean {
  // Check for explicit retryable property from AWS SDK
  if ("$retryable" in error && typeof error.$retryable === "object" && error.$retryable !== null) {
    return Boolean(error.$retryable.throttling);
  }

  // Fallback to error name-based detection
  const retryableErrorNames = [
    "ProvisionedThroughputExceededException",
    "ThrottlingException",
    "RequestLimitExceeded",
    "InternalServerError",
    "ServiceUnavailable",
    "SlowDown",
  ];

  return retryableErrorNames.includes(error.name);
}

/**
 * Maps AWS SDK error names to appropriate DynoTable error types
 */
const AWS_ERROR_MAPPING: Record<string, "configuration" | "validation" | "operation"> = {
  // Configuration errors (non-retryable)
  ResourceNotFoundException: "configuration",
  ResourceInUseException: "configuration",
  ResourceInvalidException: "configuration",

  // Validation errors (non-retryable)
  ValidationException: "validation",

  // Operation errors (potentially retryable)
  ConditionalCheckFailedException: "operation",
  ProvisionedThroughputExceededException: "operation",
  ThrottlingException: "operation",
  ItemCollectionSizeLimitExceededException: "operation",
  RequestLimitExceeded: "operation",
  TransactionCanceledException: "operation",
  TransactionConflictException: "operation",
  TransactionInProgressException: "operation",
  IdempotentParameterMismatchException: "operation",
  InternalServerError: "operation",
  ServiceUnavailable: "operation",
  UnknownOperationException: "operation",
  BackupInUseException: "operation",
  BackupNotFoundException: "operation",
  ContinuousBackupsUnavailableException: "operation",
  GlobalTableAlreadyExistsException: "operation",
  GlobalTableNotFoundException: "operation",
  InvalidRestoreTimeException: "operation",
  LimitExceededException: "operation",
  PointInTimeRecoveryUnavailableException: "operation",
  ReplicaAlreadyExistsException: "operation",
  ReplicaNotFoundException: "operation",
  StreamSpecificationMismatchException: "operation",
  TableAlreadyExistsException: "operation",
  TableInUseException: "operation",
  TableNotFoundException: "operation",
};

/**
 * Wraps AWS SDK errors with appropriate DynoTable error types
 */
export function wrapAwsError(
  awsError: AwsError,
  operation: string,
  context: Record<string, unknown> = {},
): ConfigurationError | ValidationError | OperationError | MarshallingError {
  const errorName = awsError.name;
  const errorType = AWS_ERROR_MAPPING[errorName] || "operation";
  const isRetryable = isRetryableAwsError(awsError);
  const errorMessage = awsError.message || "Unknown AWS error";

  // Check if this is a marshalling error first
  if (isMarshallingError(awsError)) {
    const itemData = context.item || context.Item || context.updateData;
    return createMarshallingError(awsError, operation, itemData, context);
  }

  // Enhanced context with AWS-specific information
  const enhancedContext = {
    ...context,
    awsErrorType: errorName,
    awsMessage: errorMessage,
    ...(awsError instanceof DynamoDBServiceException && {
      awsRequestId: awsError.$metadata?.requestId,
      awsHttpStatusCode: awsError.$metadata?.httpStatusCode,
    }),
  };

  switch (errorType) {
    case "configuration":
      return createConfigurationError(errorName, operation, enhancedContext);

    case "validation":
      return createValidationError(errorName, operation, errorMessage, enhancedContext);

    default:
      return createOperationError(errorName, operation, errorMessage, enhancedContext, isRetryable);
  }
}

/**
 * Creates appropriate configuration errors based on AWS error type
 */
function createConfigurationError(
  awsErrorName: string,
  operation: string,
  context: Record<string, unknown>,
): ConfigurationError {
  switch (awsErrorName) {
    case "ResourceNotFoundException": {
      const resourceType = inferResourceType(context);
      const resourceName = inferResourceName(context);
      return ConfigurationErrors.resourceNotFound(resourceType, resourceName);
    }

    case "ResourceInUseException":
      return new ConfigurationError(`Resource is currently in use and cannot be modified during ${operation}`, context);

    case "ResourceInvalidException":
      return new ConfigurationError(`Resource configuration is invalid for ${operation}`, context);

    default:
      return new ConfigurationError(`Configuration error during ${operation}: ${context.awsMessage}`, context);
  }
}

/**
 * Creates appropriate validation errors based on AWS error type
 */
function createValidationError(
  awsErrorName: string,
  operation: string,
  errorMessage: string,
  context: Record<string, unknown>,
): ValidationError {
  switch (awsErrorName) {
    case "ValidationException":
      return ValidationErrors.awsValidationException(operation, errorMessage);

    default:
      return new ValidationError(`Validation failed during ${operation}: ${errorMessage}`, context);
  }
}

/**
 * Creates appropriate operation errors based on AWS error type
 */
function createOperationError(
  awsErrorName: string,
  operation: string,
  errorMessage: string,
  context: Record<string, unknown>,
  isRetryable: boolean,
): OperationError {
  switch (awsErrorName) {
    case "ConditionalCheckFailedException":
      return AwsErrorFactories.conditionalCheckFailed(operation, (context.key as Record<string, unknown>) || {});

    case "ProvisionedThroughputExceededException":
      return AwsErrorFactories.provisionedThroughputExceeded(operation, (context.tableName as string) || "unknown");

    case "ThrottlingException":
      return AwsErrorFactories.throttlingException(operation, (context.tableName as string) || "unknown");

    case "ItemCollectionSizeLimitExceededException":
      return AwsErrorFactories.itemCollectionSizeLimitExceeded(operation, (context.tableName as string) || "unknown");

    case "RequestLimitExceeded":
      return AwsErrorFactories.requestLimitExceeded(operation);

    case "TransactionCanceledException": {
      const cancellationReasons = extractCancellationReasons(errorMessage);
      return AwsErrorFactories.transactionCanceledException(operation, cancellationReasons);
    }

    case "InternalServerError":
    case "ServiceUnavailable":
      return AwsErrorFactories.internalServerError(operation);

    default:
      return new OperationError(`${operation} failed: ${errorMessage}`, operation, context, isRetryable);
  }
}

/**
 * Infers resource type from context for ResourceNotFoundException
 */
function inferResourceType(context: Record<string, unknown>): "table" | "index" {
  if (context.indexName || context.gsiName) {
    return "index";
  }
  return "table";
}

/**
 * Infers resource name from context for ResourceNotFoundException
 */
function inferResourceName(context: Record<string, unknown>): string {
  return (context.indexName as string) || (context.gsiName as string) || (context.tableName as string) || "unknown";
}

/**
 * Extracts cancellation reasons from TransactionCanceledException message
 */
function extractCancellationReasons(errorMessage: string): string[] {
  // AWS typically includes cancellation reasons in the error message
  // This is a simplified extraction - you might need to enhance based on actual error formats
  const reasonsMatch = errorMessage.match(/CancellationReasons:\s*\[(.*?)\]/);
  if (reasonsMatch?.[1]) {
    return reasonsMatch[1].split(",").map((reason) => reason.trim().replace(/['"]/g, ""));
  }

  // Fallback to generic reason
  return ["Transaction cancelled"];
}

/**
 * Helper function to wrap any error in the appropriate DynoTable error
 */
export function wrapError(
  error: unknown,
  operation: string,
  context: Record<string, unknown> = {},
): ConfigurationError | ValidationError | OperationError | MarshallingError {
  // If it's already a DynoTable error, return as-is
  if (error instanceof ConfigurationError || error instanceof ValidationError || error instanceof OperationError) {
    return error;
  }

  // If it's an AWS SDK error, use AWS-specific wrapping
  if (isAwsError(error)) {
    return wrapAwsError(error as AwsError, operation, context);
  }

  // For generic errors, wrap as operation error
  const errorMessage = error instanceof Error ? error.message : String(error);
  return new OperationError(
    `${operation} failed: ${errorMessage}`,
    operation,
    { ...context, originalError: errorMessage },
    false, // Generic errors are not retryable by default
  );
}

/**
 * Type guard to check if an error is an AWS SDK error
 */
function isAwsError(error: unknown): boolean {
  return (
    error instanceof DynamoDBServiceException ||
    (error instanceof Error && error.name in AWS_ERROR_MAPPING) ||
    (error instanceof Error && isMarshallingError(error))
  );
}

/**
 * Utility function to create AWS error context from common parameters
 */
export function createAwsErrorContext(
  tableName?: string,
  indexName?: string,
  key?: Record<string, unknown>,
  additionalContext?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(tableName && { tableName }),
    ...(indexName && { indexName }),
    ...(key && { key }),
    ...additionalContext,
  };
}

/**
 * Higher-order function to wrap async functions with error handling
 */
export function withErrorHandling<T extends unknown[], R>(
  operation: string,
  fn: (...args: T) => Promise<R>,
  contextFn?: (...args: T) => Record<string, unknown>,
) {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      const context = contextFn ? contextFn(...args) : {};
      throw wrapError(error, operation, context);
    }
  };
}
