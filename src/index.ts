// Main exports - re-export the most commonly used functionality

export { BatchBuilder, type BatchResult } from "./builders/batch-builder.js";
export { DeleteBuilder, type DeleteOptions } from "./builders/delete-builder.js";
export { PutBuilder, type PutOptions } from "./builders/put-builder.js";
// Builder types
export { QueryBuilder, type QueryOptions } from "./builders/query-builder.js";
export { TransactionBuilder, type TransactionOptions } from "./builders/transaction-builder.js";
export { UpdateBuilder, type UpdateOptions } from "./builders/update-builder.js";
export type {
  ComparisonOperator,
  Condition,
  ConditionOperator,
  ExpressionParams,
  KeyConditionOperator,
  LogicalOperator,
  PrimaryKey,
  PrimaryKeyWithoutExpression,
} from "./conditions.js";
// Condition builders and types
export {
  and,
  attributeExists,
  attributeNotExists,
  beginsWith,
  between,
  contains,
  eq,
  gt,
  gte,
  inArray,
  lt,
  lte,
  ne,
  not,
  or,
} from "./conditions.js";
export type {
  BuiltIndexDefinition,
  CreateIndexBuilder,
  EntityConfig,
  EntityDefinition,
  EntityDeleteBuilder,
  EntityGetBuilder,
  EntityPutBuilder,
  EntityRepository,
  EntityUpdateBuilder,
  IndexBuilder,
  IndexDefinition,
  PartitionKeyIndexBuilder,
  QueryEntity,
  QueryRecord,
} from "./entity/entity.js";
export { createIndex, createQueries, defineEntity } from "./entity/entity.js";
export type { ErrorCode } from "./errors.js";
export type { ErrorCode } from "./errors";
// Error classes and utilities
export {
  BatchError,
  ConfigurationError,
  DynoTableError,
  EntityError,
  EntityValidationError,
  ErrorCodes,
  ExpressionError,
  IndexGenerationError,
  KeyGenerationError,
  OperationError,
  TransactionError,
  ValidationError,
} from "./errors.js";
export { Table } from "./table.js";
export {
  BatchErrors,
  ConfigurationErrors,
  EntityErrors,
  ExpressionErrors,
  IndexErrors,
  OperationErrors,
  TransactionErrors,
  ValidationErrors,
} from "./utils/error-factory.js";
export {
  extractRequiredAttributes,
  formatErrorContext,
  getAwsErrorCode,
  getAwsErrorMessage,
  getErrorSummary,
  isBatchError,
  isConditionalCheckFailed,
  isConfigurationError,
  isDynoTableError,
  isEntityError,
  isEntityValidationError,
  isExpressionError,
  isIndexGenerationError,
  isOperationError,
  isProvisionedThroughputExceeded,
  isRetryableError,
  isTransactionCanceled,
  isTransactionError,
  isValidationError,
  isValidationException,
} from "./utils/error-utils.js";

// Utility functions for key templates
export { partitionKey } from "./utils/partition-key-template.js";
export { sortKey } from "./utils/sort-key-template.js";
