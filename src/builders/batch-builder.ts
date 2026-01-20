import type { PrimaryKeyWithoutExpression } from "../conditions";
import { BatchError } from "../errors";
import type { BatchWriteOperation } from "../operation-types";
import type { DynamoItem } from "../types";
import { BatchErrors } from "../utils/error-factory";
import type { DeleteCommandParams, PutCommandParams } from "./builder-types";
import type { GetCommandParams } from "./get-builder";

// Constants for DynamoDB batch limits
const _DDB_BATCH_WRITE_LIMIT = 25;
const _DDB_BATCH_GET_LIMIT = 100;

/**
 * Represents a single operation within a DynamoDB batch.
 * Each operation can be one of:
 * - Put: Insert or replace an item
 * - Delete: Remove an item
 * - Get: Retrieve an item
 */
export type BatchItem =
  | { type: "Put"; params: PutCommandParams }
  | { type: "Delete"; params: DeleteCommandParams }
  | { type: "Get"; params: GetCommandParams };

/**
 * Typed batch item that preserves entity type information
 */
export type TypedBatchItem<T extends DynamoItem = DynamoItem> =
  | { type: "Put"; params: PutCommandParams; entityType?: string; resultType?: T }
  | { type: "Delete"; params: DeleteCommandParams; entityType?: string }
  | { type: "Get"; params: GetCommandParams; entityType?: string; resultType?: T };

/**
 * Configuration for batch operations
 */
export interface BatchConfig {
  partitionKey: string;
  sortKey?: string;
}

/**
 * Executor function for batch write operations
 */
type BatchWriteExecutor = (operations: Array<BatchWriteOperation<DynamoItem>>) => Promise<{
  unprocessedItems: Array<BatchWriteOperation<DynamoItem>>;
}>;

/**
 * Executor function for batch get operations
 */
type BatchGetExecutor = (keys: Array<PrimaryKeyWithoutExpression>) => Promise<{
  items: DynamoItem[];
  unprocessedKeys: PrimaryKeyWithoutExpression[];
}>;

// BatchError is now imported from errors.ts

/**
 * Result structure for batch operations
 */
export interface BatchResult {
  /** Whether the batch operation completed successfully */
  success: boolean;

  /** Write operation results */
  writes: {
    /** Number of write operations processed successfully */
    processed: number;
    /** Write operations that were not processed and may need retry */
    unprocessed: Array<BatchWriteOperation<DynamoItem>>;
  };

  /** Read operation results */
  reads: {
    /** Items retrieved from the batch get operations */
    items: DynamoItem[];
    /** Number of items found and returned */
    found: number;
    /** Keys that were not processed and may need retry */
    unprocessed: PrimaryKeyWithoutExpression[];
  };

  /** Total number of operations in the batch */
  totalOperations: number;

  /** Any errors that occurred during batch processing */
  errors?: BatchError[];
}

/**
 * Typed result structure for batch operations with entity type information
 */
export interface TypedBatchResult<TEntities extends Record<string, DynamoItem> = Record<string, DynamoItem>> {
  /** Whether the batch operation completed successfully */
  success: boolean;

  /** Write operation results */
  writes: {
    /** Number of write operations processed successfully */
    processed: number;
    /** Write operations that were not processed and may need retry */
    unprocessed: Array<BatchWriteOperation<DynamoItem>>;
  };

  /** Read operation results with typed items */
  reads: {
    /** Items retrieved from the batch get operations, grouped by entity type */
    itemsByType: {
      [K in keyof TEntities]: TEntities[K][];
    };
    /** All items retrieved (typed as union of all entity types) */
    items: TEntities[keyof TEntities][];
    /** Number of items found and returned */
    found: number;
    /** Keys that were not processed and may need retry */
    unprocessed: PrimaryKeyWithoutExpression[];
  };

  /** Total number of operations in the batch */
  totalOperations: number;

  /** Any errors that occurred during batch execution */
  errors?: BatchError[];
}

/**
 * Builder for creating and executing DynamoDB batch operations with full entity support and type inference.
 *
 * Use BatchBuilder when you need to:
 * - Perform multiple operations efficiently (up to 25 writes, 100 reads per batch)
 * - Maintain entity validation, key generation, and type safety
 * - Mix read and write operations in a single batch
 * - Get typed results grouped by entity type
 *
 * @example Basic Usage
 * ```typescript
 * // Define entity types for the batch
 * const batch = table.batchBuilder<{
 *   User: UserEntity;
 *   Order: OrderEntity;
 * }>();
 *
 * // Add operations using entity repositories
 * userRepo.create(newUser).withBatch(batch, 'User')
 * userRepo.delete({ id: 'old-user' }).withBatch(batch, 'User')
 * orderRepo.get({ id: 'existing-order' }).withBatch(batch, 'Order')
 *
 * // Execute all operations and get typed results
 * const result = await batch.execute()
 * const users: UserEntity[] = result.reads.itemsByType.User
 * const orders: OrderEntity[] = result.reads.itemsByType.Order
 * ```
 *
 * @example Error Handling
 * ```typescript
 * try {
 *   const result = await batch.execute()
 *
 *   if (result.writes.unprocessed.length > 0) {
 *     console.warn('Some writes were not processed:', result.writes.unprocessed)
 *   }
 * } catch (error) {
 *   if (error instanceof BatchError) {
 *     console.error('Batch operation failed:', error.message)
 *   }
 * }
 * ```
 */
