import type { Table } from "../table";
import type { DynamoItem } from "../types";
import type { IndexDefinition } from "./entity";

/**
 * Represents a generated key for a DynamoDB index
 */
interface IndexKey {
  /** The partition key value */
  pk: string;
  /** The sort key value (optional) */
  sk?: string;
}

/**
 * Helper class for building indexes for DynamoDB operations
 */
export class IndexBuilder<T extends DynamoItem> {
  /**
   * Creates a new IndexBuilder instance
   *
   * @param table - The DynamoDB table instance
   * @param indexes - The index definitions
   */
  constructor(
    private readonly table: Table,
    private readonly indexes: Record<string, IndexDefinition<T>> = {},
  ) {}

  /**
   * Build index attributes for item creation
   *
   * @param item - The item to generate indexes for
   * @param options - Options for building indexes
   * @returns Record of GSI attribute names to their values
   */
  buildForCreate(item: T, options: { excludeReadOnly?: boolean } = {}): Record<string, string> {
    const attributes: Record<string, string> = {};

    for (const [indexName, indexDef] of Object.entries(this.indexes)) {
      // Skip read-only indexes if requested
      if (options.excludeReadOnly && indexDef.isReadOnly) {
        continue;
      }

      const key = indexDef.generateKey(item);
      const gsiConfig = this.table.gsis[indexName];

      if (!gsiConfig) {
        throw new Error(`GSI configuration not found for index: ${indexName}`);
      }

      if (key.pk) {
        attributes[gsiConfig.partitionKey] = key.pk;
      }
      if (key.sk && gsiConfig.sortKey) {
        attributes[gsiConfig.sortKey] = key.sk;
      }
    }

    return attributes;
  }

  /**
   * Build index attributes for item updates
   *
   * @param currentData - The current data before update
   * @param updates - The update data
   * @param options - Options for building indexes
   * @returns Record of GSI attribute names to their updated values
   */
  buildForUpdate(
    currentData: T,
    updates: Partial<T>,
    options: { forceRebuildIndexes?: string[] } = {},
  ): Record<string, string> {
    const attributes: Record<string, string> = {};
    const updatedItem = { ...currentData, ...updates } as T;

    // Validate that all force rebuild indexes exist
    if (options.forceRebuildIndexes && options.forceRebuildIndexes.length > 0) {
      const invalidIndexes = options.forceRebuildIndexes.filter((indexName) => !this.indexes[indexName]);
      if (invalidIndexes.length > 0) {
        throw new Error(
          `Cannot force rebuild unknown indexes: ${invalidIndexes.join(", ")}. ` +
            `Available indexes: ${Object.keys(this.indexes).join(", ")}`,
        );
      }
    }

    for (const [indexName, indexDef] of Object.entries(this.indexes)) {
      const isForced = options.forceRebuildIndexes?.includes(indexName);

      // Skip read-only indexes if they are not being force-rebuilt
      if (indexDef.isReadOnly && !isForced) {
        continue;
      }

      // If the index is not being forcibly rebuilt, check if it needs to be updated
      if (!isForced) {
        let shouldUpdateIndex = false;
        try {
          const currentKey = indexDef.generateKey(currentData);
          const updatedKey = indexDef.generateKey(updatedItem);
          if (currentKey.pk !== updatedKey.pk || currentKey.sk !== updatedKey.sk) {
            shouldUpdateIndex = true;
          }
        } catch {
          shouldUpdateIndex = true;
        }

        if (!shouldUpdateIndex) {
          continue;
        }
      }

      // Now generate the full key and validate it
      let key: IndexKey;
      try {
        key = indexDef.generateKey(updatedItem);
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Missing attributes: ${error.message}`);
        }
        throw error;
      }

      // Validate the generated keys
      if (this.hasUndefinedValues(key)) {
        throw new Error(
          `Missing attributes: Cannot update entity: insufficient data to regenerate index "${indexName}". All attributes required by the index must be provided in the update operation, or the index must be marked as readOnly.`,
        );
      }

      const gsiConfig = this.table.gsis[indexName];
      if (!gsiConfig) {
        throw new Error(`GSI configuration not found for index: ${indexName}`);
      }

      if (key.pk) {
        attributes[gsiConfig.partitionKey] = key.pk;
      }
      if (key.sk && gsiConfig.sortKey) {
        attributes[gsiConfig.sortKey] = key.sk;
      }
    }

    return attributes;
  }

  /**
   * Check if a key has undefined values
   *
   * @param key - The index key to check
   * @returns True if the key contains undefined values, false otherwise
   */
  private hasUndefinedValues(key: { pk: string; sk?: string }): boolean {
    return (key.pk?.includes("undefined") ?? false) || (key.sk?.includes("undefined") ?? false);
  }
}
