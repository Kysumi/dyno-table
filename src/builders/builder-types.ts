import type { PrimaryKeyWithoutExpression } from "../conditions";
import type { DynamoCommandWithExpressions } from "../utils/debug-expression";
import type { DynamoItem, TableConfig } from "../types";

export interface DeleteCommandParams extends DynamoCommandWithExpressions {
  tableName: string;
  key: Record<string, unknown>;
  conditionExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: DynamoItem;
  returnValues?: "ALL_OLD";
}

/**
 * Parameters for the DynamoDB put command.
 *
 * These parameters are used when executing the operation against DynamoDB.
 *
 * The `returnValues` property can be:
 * - `"ALL_OLD"`: Return the attributes of the item as they were before the operation
 * - `"NONE"`: Return nothing
 * - `"CONSISTENT"`: Triggers a GET operation after the put to retrieve the updated item state
 * - `"INPUT"`: Return the input values that were passed to the operation (useful for create operations)
 */
export interface PutCommandParams extends DynamoCommandWithExpressions {
  tableName: string;
  item: DynamoItem;
  conditionExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, unknown>;
  returnValues?: "ALL_OLD" | "NONE" | "CONSISTENT" | "INPUT";
}

/**
 * Parameters for the DynamoDB update command.
 * These parameters are used when executing the operation against DynamoDB.
 */
export interface UpdateCommandParams extends DynamoCommandWithExpressions {
  /** The name of the DynamoDB table */
  tableName: string;
  /** The primary key of the item to update */
  key: Record<string, unknown>;
  /** The update expression (SET, REMOVE, ADD, DELETE clauses) */
  updateExpression: string;
  /** Optional condition expression that must be satisfied */
  conditionExpression?: string;
  /** Map of expression attribute name placeholders to actual names */
  expressionAttributeNames?: Record<string, string>;
  /** Map of expression attribute value placeholders to actual values */
  expressionAttributeValues?: DynamoItem;
  /** Which item attributes to include in the response */
  returnValues?: "ALL_NEW" | "UPDATED_NEW" | "ALL_OLD" | "UPDATED_OLD" | "NONE";
}

export interface ConditionCheckCommandParams extends DynamoCommandWithExpressions {
  tableName: string;
  key: Record<string, unknown>;
  conditionExpression: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: DynamoItem;
}

/**
 * Base interface for all builder classes that support pagination
 * to be used by Paginator without creating circular dependencies.
 */
export interface BaseBuilderInterface<T extends DynamoItem, TConfig extends TableConfig = TableConfig, B = unknown> {
  clone(): B;
  limit(limit: number): B;
  getLimit(): number | undefined;
  startFrom(lastEvaluatedKey: DynamoItem): B;
  execute(): Promise<import("./iterable-query-result").IterableQueryResult<T, TConfig>>;
  executeRaw(): Promise<{ items: T[]; lastEvaluatedKey?: DynamoItem }>;
}

/**
 * Interface for the QueryBuilder class to be used by Paginator
 * without creating a circular dependency.
 */
export interface QueryBuilderInterface<T extends DynamoItem, TConfig extends TableConfig = TableConfig>
  extends BaseBuilderInterface<T, TConfig, QueryBuilderInterface<T, TConfig>> {}

/**
 * Interface for the ScanBuilder class to be used by Paginator
 * without creating a circular dependency.
 */
export interface ScanBuilderInterface<T extends DynamoItem, TConfig extends TableConfig = TableConfig>
  extends BaseBuilderInterface<T, TConfig, ScanBuilderInterface<T, TConfig>> {}

/**
 * Interface for the FilterBuilder class to be used by Paginator
 * without creating a circular dependency.
 */
export interface FilterBuilderInterface<T extends DynamoItem, TConfig extends TableConfig = TableConfig>
  extends BaseBuilderInterface<T, TConfig, FilterBuilderInterface<T, TConfig>> {}

/**
 * Represents the result of a single page query operation.
 * This interface provides all necessary information about the current page
 * and the availability of subsequent pages.
 */
export interface PaginationResult<T> {
  /** The items (dinosaurs, habitats, etc.) retrieved for the current page */
  items: T[];
  /** DynamoDB's last evaluated key, used internally for pagination */
  lastEvaluatedKey?: DynamoItem;
  /** Indicates whether there are more pages available */
  hasNextPage: boolean;
  /** The current page number (1-indexed) */
  page: number;
}

/**
 * Represents a single operation within a DynamoDB transaction.
 * Each operation can be one of:
 * - Put: Insert or replace an item
 * - Update: Modify an existing item
 * - Delete: Remove an item
 * - ConditionCheck: Verify item state without modification
 */
export type TransactionItem =
  | { type: "Put"; params: PutCommandParams }
  | { type: "Update"; params: UpdateCommandParams }
  | { type: "Delete"; params: DeleteCommandParams }
  | { type: "ConditionCheck"; params: ConditionCheckCommandParams };
