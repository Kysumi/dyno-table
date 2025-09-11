import type { DynamoItem, TableConfig } from "../types";
import type { QueryBuilderInterface } from "./builder-types";
import { type ProjectedResult, projectItem } from "./projection-types";
import type { Path } from "./types";

/**
 * Function type for executing DynamoDB operations and returning raw results.
 */
type DirectExecutor<T extends DynamoItem> = () => Promise<{ items: T[]; lastEvaluatedKey?: DynamoItem }>;

/**
 * Minimal result generator that provides async iteration over DynamoDB results with automatic pagination.
 * Supports type-safe projection when fields are selected.
 *
 * @example
 * ```typescript
 * // Without projection - returns full items
 * const results = await queryBuilder.execute();
 * for await (const item of results) {
 *   console.log(item); // Full item type
 * }
 *
 * // With projection - returns projected items
 * const results = await queryBuilder.select(['name', 'email']).execute();
 * for await (const user of results) {
 *   console.log(user.name, user.email); // Only selected fields, fully typed
 * }
 * ```
 */
export class ResultIterator<
  T extends DynamoItem,
  TConfig extends TableConfig = TableConfig,
  TSelected extends Path<T>[] = [],
  TResult = TSelected extends readonly [] ? T : ProjectedResult<T, TSelected>,
> {
  private lastEvaluatedKey?: DynamoItem | null;
  private itemsYielded = 0;
  private readonly overallLimit?: number;

  constructor(
    private queryBuilder: QueryBuilderInterface<T, TConfig>,
    private directExecutor: DirectExecutor<T>,
    private selectedFields?: TSelected,
  ) {
    this.overallLimit = queryBuilder.getLimit();
  }

  /**
   * Async iterator with automatic pagination and projection
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<TResult> {
    let hasMorePages = true;

    while (hasMorePages) {
      const result = await this.directExecutor();

      for (const item of result.items) {
        // Check if we've reached the overall limit
        if (this.overallLimit !== undefined && this.itemsYielded >= this.overallLimit) {
          return;
        }

        // Apply projection if fields are selected
        const projectedItem =
          this.selectedFields && this.selectedFields.length > 0 ? projectItem(item, this.selectedFields) : item;

        yield projectedItem as TResult;
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
      hasMorePages =
        !!result.lastEvaluatedKey && (this.overallLimit === undefined || this.itemsYielded < this.overallLimit);
    }
  }

  /**
   * Convert to array (loads all pages) with projection applied.
   *
   * ```ts
   * // Without projection
   * const result = await table.query({ pk: "foo" }).execute();
   * const allItems = await result.toArray(); // Type: T[]
   *
   * // With projection
   * const result = await table.query({ pk: "foo" }).select(['name', 'email']).execute();
   * const users = await result.toArray(); // Type: { name: string; email: string }[]
   * ```
   *
   * Note: This will load all pages into memory. For large datasets, consider using async iteration instead.
   */
  async toArray(): Promise<TResult[]> {
    const items: TResult[] = [];
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
