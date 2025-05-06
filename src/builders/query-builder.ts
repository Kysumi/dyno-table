import type { Condition } from "../conditions";
import { FilterBuilder, type FilterOptions } from "./filter-builder";
import type { TableConfig } from "../types";
import type { QueryBuilderInterface } from "./builder-types";

/**
 * Configuration options for DynamoDB query operations.
 * Extends the base FilterOptions with query-specific options.
 */
export interface QueryOptions extends FilterOptions {
  /** Condition for the sort key in the table or index */
  sortKeyCondition?: Condition;
  /** Direction of sort key traversal (true for ascending, false for descending) */
  scanIndexForward?: boolean;
}

/**
 * Function type for executing DynamoDB query operations.
 * @typeParam T - The type of items being queried
 */
type QueryExecutor<T extends Record<string, unknown>> = (
  keyCondition: Condition,
  options: QueryOptions,
) => Promise<{ items: T[]; lastEvaluatedKey?: Record<string, unknown> }>;

/**
 * Builder for creating DynamoDB query operations.
 *
 * The builder supports:
 * - Type-safe GSI selection
 * - Complex filter conditions
 * - Automatic pagination handling
 * - Consistent reads
 * - Forward and reverse sorting
 *
 * @example
 * ```typescript
 * // Simple query
 * const result = await new QueryBuilder(executor, eq('userId', '123'))
 *   .execute();
 *
 * // Complex query with GSI and filtering
 * const result = await new QueryBuilder(executor, eq('status', 'ACTIVE'))
 *   .useIndex('status-index')
 *   .filter(op => op.beginsWith('name', 'John'))
 *   .select(['id', 'name', 'email'])
 *   .sortDescending()
 *   .limit(10)
 *   .execute();
 *
 * // Query with pagination
 * const paginator = new QueryBuilder(executor, eq('type', 'order'))
 *   .paginate(25);
 *
 * while (paginator.hasNextPage()) {
 *   const page = await paginator.getNextPage();
 *   // Process page.items
 * }
 * ```
 *
 * @typeParam T - The type of items being queried
 * @typeParam TConfig - The table configuration type for type-safe GSI selection
 */
export class QueryBuilder<T extends Record<string, unknown>, TConfig extends TableConfig = TableConfig>
  extends FilterBuilder<T, TConfig>
  implements QueryBuilderInterface<T, TConfig>
{
  private readonly keyCondition: Condition;
  protected override options: QueryOptions = {};
  protected readonly executor: QueryExecutor<T>;

  constructor(executor: QueryExecutor<T>, keyCondition: Condition) {
    super();
    this.executor = executor;
    this.keyCondition = keyCondition;
  }

  /**
   * Sets the maximum number of items to return from the query.
   *
   * Note: This is the default behavior if no sort order is specified.
   *
   * @example
   * ```typescript
   * // Get orders in chronological order
   * const result = await new QueryBuilder(executor, eq('userId', '123'))
   *   .sortAscending()
   *   .execute();
   *
   * // Get events from oldest to newest
   * const result = await new QueryBuilder(executor, eq('entityId', 'order-123'))
   *   .useIndex('entity-timestamp-index')
   *   .sortAscending()
   *   .execute();
   * ```
   *
   * @returns The builder instance for method chaining
   */
  /**
   * Sets the query to return items in ascending order by sort key.
   *
   * @example
   * ```typescript
   * // List dinosaurs by age
   * const result = await new QueryBuilder(executor, eq('species', 'Velociraptor'))
   *   .useIndex('age-index')
   *   .sortAscending()
   *   .execute();
   *
   * // View incidents chronologically
   * const result = await new QueryBuilder(executor, eq('type', 'SECURITY_BREACH'))
   *   .useIndex('date-index')
   *   .sortAscending()
   *   .execute();
   * ```
   *
   * @returns The builder instance for method chaining
   */
  sortAscending(): this {
    this.options.scanIndexForward = true;
    return this;
  }

  /**
   * Sets the query to return items in descending order by sort key.
   *
   * @example
   * ```typescript
   * // Get most recent security incidents
   * const result = await new QueryBuilder(executor, eq('type', 'SECURITY_BREACH'))
   *   .useIndex('date-index')
   *   .sortDescending()
   *   .limit(10)
   *   .execute();
   *
   * // Check latest dinosaur activities
   * const result = await new QueryBuilder(executor, eq('species', 'Velociraptor'))
   *   .useIndex('activity-time-index')
   *   .filter(op => op.eq('status', 'ACTIVE'))
   *   .sortDescending()
   *   .execute();
   * ```
   *
   * @returns The builder instance for method chaining
   */
  sortDescending(): this {
    this.options.scanIndexForward = false;
    return this;
  }

  /**
   * Creates a deep clone of this QueryBuilder instance.
   *
   * This is particularly useful when:
   * - Implementing pagination (used internally by paginate())
   * - Creating query templates
   * - Running multiple variations of a query
   *
   * @example
   * ```typescript
   * // Create base dinosaur query
   * const baseQuery = new QueryBuilder(executor, eq('species', 'Velociraptor'))
   *   .useIndex('status-index')
   *   .select(['id', 'status', 'location']);
   *
   * // Check active dinosaurs
   * const activeRaptors = baseQuery.clone()
   *   .filter(op => op.eq('status', 'HUNTING'))
   *   .execute();
   *
   * // Check contained dinosaurs
   * const containedRaptors = baseQuery.clone()
   *   .filter(op => op.eq('status', 'CONTAINED'))
   *   .execute();
   *
   * // Check sedated dinosaurs
   * const sedatedRaptors = baseQuery.clone()
   *   .filter(op => op.eq('status', 'SEDATED'))
   *   .execute();
   * ```
   *
   * @returns A new QueryBuilder instance with the same configuration
   */
  clone(): QueryBuilder<T, TConfig> {
    const clone = new QueryBuilder<T, TConfig>(this.executor, this.keyCondition);
    clone.options = { ...this.options };
    clone.selectedFields = new Set(this.selectedFields);
    return clone;
  }

  /**
   * Executes the query against DynamoDB.
   *
   * The method returns both the matched items and, if there are more results,
   * a lastEvaluatedKey that can be used with startFrom() to continue the query.
   *
   * @example
   * ```typescript
   * try {
   *   // Find active carnivores in specific habitat
   *   const result = await new QueryBuilder(executor, eq('habitatId', 'PADDOCK-A'))
   *     .useIndex('species-status-index')
   *     .filter(op =>
   *       op.and([
   *         op.eq('diet', 'CARNIVORE'),
   *         op.eq('status', 'ACTIVE'),
   *         op.gt('aggressionLevel', 7)
   *       ])
   *     )
   *     .sortDescending()
   *     .limit(5)
   *     .execute();
   *
   *   console.log(`Found ${result.items.length} dangerous dinosaurs`);
   *
   *   if (result.lastEvaluatedKey) {
   *     console.log('Additional threats detected');
   *   }
   * } catch (error) {
   *   console.error('Security scan failed:', error);
   * }
   * ```
   *
   * @returns A promise that resolves to an object containing:
   *          - items: Array of items matching the query
   *          - lastEvaluatedKey: Token for continuing the query, if more items exist
   */
  async execute(): Promise<{ items: T[]; lastEvaluatedKey?: Record<string, unknown> }> {
    return this.executor(this.keyCondition, this.options);
  }
}
