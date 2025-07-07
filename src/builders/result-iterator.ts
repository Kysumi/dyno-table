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
  private lastEvaluatedKey?: DynamoItem;

  constructor(
    private queryBuilder: QueryBuilderInterface<T, TConfig>,
    private directExecutor: DirectExecutor<T>,
  ) {}

  /**
   * Async iterator with automatic pagination
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    let hasMorePages = true;

    while (hasMorePages) {
      const query = this.queryBuilder.clone();

      if (this.lastEvaluatedKey) {
        query.startFrom(this.lastEvaluatedKey);
      }

      const result = await this.directExecutor();

      for (const item of result.items) {
        yield item;
      }

      this.lastEvaluatedKey = result.lastEvaluatedKey;
      hasMorePages = !!result.lastEvaluatedKey;
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
    return this.lastEvaluatedKey;
  }
}
