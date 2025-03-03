import type { PrimaryKeyWithoutExpression } from "../conditions";
import type { DynamoCommandWithExpressions } from "../utils/debug-expression";
import type { TableConfig } from "../types";

export interface DeleteCommandParams extends DynamoCommandWithExpressions {
  tableName: string;
  key: PrimaryKeyWithoutExpression;
  conditionExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, unknown>;
  returnValues?: "ALL_OLD";
}

/**
 * Parameters for the DynamoDB put command.
 * These parameters are used when executing the operation against DynamoDB.
 */
export interface PutCommandParams extends DynamoCommandWithExpressions {
  tableName: string;
  item: Record<string, unknown>;
  conditionExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, unknown>;
  returnValues?: "ALL_OLD" | "NONE";
}

/**
 * Parameters for the DynamoDB update command.
 * These parameters are used when executing the operation against DynamoDB.
 */
export interface UpdateCommandParams extends DynamoCommandWithExpressions {
  /** The name of the DynamoDB table */
  tableName: string;
  /** The primary key of the item to update */
  key: PrimaryKeyWithoutExpression;
  /** The update expression (SET, REMOVE, ADD, DELETE clauses) */
  updateExpression: string;
  /** Optional condition expression that must be satisfied */
  conditionExpression?: string;
  /** Map of expression attribute name placeholders to actual names */
  expressionAttributeNames?: Record<string, string>;
  /** Map of expression attribute value placeholders to actual values */
  expressionAttributeValues?: Record<string, unknown>;
  /** Which item attributes to include in the response */
  returnValues?: "ALL_NEW" | "UPDATED_NEW" | "ALL_OLD" | "UPDATED_OLD" | "NONE";
}

export interface ConditionCheckCommandParams extends DynamoCommandWithExpressions {
  tableName: string;
  key: PrimaryKeyWithoutExpression;
  conditionExpression: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, unknown>;
}

/**
 * Interface for the QueryBuilder class to be used by Paginator
 * without creating a circular dependency.
 */
export interface QueryBuilderInterface<T extends Record<string, unknown>, TConfig extends TableConfig = TableConfig> {
  clone(): QueryBuilderInterface<T, TConfig>;
  limit(limit: number): QueryBuilderInterface<T, TConfig>;
  getLimit(): number | undefined;
  startFrom(lastEvaluatedKey: Record<string, unknown>): QueryBuilderInterface<T, TConfig>;
  execute(): Promise<{ items: T[]; lastEvaluatedKey?: Record<string, unknown> }>;
}

/**
 * Represents the result of a single page query operation.
 * This interface provides all necessary information about the current page
 * and the availability of subsequent pages.
 */
export interface PaginationResult<T> {
  /** The items (dinosaurs, habitats, etc.) retrieved for the current page */
  items: T[];
  /** DynamoDB's last evaluated key, used internally for pagination */
  lastEvaluatedKey?: Record<string, unknown>;
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
