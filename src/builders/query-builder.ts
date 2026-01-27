import type { Condition } from "../conditions";
import type { DynamoItem, TableConfig } from "../types";
import type { QueryBuilderInterface } from "./builder-types";
import { FilterBuilder, type FilterOptions } from "./filter-builder";
import { ResultIterator } from "./result-iterator";
import type { Path } from "./types";

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
type QueryExecutor<T extends DynamoItem> = (
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
export class QueryBuilder<T extends DynamoItem, TConfig extends TableConfig = TableConfig>
  extends FilterBuilder<T, TConfig>
  implements QueryBuilderInterface<T, TConfig>
{
  private readonly keyCondition: Condition;
  protected override options: QueryOptions = {};
  protected readonly executor: QueryExecutor<T>;
  private includeIndexAttributes = false;
  private readonly indexAttributeNames: string[];

  constructor(executor: QueryExecutor<T>, keyCondition: Condition, indexAttributeNames: string[] = []) {
    super();
    this.executor = executor;
    this.keyCondition = keyCondition;
    this.indexAttributeNames = indexAttributeNames;
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
   * Ensures index attributes are included in the result.
   * By default, index attributes are removed from query responses.
   */
  includeIndexes(): this {
    this.includeIndexAttributes = true;
    if (this.selectedFields.size > 0) {
      this.addIndexAttributesToSelection();
    }
    return this;
  }

  override select<K extends Path<T>>(fields: K | K[]): this {
    super.select(fields);
    if (this.includeIndexAttributes) {
      this.addIndexAttributesToSelection();
    }
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
    const clone = new QueryBuilder<T, TConfig>(this.executor, this.keyCondition, this.indexAttributeNames);
    clone.options = {
      ...this.options,
      filter: this.deepCloneFilter(this.options.filter),
    };
    clone.selectedFields = new Set(this.selectedFields);
    clone.includeIndexAttributes = this.includeIndexAttributes;
    return clone;
  }

  private deepCloneFilter(filter: Condition | undefined): Condition | undefined {
    if (!filter) return filter;
    if (filter.type === "and" || filter.type === "or") {
      return {
        ...filter,
        conditions: filter.conditions
          ?.map((condition) => this.deepCloneFilter(condition))
          .filter((c): c is Condition => c !== undefined),
      };
    }
    return { ...filter };
  }

  /**
   * Executes the query against DynamoDB and returns a generator that behaves like an array.
   *
   * The generator automatically handles pagination and provides array-like methods
   * for processing results efficiently without loading everything into memory at once.
   *
   * @example
   * ```typescript
   * try {
   *   // Find active carnivores with automatic pagination
   *   const results = await new QueryBuilder(executor, eq('habitatId', 'PADDOCK-A'))
   *     .useIndex('species-status-index')
   *     .filter(op =>
   *       op.and([
   *         op.eq('diet', 'CARNIVORE'),
   *         op.eq('status', 'ACTIVE'),
   *         op.gt('aggressionLevel', 7)
   *       ])
   *     )
   *     .sortDescending()
   *     .execute();
   *
   *   // Use like an array with automatic pagination
   *   for await (const dinosaur of results) {
   *     console.log(`Processing ${dinosaur.name}`);
   *   }
   *
   *   // Or convert to array and use array methods
   *   const allItems = await results.toArray();
   *   const dangerousOnes = allItems.filter(dino => dino.aggressionLevel > 9);
   *   const totalCount = allItems.length;
   * } catch (error) {
   *   console.error('Security scan failed:', error);
   * }
   * ```
   *
   * @returns A promise that resolves to a ResultGenerator that behaves like an array
   */
  async execute(): Promise<ResultIterator<T, TConfig>> {
    const directExecutor = async () => {
      const result = await this.executor(this.keyCondition, this.options);
      if (this.includeIndexAttributes || this.indexAttributeNames.length === 0) {
        return result;
      }

      return {
        ...result,
        items: result.items.map((item) => this.omitIndexAttributes(item)),
      };
    };
    return new ResultIterator(this, directExecutor);
  }

  private addIndexAttributesToSelection(): void {
    if (this.indexAttributeNames.length === 0) return;

    for (const attributeName of this.indexAttributeNames) {
      this.selectedFields.add(attributeName);
    }

    this.options.projection = Array.from(this.selectedFields);
  }

  private omitIndexAttributes(item: T): T {
    if (this.indexAttributeNames.length === 0) {
      return item;
    }

    let didOmit = false;
    const cleaned = { ...item } as T;

    for (const attributeName of this.indexAttributeNames) {
      if (attributeName in cleaned) {
        delete (cleaned as Record<string, unknown>)[attributeName];
        didOmit = true;
      }
    }

    return didOmit ? cleaned : item;
  }
}
