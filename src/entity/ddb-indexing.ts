import { DynoTableError } from "../errors.js";
import type { Table } from "../table.js";
import type { DynamoItem } from "../types.js";
import { ConfigurationErrors, IndexErrors } from "../utils/error-factory.js";
import { extractRequiredAttributes } from "../utils/error-utils.js";
import type { IndexDefinition } from "./create-index.js";

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
export class GsiKeyBuilder<T extends DynamoItem> {
  /**
   * Creates a new GsiKeyBuilder instance
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
        const gsiConfig = this.table.gsis[indexName];

        throw IndexErrors.generationFailed(
          indexName,
          "create",
          item,
          gsiConfig?.partitionKey,
          gsiConfig?.sortKey,
          error instanceof Error ? error : undefined,
        );
      }

      this.applyIndexKey(indexName, key, attributes);
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
      const key = this.getUpdatedKey(indexName, indexDef, currentData, updatedItem, updates, options);
      if (!key) continue;

      // Validate the generated keys
      if (this.hasUndefinedValues(key)) {
        throw IndexErrors.undefinedValues(indexName, "update", key, updates);
      }

      this.applyIndexKey(indexName, key, attributes);
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
    const undefinedSegment = /(^|[^a-zA-Z0-9])undefined($|[^a-zA-Z0-9])/;
    return undefinedSegment.test(key.pk ?? "") || undefinedSegment.test(key.sk ?? "");
  }

  private getUpdatedKey(
    indexName: string,
    indexDef: IndexDefinition<T>,
    currentData: T,
    updatedItem: T,
    updates: Partial<T>,
    options: { forceRebuildIndexes?: string[] },
  ): IndexKey | undefined {
    const isForced = options.forceRebuildIndexes?.includes(indexName) ?? false;
    if (indexDef.isReadOnly && !isForced) return undefined;

    if (!isForced) {
      try {
        const currentKey = indexDef.generateKey(currentData);
        const updatedKey = indexDef.generateKey(updatedItem);
        return currentKey.pk !== updatedKey.pk || currentKey.sk !== updatedKey.sk ? updatedKey : undefined;
      } catch {
        // Generate once more below so failures use the update-specific error.
      }
    }

    try {
      return indexDef.generateKey(updatedItem);
    } catch (error) {
      if (error instanceof DynoTableError) throw error;
      throw IndexErrors.missingAttributes(
        indexName,
        "update",
        extractRequiredAttributes(error) ?? [],
        updates,
        indexDef.isReadOnly,
      );
    }
  }

  private applyIndexKey(indexName: string, key: IndexKey, attributes: Record<string, string>): void {
    const gsiConfig = this.table.gsis[indexName];
    if (!gsiConfig) {
      throw ConfigurationErrors.gsiNotFound(indexName, this.table.tableName, Object.keys(this.table.gsis));
    }

    if (key.pk) attributes[gsiConfig.partitionKey] = key.pk;
    if (key.sk && gsiConfig.sortKey) attributes[gsiConfig.sortKey] = key.sk;
  }
}
