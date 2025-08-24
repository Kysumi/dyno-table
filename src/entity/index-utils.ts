import type { Table } from "../table";
import type { DynamoItem, Index } from "../types";
import { IndexBuilder, type IndexWithGeneration } from "./ddb-indexing";

/**
 * Builds secondary indexes for an item based on the configured indexes
 *
 * @param dataForKeyGeneration - The validated data to generate keys from
 * @param table - The DynamoDB table instance containing GSI configurations
 * @param indexes - The index definitions
 * @param excludeReadOnly - Whether to exclude read-only indexes
 * @returns Record of GSI attribute names to their values
 */
export function buildIndexes<T extends DynamoItem>(
  dataForKeyGeneration: T,
  table: Table,
  indexes: Record<string, Index<T>> | undefined,
  excludeReadOnly = false,
): Record<string, string> {
  if (!indexes) {
    return {};
  }

  const indexWithGeneration: Record<string, IndexWithGeneration<T>> = {};
  for (const [key, index] of Object.entries(indexes)) {
    indexWithGeneration[key] = index as IndexWithGeneration<T>;
  }

  const indexBuilder = new IndexBuilder(table, indexWithGeneration);
  return indexBuilder.buildForCreate(dataForKeyGeneration, { excludeReadOnly });
}

/**
 * Builds index updates for an item based on the configured indexes
 *
 * @param currentData - The current data before update
 * @param updates - The update data
 * @param table - The DynamoDB table instance containing GSI configurations
 * @param indexes - The index definitions
 * @returns Record of GSI attribute names to their updated values
 */
export function buildIndexUpdates<T extends DynamoItem>(
  currentData: T,
  updates: Partial<T>,
  table: Table,
  indexes: Record<string, Index<T>> | undefined,
): Record<string, string> {
  if (!indexes) {
    return {};
  }

  const indexWithGeneration: Record<string, IndexWithGeneration<T>> = {};
  for (const [key, index] of Object.entries(indexes)) {
    indexWithGeneration[key] = index as IndexWithGeneration<T>;
  }

  const indexBuilder = new IndexBuilder(table, indexWithGeneration);
  return indexBuilder.buildForUpdate(currentData, updates);
}
