// Main exports - re-export the most commonly used functionality

export { BatchBuilder, type BatchResult } from "./builders/batch-builder";
export { DeleteBuilder, type DeleteOptions } from "./builders/delete-builder";
export { PutBuilder, type PutOptions } from "./builders/put-builder";
// Builder types
export { QueryBuilder, type QueryOptions } from "./builders/query-builder";
export { TransactionBuilder, type TransactionOptions } from "./builders/transaction-builder";
export { UpdateBuilder, type UpdateOptions } from "./builders/update-builder";
export type {
  ComparisonOperator,
  Condition,
  ConditionOperator,
  ExpressionParams,
  KeyConditionOperator,
  LogicalOperator,
  PrimaryKey,
  PrimaryKeyWithoutExpression,
} from "./conditions";
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
} from "./conditions";
export type {
  EntityConfig,
  EntityRepository,
  IndexDefinition,
  QueryEntity,
  QueryRecord,
} from "./entity/entity";
export { createIndex, createQueries, defineEntity } from "./entity/entity";
// Error classes and utilities
export * from "./errors";
export { Table } from "./table";
export {
  BatchErrors,
  ConfigurationErrors,
  EntityErrors,
  ExpressionErrors,
  IndexErrors,
  OperationErrors,
  TransactionErrors,
  ValidationErrors,
} from "./utils/error-factory";
export * from "./utils/error-utils";

// Utility functions for key templates
export { partitionKey } from "./utils/partition-key-template";
export { sortKey } from "./utils/sort-key-template";