export class BatchBuilder<TEntities extends Record<string, DynamoItem> = Record<string, DynamoItem>> {
  private writeItems: Array<TypedBatchItem<DynamoItem>> = [];
  private getItems: Array<TypedBatchItem<DynamoItem>> = [];

  constructor(
    private batchWriteExecutor: BatchWriteExecutor,
    private batchGetExecutor: BatchGetExecutor,
    private config: BatchConfig,
  ) {}

  /**
   * Checks if the batch is empty (contains no operations)
   *
   * @returns true if the batch contains no operations
   */
  isEmpty(): boolean {
    return this.writeItems.length === 0 && this.getItems.length === 0;
  }

  /**
   * Gets the count of operations in the batch
   *
   * @returns Object containing the count of write and read operations
   */
  getOperationCount(): { writes: number; reads: number } {
    return {
      writes: this.writeItems.length,
      reads: this.getItems.length,
    };
  }

  /**
   * Validates that the batch is not empty before execution
   *
   * @throws {BatchError} If the batch is empty
   */
  private validateNotEmpty(): void {
    if (this.isEmpty()) {
      throw BatchErrors.batchEmpty("write");
    }
  }

  /**
   * Adds a put operation to the batch with entity type information.
   * This method is used internally by entity builders.
   *
   * @param command - The complete put command configuration
   * @param entityType - The entity type name for type tracking
   * @returns The batch builder for method chaining
   * @internal
   */
  putWithCommand<K extends keyof TEntities>(command: PutCommandParams, entityType?: K): this {
    const batchItem: TypedBatchItem<TEntities[K]> = {
      type: "Put",
      params: command,
      entityType: entityType as string,
    };
    this.writeItems.push(batchItem);
    return this;
  }

  /**
   * Adds a delete operation to the batch with entity type information.
   * This method is used internally by entity builders.
   *
   * @param command - The complete delete command configuration
   * @param entityType - The entity type name for type tracking
   * @returns The batch builder for method chaining
   * @internal
   */
  deleteWithCommand<K extends keyof TEntities>(command: DeleteCommandParams, entityType?: K): this {
    const batchItem: TypedBatchItem = {
      type: "Delete",
      params: command,
      entityType: entityType as string,
    };
    this.writeItems.push(batchItem);
    return this;
  }

  /**
   * Adds a get operation to the batch with entity type information.
   * This method is used internally by entity builders.
   *
   * @param command - The complete get command configuration
   * @param entityType - The entity type name for type tracking
   * @returns The batch builder for method chaining
   * @internal
   */
  getWithCommand<K extends keyof TEntities>(command: GetCommandParams, entityType?: K): this {
    const batchItem: TypedBatchItem<TEntities[K]> = {
      type: "Get",
      params: command,
      entityType: entityType as string,
    };
    this.getItems.push(batchItem);
    return this;
  }

