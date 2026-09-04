// Main exports - re-export the most commonly used functionality

export { BatchBuilder, type BatchResult } from "./builders/batch-builder.js";
export type { WriteExecutionMetadata } from "./builders/builder-types.js";
export { DeleteBuilder, type DeleteOptions } from "./builders/delete-builder.js";
export { PutBuilder, type PutOptions } from "./builders/put-builder.js";
// Builder types
export { QueryBuilder, type QueryOptions } from "./builders/query-builder.js";
export { TransactionBuilder, type TransactionOptions } from "./builders/transaction-builder.js";
export { UpdateBuilder, type UpdateOptions } from "./builders/update-builder.js";
export {
  type VectorCapacity,
  type VectorConditionOperator,
  VectorSearchBuilder,
  type VectorSearchInput,
  type VectorSearchMatch,
  type VectorSearchResult,
} from "./builders/vector-search-builder.js";
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
  CollectionConfig,
  CollectionDefinition,
  CollectionQueryBuilder,
  CollectionReader,
  CollectionVectorSearchMatch,
  CollectionVectorSearchResult,
} from "./entity/collection.js";
export {
  CollectionPageIterator,
  CollectionResultIterator,
  CollectionVectorSearchBuilder,
  defineCollection,
  groupByEntityType,
} from "./entity/collection.js";
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
  EntityVectorSearchInput,
  IndexBuilder,
  IndexDefinition,
  PartitionKeyIndexBuilder,
  QueryEntity,
  QueryRecord,
} from "./entity/entity.js";
export { createIndex, createQueries, defineEntity } from "./entity/entity.js";
export type { ErrorCode } from "./errors.js";
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
export type { BatchExecutionOptions } from "./operation-types.js";
export type { DynamoOperation, RequestEvent, RequestResult, TablePlugin } from "./plugins.js";
export { Table } from "./table.js";
export type {
  VectorDistanceFunction,
  VectorIndexConfig,
  VectorIndexFor,
  VectorIndexNames,
  VectorProjection,
} from "./types.js";
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
  isAbortError,
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
  isVectorIndexNotReady,
} from "./utils/error-utils.js";

// Utility functions for key templates
export { partitionKey } from "./utils/partition-key-template.js";
export { sortKey } from "./utils/sort-key-template.js";
