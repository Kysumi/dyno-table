import type { TransactionItem } from "../builders/transaction-builder";
import { debugExpression } from "./debug-expression";

/**
 * Utility function to create a human-readable representation of a transaction item
 * by replacing all expression placeholders with their actual values.
 *
 * @param item The transaction item to debug
 * @returns A readable representation of the transaction item
 */
export function debugTransactionItem(item: TransactionItem): Record<string, unknown> {
  const result: Record<string, unknown> = {
    type: item.type,
    tableName: item.params.tableName,
  };

  // Add key if present
  if ("key" in item.params) {
    result.key = item.params.key;
  }

  // Add item if present (for Put operations)
  if (item.type === "Put") {
    result.item = item.params.item;
  }

  // Add readable expressions based on operation type
  switch (item.type) {
    case "Put":
    case "Delete":
    case "ConditionCheck":
      if (item.params.conditionExpression) {
        result.readableCondition = debugExpression(
          item.params.conditionExpression,
          item.params.expressionAttributeNames,
          item.params.expressionAttributeValues,
        );
      }
      break;
    case "Update":
      if (item.params.updateExpression) {
        result.readableUpdate = debugExpression(
          item.params.updateExpression,
          item.params.expressionAttributeNames,
          item.params.expressionAttributeValues,
        );
      }
      if (item.params.conditionExpression) {
        result.readableCondition = debugExpression(
          item.params.conditionExpression,
          item.params.expressionAttributeNames,
          item.params.expressionAttributeValues,
        );
      }
      break;
  }

  return result;
}

/**
 * Utility function to create a human-readable representation of all transaction items
 * in a transaction by replacing all expression placeholders with their actual values.
 *
 * @param items Array of transaction items to debug
 * @returns An array of readable representations of the transaction items
 */
export function debugTransaction(items: TransactionItem[]): Record<string, unknown>[] {
  return items.map((item) => debugTransactionItem(item));
}
