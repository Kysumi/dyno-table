import type { DynamoItem, Index } from "../types";
import type { Table } from "../table";

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
 * Extended Index interface with additional properties for index generation
 */
export interface IndexWithGeneration<T extends DynamoItem> extends Index<T> {
  /** Function to generate the index key from an item */
  generateKey: (item: T) => { pk: string; sk?: string };
  /** Whether the index is read-only */
  isReadOnly?: boolean;
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
    private readonly indexes: Record<string, IndexWithGeneration<T>> = {},
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
  buildForUpdate(currentData: T, updates: Partial<T>): Record<string, string> {
    const attributes: Record<string, string> = {};
    const updatedItem = { ...currentData, ...updates } as T;

    for (const [indexName, indexDef] of Object.entries(this.indexes)) {
      // Skip read-only indexes - they should never be updated
      if (indexDef.isReadOnly) {
        continue;
      }

      // Check if this index uses any fields from the update data
      // We test this by generating keys with and without the update fields
      let shouldUpdateIndex = false;

      try {
        // Generate key with current data only
        const currentKey = indexDef.generateKey(currentData);

        // Generate key with merged data
        const updatedKey = indexDef.generateKey(updatedItem);

        // If the keys are different, this index is affected by the update
        if (currentKey.pk !== updatedKey.pk || currentKey.sk !== updatedKey.sk) {
          shouldUpdateIndex = true;
        }
      } catch {
        // If we can't generate both keys for comparison, assume the index needs updating
        // This happens when we don't have all the required data
        shouldUpdateIndex = true;
      }

      if (!shouldUpdateIndex) {
        continue;
      }

      // Now generate the full key and validate it
      try {
        const key = indexDef.generateKey(updatedItem);

        // Validate the generated keys
        if (this.hasUndefinedValues(key)) {
          throw new Error(
            `Cannot update entity: insufficient data to regenerate index "${indexName}". All attributes required by the index must be provided in the update operation, or the index must be marked as readOnly.`,
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
      } catch (error) {
        if (error instanceof Error && error.message.includes("insufficient data")) {
          throw error;
        }
        // If we can't generate the key due to missing data, throw a descriptive error
        throw new Error(
          `Cannot update entity: insufficient data to regenerate index "${indexName}". All attributes required by the index must be provided in the update operation, or the index must be readOnly.`,
        );
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
