import { DynoTableError } from "../errors";
import type { Table } from "../table";
import type { DynamoItem } from "../types";
import { ConfigurationErrors, IndexErrors } from "../utils/error-factory";
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

      let key: IndexKey;
      try {
        key = indexDef.generateKey(item);

        // Validate generated key doesn't contain undefined
        if (this.hasUndefinedValues(key)) {
          throw IndexErrors.undefinedValues(indexName, "create", key, item);
        }
      } catch (error) {
        if (error instanceof DynoTableError) throw error;

        throw IndexErrors.generationFailed(
          indexName,
          "create",
          item,
          indexDef.partitionKey,
          indexDef.sortKey,
          error instanceof Error ? error : undefined,
        );
      }

      const gsiConfig = this.table.gsis[indexName];
      if (!gsiConfig) {
        throw ConfigurationErrors.gsiNotFound(indexName, this.table.tableName, Object.keys(this.table.gsis));
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
        throw IndexErrors.notFound(invalidIndexes, Object.keys(this.indexes), undefined, this.table.tableName);
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
        if (error instanceof DynoTableError) throw error;

        throw IndexErrors.missingAttributes(
          indexName,
          "update",
          [], // We don't know which specific attributes are missing from the error
          updates,
          indexDef.isReadOnly,
        );
      }

      // Validate the generated keys
      if (this.hasUndefinedValues(key)) {
        throw IndexErrors.undefinedValues(indexName, "update", key, updates);
      }

      const gsiConfig = this.table.gsis[indexName];
      if (!gsiConfig) {
        throw ConfigurationErrors.gsiNotFound(indexName, this.table.tableName, Object.keys(this.table.gsis));
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
