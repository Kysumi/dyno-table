import type { TransactionItem } from "../builders/builder-types";
import { debugCommand } from "./debug-expression";

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
      result.readable = debugCommand(item.params).readable;
      break;
    case "Update":
      result.readable = debugCommand(item.params).readable;
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
