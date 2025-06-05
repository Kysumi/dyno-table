import type { DynamoItem, TableConfig } from "../types";
import type { QueryBuilderInterface } from "./builder-types";

/**
 * An iterable result from a DynamoDB query that lazily loads additional pages
 * as the user iterates through the results.
 * 
 * This class implements the iterable protocol, allowing it to be used in for...of loops
 * and with the spread operator.
 * 
 * @example
 * ```typescript
 * // Query with automatic pagination
 * const result = await new QueryBuilder(executor, eq('type', 'order'))
 *   .execute();
 * 
 * // Iterate through all results (pages are loaded on demand)
 * for (const item of result) {
 *   console.log(item);
 * }
 * 
 * // Or convert to an array (loads all pages)
 * const allItems = await result.toArray();
 * ```
 * 
 * @typeParam T - The type of items being queried
 */
export class IterableQueryResult<T extends DynamoItem, TConfig extends TableConfig = TableConfig> implements AsyncIterable<T> {
  private items: T[];
  private lastEvaluatedKey?: Record<string, unknown>;
  private queryBuilder: QueryBuilderInterface<T, TConfig>;
  private loadedFirstPage: boolean;
  private noMorePages: boolean;

  constructor(
    initialItems: T[],
    lastEvaluatedKey: Record<string, unknown> | undefined,
    queryBuilder: QueryBuilderInterface<T, TConfig>
  ) {
    this.items = [...initialItems];
    this.lastEvaluatedKey = lastEvaluatedKey;
    this.queryBuilder = queryBuilder.clone();
    this.loadedFirstPage = true;
    this.noMorePages = !lastEvaluatedKey;
  }

  /**
   * Returns an async iterator for the query results.
   * This allows the result to be used in for...of loops and with the spread operator.
   */
  public async *[Symbol.asyncIterator](): AsyncGenerator<T, void, unknown> {
    // First yield all items we already have
    for (const item of this.items) {
      yield item;
    }

    // If we have more pages, load them on demand
    while (this.lastEvaluatedKey && !this.noMorePages) {
      const nextPage = await this.loadNextPage();
      for (const item of nextPage) {
        yield item;
      }
    }
  }

  /**
   * Loads all remaining pages and returns all items as an array.
   * 
   * @returns A promise that resolves to an array of all items
   */
  public async toArray(): Promise<T[]> {
    // If we've already loaded all pages, return the items
    if (!this.lastEvaluatedKey || this.noMorePages) {
      return [...this.items];
    }

    // Load all remaining pages
    const allItems = [...this.items];
    for await (const item of this) {
      if (!allItems.includes(item)) {
        allItems.push(item);
      }
    }

    return allItems;
  }

  /**
   * Returns the items from the first page of results.
   * This is useful when you only need to access the first page.
   * 
   * @returns The items from the first page
   */
  public getItems(): T[] {
    return [...this.items];
  }

  /**
   * Checks if there are more pages available.
   * 
   * @returns true if there are more pages, false otherwise
   */
  public hasMorePages(): boolean {
    return !!this.lastEvaluatedKey && !this.noMorePages;
  }

  /**
   * Loads the next page of results.
   * 
   * @returns A promise that resolves to an array of items from the next page
   */
  private async loadNextPage(): Promise<T[]> {
    if (!this.lastEvaluatedKey || this.noMorePages) {
      return [];
    }

    try {
      const query = this.queryBuilder.clone().startFrom(this.lastEvaluatedKey);
      const result = await query.execute();
      
      // Add the new items to our collection
      const newItems = result.items;
      this.items.push(...newItems);
      
      // Update the lastEvaluatedKey for the next page
      this.lastEvaluatedKey = result.lastEvaluatedKey;
      
      // If there's no lastEvaluatedKey, we've reached the end
      if (!result.lastEvaluatedKey) {
        this.noMorePages = true;
      }
      
      return newItems;
    } catch (error) {
      console.error("Error loading next page:", error);
      this.noMorePages = true;
      return [];
    }
  }
}