  /**
   * Executes all write operations in the batch.
   *
   * @returns A promise that resolves to any unprocessed operations
   * @private
   */
  private async executeWrites(): Promise<{ unprocessedItems: Array<BatchWriteOperation<DynamoItem>> }> {
    if (this.writeItems.length === 0) {
      return { unprocessedItems: [] };
    }

    try {
      // Convert batch items to BatchWriteOperation format
      const operations: Array<BatchWriteOperation<DynamoItem>> = this.writeItems.map((item) => {
        if (item.type === "Put") {
          return {
            type: "put" as const,
            item: item.params.item,
          };
        }

        if (item.type === "Delete") {
          // Convert key to PrimaryKeyWithoutExpression format if needed
          let key: PrimaryKeyWithoutExpression;
          if (typeof item.params.key === "object" && item.params.key !== null && "pk" in item.params.key) {
            key = item.params.key as PrimaryKeyWithoutExpression;
          } else {
            // Convert from table key format to PrimaryKeyWithoutExpression
            const tableKey = item.params.key as Record<string, unknown>;
            key = {
              pk: tableKey[this.config.partitionKey] as string,
              sk: this.config.sortKey ? (tableKey[this.config.sortKey] as string) : undefined,
            };
          }

          return {
            type: "delete" as const,
            key,
          };
        }

        throw BatchErrors.unsupportedType("write", item);
      });

      return await this.batchWriteExecutor(operations);
    } catch (error) {
      if (error instanceof BatchError) throw error;

      throw BatchErrors.batchWriteFailed(
        [],
        { operationCount: this.writeItems.length },
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Executes all get operations in the batch.
   *
   * @returns A promise that resolves to the retrieved items
   * @private
   */
  private async executeGets(): Promise<{ items: DynamoItem[]; unprocessedKeys: PrimaryKeyWithoutExpression[] }> {
    if (this.getItems.length === 0) {
      return { items: [], unprocessedKeys: [] };
    }

    try {
      // Convert batch items to keys for batch get
      const keys: Array<PrimaryKeyWithoutExpression> = this.getItems.map((item) => {
        if (item.type === "Get") {
          // Convert key to PrimaryKeyWithoutExpression format if needed
          if (typeof item.params.key === "object" && item.params.key !== null && "pk" in item.params.key) {
            return item.params.key as PrimaryKeyWithoutExpression;
          }

          // Convert from table key format to PrimaryKeyWithoutExpression
          const tableKey = item.params.key as Record<string, unknown>;
          return {
            pk: tableKey[this.config.partitionKey] as string,
            sk: this.config.sortKey ? (tableKey[this.config.sortKey] as string) : undefined,
          };
        }

        throw BatchErrors.unsupportedType("read", item);
      });

      return await this.batchGetExecutor(keys);
    } catch (error) {
      if (error instanceof BatchError) throw error;

      throw BatchErrors.batchGetFailed(
        [],
        { operationCount: this.getItems.length },
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Groups retrieved items by their entity type.
   * @private
   */
  private groupItemsByType(items: DynamoItem[]): { [K in keyof TEntities]: TEntities[K][] } {
    const grouped = {} as { [K in keyof TEntities]: TEntities[K][] };

    // Initialize all entity types with empty arrays
    for (const item of this.getItems) {
      if (item.entityType) {
        const entityType = item.entityType as keyof TEntities;
        if (!grouped[entityType]) {
          grouped[entityType] = [];
        }
      }
    }

    // Group items by their entityType attribute
    for (const item of items) {
      const entityType = item.entityType as keyof TEntities;
      if (entityType && grouped[entityType]) {
        grouped[entityType].push(item as TEntities[keyof TEntities]);
      }
    }

    return grouped;
  }

  /**
   * Executes all operations in the batch with typed results.
   * Performs write operations first, then get operations.
   *
   * @returns A promise that resolves to a TypedBatchResult with entity type information
   * @throws {BatchError} If the batch is empty or if operations fail
   */
  async execute(): Promise<TypedBatchResult<TEntities>> {
    this.validateNotEmpty();

    const errors: BatchError[] = [];
    let writeResults: { unprocessedItems: Array<BatchWriteOperation<DynamoItem>> } = { unprocessedItems: [] };
    let getResults: { items: DynamoItem[]; unprocessedKeys: PrimaryKeyWithoutExpression[] } = {
      items: [],
      unprocessedKeys: [],
    };

    // Execute writes if any
    if (this.writeItems.length > 0) {
      try {
        writeResults = await this.executeWrites();
      } catch (error) {
        if (error instanceof BatchError) {
          errors.push(error);
        } else {
          errors.push(
            new BatchError(
              "Unexpected error during write operations",
              ErrorCodes.BATCH_WRITE_FAILED,
              "write",
              {},
              error instanceof Error ? error : undefined,
            ),
          );
        }
      }
    }

    // Execute gets if any
    if (this.getItems.length > 0) {
      try {
        getResults = await this.executeGets();
      } catch (error) {
        if (error instanceof BatchError) {
          errors.push(error);
        } else {
          errors.push(
            new BatchError(
              "Unexpected error during read operations",
              ErrorCodes.BATCH_GET_FAILED,
              "read",
              {},
              error instanceof Error ? error : undefined,
            ),
          );
        }
      }
    }

    // If there were critical errors, throw them
    if (
      errors.length > 0 &&
      (writeResults.unprocessedItems.length === this.writeItems.length ||
        getResults.unprocessedKeys.length === this.getItems.length)
    ) {
      throw errors[0]; // Throw the first critical error
    }

    const totalOperations = this.writeItems.length + this.getItems.length;
    const success =
      errors.length === 0 && writeResults.unprocessedItems.length === 0 && getResults.unprocessedKeys.length === 0;

    return {
      success,
      writes: {
        processed: this.writeItems.length - writeResults.unprocessedItems.length,
        unprocessed: writeResults.unprocessedItems,
      },
      reads: {
        itemsByType: this.groupItemsByType(getResults.items),
        items: getResults.items as TEntities[keyof TEntities][],
        found: getResults.items.length,
        unprocessed: getResults.unprocessedKeys,
      },
      totalOperations,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
