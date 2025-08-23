import type { Table } from "../table";
import type { DynamoItem } from "../types";

/**
 * Represents a generated key for a DynamoDB index
 */
export interface IndexKey {
  /** The partition key value */
  pk: string;
  /** The sort key value (optional) */
  sk?: string;
}

/**
 * Configuration for a DynamoDB index
 */
export interface IndexConfig<T extends DynamoItem> {
  /** The name of the index */
  name: string;
  /** The partition key attribute name */
  partitionKey: string;
  /** The sort key attribute name (optional) */
  sortKey?: string;
  /** Whether the index is read-only */
  readOnly?: boolean;
  /** Function to generate the index key from an item */
  generateKey: (item: T, options?: { safeParse?: boolean }) => IndexKey;
}

/**
 * Helper class for building indexes for DynamoDB operations
 */
export class IndexBuilder<T extends DynamoItem> {
  /**
   * Creates a new IndexBuilder instance
   *
   * @param table - The DynamoDB table instance
   * @param indexes - The index configurations
   */
  constructor(
    private readonly table: Table,
    private readonly indexes: Record<string, IndexConfig<T>> = {},
  ) {}

  /**
   * Build index attributes for item creation
   *
   * @param item - The item to generate indexes for
   * @param options - Options for building indexes
   * @returns Record of GSI attribute names to their values
   */
  buildForCreate(item: T, options: { safeParse?: boolean; excludeReadOnly?: boolean } = {}): Record<string, string> {
    const attributes: Record<string, string> = {};

    for (const [indexName, indexConfig] of Object.entries(this.indexes)) {
      // Skip read-only indexes if requested
      if (options.excludeReadOnly && indexConfig.readOnly) {
        continue;
      }

      const key = indexConfig.generateKey(item, { safeParse: options.safeParse });
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
  buildForUpdate(currentData: T, updates: Partial<T>, options: { safeParse?: boolean } = {}): Record<string, string> {
    const attributes: Record<string, string> = {};
    const updatedItem = { ...currentData, ...updates } as T;

    for (const [indexName, indexConfig] of Object.entries(this.indexes)) {
      // Skip read-only indexes - they should never be updated
      if (indexConfig.readOnly) {
        continue;
      }

      // Check if this index uses any fields from the update data
      // We test this by generating keys with and without the update fields
      let shouldUpdateIndex = false;

      try {
        // Generate key with current data only
        const currentKey = indexConfig.generateKey(currentData, { safeParse: options.safeParse });

        // Generate key with merged data
        const updatedKey = indexConfig.generateKey(updatedItem, { safeParse: options.safeParse });

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
        const key = indexConfig.generateKey(updatedItem, { safeParse: options.safeParse });

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
          `Cannot update entity: insufficient data to regenerate index "${indexName}". All attributes required by the index must be provided in the update operation, or the index must be marked as readOnly.`,
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
  private hasUndefinedValues(key: IndexKey): boolean {
    return (key.pk?.includes("undefined") ?? false) || (key.sk?.includes("undefined") ?? false);
  }
}
