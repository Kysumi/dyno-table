import type { Table } from "../table";
import type { DynamoItem } from "../types";
import { IndexBuilder, type IndexConfig } from "./ddb-indexing";
import type { IndexDefinition } from "./entity";

/**
 * Converts an IndexDefinition to an IndexConfig
 *
 * @param indexDef - The index definition to convert
 * @returns The converted index configuration
 */
export function convertIndexDefinitionToConfig<T extends DynamoItem>(indexDef: IndexDefinition<T>): IndexConfig<T> {
  return {
    name: indexDef.name,
    partitionKey: indexDef.partitionKey,
    sortKey: indexDef.sortKey,
    readOnly: indexDef.isReadOnly || false,
    generateKey: (item: T, options?: { safeParse?: boolean }) => {
      const result = indexDef.generateKey(item, options?.safeParse);
      return { pk: result.pk, sk: result.sk };
    },
  };
}

/**
 * Builds secondary indexes for an item based on the configured indexes
 *
 * @param dataForKeyGeneration - The validated data to generate keys from
 * @param table - The DynamoDB table instance containing GSI configurations
 * @param indexes - The index definitions
 * @param safeParse - Whether to safely parse the data
 * @param excludeReadOnly - Whether to exclude read-only indexes
 * @returns Record of GSI attribute names to their values
 */
export function buildIndexes<T extends DynamoItem>(
  dataForKeyGeneration: T,
  table: Table,
  indexes: Record<string, IndexDefinition<T>> | undefined,
  safeParse = false,
  excludeReadOnly = false,
): Record<string, string> {
  if (!indexes) {
    return {};
  }

  const indexConfigs: Record<string, IndexConfig<T>> = {};
  for (const [indexName, indexDef] of Object.entries(indexes)) {
    indexConfigs[indexName] = convertIndexDefinitionToConfig(indexDef);
  }

  const indexBuilder = new IndexBuilder(table, indexConfigs);
  return indexBuilder.buildForCreate(dataForKeyGeneration, { safeParse, excludeReadOnly });
}

/**
 * Builds index updates for an item based on the configured indexes
 *
 * @param currentData - The current data before update
 * @param updates - The update data
 * @param table - The DynamoDB table instance containing GSI configurations
 * @param indexes - The index definitions
 * @param safeParse - Whether to safely parse the data
 * @returns Record of GSI attribute names to their updated values
 */
export function buildIndexUpdates<T extends DynamoItem>(
  currentData: T,
  updates: Partial<T>,
  table: Table,
  indexes: Record<string, IndexDefinition<T>> | undefined,
  safeParse = false,
): Record<string, string> {
  if (!indexes) {
    return {};
  }

  const indexConfigs: Record<string, IndexConfig<T>> = {};
  for (const [indexName, indexDef] of Object.entries(indexes)) {
    indexConfigs[indexName] = convertIndexDefinitionToConfig(indexDef);
  }

  const indexBuilder = new IndexBuilder(table, indexConfigs);
  return indexBuilder.buildForUpdate(currentData, updates, { safeParse });
}
