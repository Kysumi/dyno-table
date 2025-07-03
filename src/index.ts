// Main exports - re-export the most commonly used functionality
export { Table } from "./table";
export { defineEntity, createIndex, createQueries } from "./entity";
export type {
  EntityRepository,
  EntityConfig,
  QueryEntity,
  IndexDefinition,
  QueryRecord,
} from "./entity";

// Condition builders and types
export {
  eq,
  ne,
  lt,
  lte,
  gt,
  gte,
  between,
  inArray,
  beginsWith,
  contains,
  attributeExists,
  attributeNotExists,
  and,
  or,
  not,
} from "./conditions";
export type {
  Condition,
  ComparisonOperator,
  LogicalOperator,
  ConditionOperator,
  KeyConditionOperator,
  PrimaryKey,
  PrimaryKeyWithoutExpression,
  ExpressionParams,
} from "./conditions";

// Builder types
export { QueryBuilder, type QueryOptions } from "./builders/query-builder";
export { PutBuilder, type PutOptions } from "./builders/put-builder";
export { UpdateBuilder, type UpdateOptions } from "./builders/update-builder";
export { DeleteBuilder, type DeleteOptions } from "./builders/delete-builder";
export { TransactionBuilder, type TransactionOptions } from "./builders/transaction-builder";
export { BatchBuilder, BatchError, type BatchResult } from "./builders/batch-builder";

// Utility functions for key templates
export { partitionKey } from "./utils/partition-key-template";
export { sortKey } from "./utils/sort-key-template";
