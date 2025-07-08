import type { DynamoItem, TableConfig } from "../types";
import type { QueryBuilderInterface } from "./builder-types";

/**
 * Function type for executing DynamoDB operations and returning raw results.
 */
type DirectExecutor<T extends DynamoItem> = () => Promise<{ items: T[]; lastEvaluatedKey?: DynamoItem }>;

/**
 * Minimal result generator that provides async iteration over DynamoDB results with automatic pagination.
 *
 * @example
 * ```typescript
 * const results = await queryBuilder.execute();
 *
 * for await (const item of results) {
 *   console.log(item);
 * }
 * ```
 */
export class ResultIterator<T extends DynamoItem, TConfig extends TableConfig = TableConfig> {
  private lastEvaluatedKey?: DynamoItem | null;
  private itemsYielded = 0;
  private readonly overallLimit?: number;

  constructor(
    private queryBuilder: QueryBuilderInterface<T, TConfig>,
    private directExecutor: DirectExecutor<T>,
  ) {
    this.overallLimit = queryBuilder.getLimit();
  }

  /**
   * Async iterator with automatic pagination
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    let hasMorePages = true;

    while (hasMorePages) {
      const result = await this.directExecutor();

      for (const item of result.items) {
        // Check if we've reached the overall limit
        if (this.overallLimit !== undefined && this.itemsYielded >= this.overallLimit) {
          return;
        }
        
        yield item;
        this.itemsYielded++;
      }

      // Update lastEvaluatedKey, but preserve the last non-null value
      if (result.lastEvaluatedKey !== null && result.lastEvaluatedKey !== undefined) {
        this.lastEvaluatedKey = result.lastEvaluatedKey;
        // Update the query builder's options for the next iteration
        this.queryBuilder.startFrom(result.lastEvaluatedKey);
      } else if (result.lastEvaluatedKey === null) {
        // Only set to null if we haven't seen a lastEvaluatedKey yet
        if (this.lastEvaluatedKey === undefined) {
          this.lastEvaluatedKey = null;
        }
      }
      
      // Stop if we've reached the overall limit or no more pages
      hasMorePages = !!result.lastEvaluatedKey && 
                    (this.overallLimit === undefined || this.itemsYielded < this.overallLimit);
    }
  }

  /**
   * Convert to array (loads all pages).
   *
   * ```ts
   * const result = await table.query({ pk: "foo" }).execute();
   * const allItemsFromDynamo = await result.toArray();
   * ```
   *
   * Note: This will load all pages into memory. For large datasets, consider using async iteration instead.
   *```ts
   * const result = await table.query({ pk: "foo" }).execute();
   * for await (const item of result) {
   *   // Process each item
   * }
   * ```
   */
  async toArray(): Promise<T[]> {
    const items: T[] = [];
    for await (const item of this) {
      items.push(item);
    }
    return items;
  }

  /**
   * Get the last evaluated key
   */
  getLastEvaluatedKey(): DynamoItem | undefined {
    return this.lastEvaluatedKey === null ? undefined : this.lastEvaluatedKey;
  }
}
