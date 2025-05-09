import type { DynamoItem, TableConfig } from "../types";
import type { PaginationResult, QueryBuilderInterface } from "./builder-types";

/**
 * A utility class for handling DynamoDB pagination.
 * Use this class when you need to:
 * - Browse large collections of dinosaurs
 * - Review extensive security logs
 * - Analyze habitat inspection history
 * - Process feeding schedules
 *
 * The paginator maintains internal state and automatically handles:
 * - Page boundaries
 * - Result set limits
 * - Continuation tokens
 *
 * @example
 * ```typescript
 * // List all velociraptors with pagination
 * const paginator = new QueryBuilder(executor, eq('species', 'Velociraptor'))
 *   .filter(op => op.eq('status', 'ACTIVE'))
 *   .paginate(10);
 *
 * // Process each page of dinosaurs
 * while (paginator.hasNextPage()) {
 *   const page = await paginator.getNextPage();
 *   console.log(`Processing page ${page.page} of velociraptors`);
 *
 *   for (const raptor of page.items) {
 *     console.log(`- ${raptor.id}: Health=${raptor.stats.health}`);
 *   }
 * }
 * ```
 *
 * @typeParam T - The type of items being paginated
 * @typeParam TConfig - The table configuration type
 */
export class Paginator<T extends DynamoItem, TConfig extends TableConfig = TableConfig> {
  private queryBuilder: QueryBuilderInterface<T, TConfig>;
  private readonly pageSize: number;
  private currentPage = 0;
  private lastEvaluatedKey?: DynamoItem;
  private hasMorePages = true;
  private totalItemsRetrieved = 0;
  private readonly overallLimit?: number;

  constructor(queryBuilder: QueryBuilderInterface<T, TConfig>, pageSize: number) {
    this.queryBuilder = queryBuilder;
    this.pageSize = pageSize;
    // Store the overall limit from the query builder if it exists
    this.overallLimit = queryBuilder.getLimit();
  }

  /**
   * Gets the current page number (1-indexed).
   * Use this method when you need to:
   * - Track progress through dinosaur lists
   * - Display habitat inspection status
   * - Monitor security sweep progress
   *
   * @example
   * ```ts
   * const paginator = new QueryBuilder(executor, eq('species', 'Tyrannosaurus'))
   *   .paginate(5);
   *
   * await paginator.getNextPage();
   * console.log(`Reviewing T-Rex group ${paginator.getCurrentPage()}`);
   * ```
   *
   * @returns The current page number, starting from 1
   */
  public getCurrentPage(): number {
    return this.currentPage;
  }

  /**
   * Checks if there are more pages of dinosaurs or habitats to process.
   * Use this method when you need to:
   * - Check for more dinosaurs to review
   * - Continue habitat inspections
   * - Process security incidents
   * - Complete feeding schedules
   *
   * This method takes into account both:
   * - DynamoDB's lastEvaluatedKey mechanism
   * - Any overall limit set on the query
   *
   * @example
   * ```ts
   * // Process all security incidents
   * const paginator = new QueryBuilder(executor, eq('type', 'SECURITY_BREACH'))
   *   .sortDescending()
   *   .paginate(10);
   *
   * while (paginator.hasNextPage()) {
   *   const page = await paginator.getNextPage();
   *   for (const incident of page.items) {
   *     await processSecurityBreach(incident);
   *   }
   *   console.log(`Processed incidents page ${page.page}`);
   * }
   * ```
   *
   * @returns true if there are more pages available, false otherwise
   */
  public hasNextPage(): boolean {
    // If we have an overall limit and we've already retrieved that many items, there are no more pages
    if (this.overallLimit !== undefined && this.totalItemsRetrieved >= this.overallLimit) {
      return false;
    }
    return this.hasMorePages;
  }

  /**
   * Retrieves the next page of dinosaurs or habitats from DynamoDB.
   * Use this method when you need to:
   * - Process dinosaur groups systematically
   * - Review habitat inspections in batches
   * - Monitor security incidents in sequence
   * - Schedule feeding rotations
   *
   * This method handles:
   * - Automatic continuation between groups
   * - Respect for park capacity limits
   * - Group size adjustments for safety
   *
   * @example
   * ```ts
   * const paginator = new QueryBuilder(executor, eq('species', 'Velociraptor'))
   *   .filter(op => op.eq('status', 'ACTIVE'))
   *   .paginate(5);
   *
   * // Check first raptor group
   * const page1 = await paginator.getNextPage();
   * console.log(`Found ${page1.items.length} active raptors`);
   *
   * // Continue inspection if more groups exist
   * if (page1.hasNextPage) {
   *   const page2 = await paginator.getNextPage();
   *   console.log(`Inspecting raptor group ${page2.page}`);
   *
   *   for (const raptor of page2.items) {
   *     await performHealthCheck(raptor);
   *   }
   * }
   * ```
   *
   * @returns A promise that resolves to a PaginationResult containing:
   *          - items: The dinosaurs/habitats for this page
   *          - hasNextPage: Whether more groups exist
   *          - page: The current group number
   *          - lastEvaluatedKey: DynamoDB's continuation token
   */
  public async getNextPage(): Promise<PaginationResult<T>> {
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
   * Gets all remaining dinosaurs or habitats and combines them into a single array.
   * Use this method when you need to:
   * - Generate complete park inventory
   * - Perform full security audit
   * - Create comprehensive feeding schedule
   * - Run park-wide health checks
   *
   * Note: Use with caution! This method:
   * - Could overwhelm systems with large dinosaur populations
   * - Makes multiple database requests
   * - May cause system strain during peak hours
   *
   * @example
   * ```ts
   * // Get complete carnivore inventory
   * const paginator = new QueryBuilder(executor, eq('diet', 'CARNIVORE'))
   *   .filter(op => op.eq('status', 'ACTIVE'))
   *   .paginate(10);
   *
   * try {
   *   const allCarnivores = await paginator.getAllPages();
   *   console.log(`Park contains ${allCarnivores.length} active carnivores`);
   *
   *   // Calculate total threat level
   *   const totalThreat = allCarnivores.reduce(
   *     (sum, dino) => sum + dino.stats.threatLevel,
   *     0
   *   );
   *   console.log(`Total threat level: ${totalThreat}`);
   * } catch (error) {
   *   console.error('Failed to complete carnivore census:', error);
   * }
   * ```
   *
   * @returns A promise that resolves to an array containing all remaining items
   */
  public async getAllPages(): Promise<T[]> {
    const allItems: T[] = [];

    while (this.hasNextPage()) {
      const result = await this.getNextPage();
      allItems.push(...result.items);
    }

    return allItems;
  }
}
