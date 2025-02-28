import type { QueryBuilder } from "./query-builder";

export interface PaginationResult<T> {
  items: T[];
  lastEvaluatedKey?: Record<string, unknown>;
  hasNextPage: boolean;
  page: number;
}

export class Paginator<T extends Record<string, unknown>> {
  private queryBuilder: QueryBuilder<T>;
  private pageSize: number;
  private currentPage = 0;
  private lastEvaluatedKey?: Record<string, unknown>;
  private hasMorePages = true;
  private totalItemsRetrieved = 0;
  private overallLimit?: number;

  constructor(queryBuilder: QueryBuilder<T>, pageSize: number) {
    this.queryBuilder = queryBuilder;
    this.pageSize = pageSize;
    // Store the overall limit from the query builder if it exists
    this.overallLimit = queryBuilder.getLimit();
  }

  /**
   * Get the current page number (1-indexed)
   */
  getCurrentPage(): number {
    return this.currentPage;
  }

  /**
   * Check if there are more pages available
   */
  hasNextPage(): boolean {
    // If we have an overall limit and we've already retrieved that many items, there are no more pages
    if (this.overallLimit !== undefined && this.totalItemsRetrieved >= this.overallLimit) {
      return false;
    }
    return this.hasMorePages;
  }

  /**
   * Get the next page of results
   */
  async getNextPage(): Promise<PaginationResult<T>> {
    if (!this.hasNextPage()) {
      return {
        items: [],
        hasNextPage: false,
        page: this.currentPage,
      };
    }

    // Calculate how many items to fetch for this page
    let effectivePageSize = this.pageSize;

    // If we have an overall limit, make sure we don't fetch more than what's left
    if (this.overallLimit !== undefined) {
      const remainingItems = this.overallLimit - this.totalItemsRetrieved;
      if (remainingItems <= 0) {
        return {
          items: [],
          hasNextPage: false,
          page: this.currentPage,
        };
      }
      effectivePageSize = Math.min(effectivePageSize, remainingItems);
    }

    // Clone the query builder to avoid modifying the original
    const query = this.queryBuilder.clone().limit(effectivePageSize);

    // Apply the last evaluated key if we have one
    if (this.lastEvaluatedKey) {
      query.startFrom(this.lastEvaluatedKey);
    }

    // Execute the query
    const result = await query.execute();

    // Update pagination state
    this.currentPage += 1;
    this.lastEvaluatedKey = result.lastEvaluatedKey;
    this.totalItemsRetrieved += result.items.length;

    // Determine if there are more pages
    // We have more pages if:
    // 1. DynamoDB returned a lastEvaluatedKey AND
    // 2. We haven't hit our overall limit (if one exists)
    this.hasMorePages =
      !!result.lastEvaluatedKey && (this.overallLimit === undefined || this.totalItemsRetrieved < this.overallLimit);

    return {
      items: result.items,
      lastEvaluatedKey: result.lastEvaluatedKey,
      hasNextPage: this.hasNextPage(),
      page: this.currentPage,
    };
  }

  /**
   * Get all remaining pages and combine the results
   */
  async getAllPages(): Promise<T[]> {
    const allItems: T[] = [];

    while (this.hasNextPage()) {
      const result = await this.getNextPage();
      allItems.push(...result.items);
    }

    return allItems;
  }
}
