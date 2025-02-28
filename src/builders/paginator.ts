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

  constructor(queryBuilder: QueryBuilder<T>, pageSize: number) {
    this.queryBuilder = queryBuilder;
    this.pageSize = pageSize;
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
    return this.hasMorePages;
  }

  /**
   * Get the next page of results
   */
  async getNextPage(): Promise<PaginationResult<T>> {
    if (!this.hasMorePages) {
      return {
        items: [],
        hasNextPage: false,
        page: this.currentPage,
      };
    }

    // Clone the query builder to avoid modifying the original
    const query = this.queryBuilder.clone().limit(this.pageSize);

    // Apply the last evaluated key if we have one
    if (this.lastEvaluatedKey) {
      query.startFrom(this.lastEvaluatedKey);
    }

    // Execute the query
    const result = await query.execute();

    // Update pagination state
    this.currentPage += 1;
    this.lastEvaluatedKey = result.lastEvaluatedKey;
    this.hasMorePages = !!result.lastEvaluatedKey;

    return {
      items: result.items,
      lastEvaluatedKey: result.lastEvaluatedKey,
      hasNextPage: this.hasMorePages,
      page: this.currentPage,
    };
  }

  /**
   * Get all remaining pages and combine the results
   */
  async getAllPages(): Promise<T[]> {
    const allItems: T[] = [];

    while (this.hasMorePages) {
      const result = await this.getNextPage();
      allItems.push(...result.items);
    }

    return allItems;
  }
}
