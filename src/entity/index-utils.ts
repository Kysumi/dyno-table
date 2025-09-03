import type { Table } from "../table";
import type { DynamoItem } from "../types";
import { IndexBuilder } from "./ddb-indexing";
import type { IndexDefinition } from "./entity";

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
  indexes: Record<string, IndexDefinition<T>> | undefined,
  excludeReadOnly = false,
): Record<string, string> {
  if (!indexes) {
    return {};
  }

  const indexBuilder = new IndexBuilder(table, indexes);
  return indexBuilder.buildForCreate(dataForKeyGeneration, { excludeReadOnly });
}

/**
 * Builds index updates for an item based on the configured indexes
 *
 * @param currentData - The current data before update
 * @param updates - The update data
 * @param table - The DynamoDB table instance containing GSI configurations
 * @param indexes - The index definitions
 * @param forceRebuildIndexes - Array of index names to force rebuild even if readonly
 * @returns Record of GSI attribute names to their updated values
 */
export function buildIndexUpdates<T extends DynamoItem>(
  currentData: T,
  updates: Partial<T>,
  table: Table,
  indexes: Record<string, IndexDefinition<T>> | undefined,
  forceRebuildIndexes?: string[],
): Record<string, string> {
  if (!indexes) {
    return {};
  }

  const indexBuilder = new IndexBuilder(table, indexes);
  return indexBuilder.buildForUpdate(currentData, updates, { forceRebuildIndexes });
}
