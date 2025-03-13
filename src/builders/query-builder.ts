import {
  eq,
  ne,
  lt,
  lte,
  gt,
  gte,
  between,
  beginsWith,
  contains,
  attributeExists,
  attributeNotExists,
  and,
  or,
  not,
  type Condition,
  type ConditionOperator,
} from "../conditions";
import { Paginator } from "./paginator";
import type { GSINames, TableConfig } from "../types";
import type { QueryBuilderInterface } from "./builder-types";

/**
 * Configuration options for DynamoDB query operations.
 */
export interface QueryOptions {
  /** Condition for the sort key in the table or index */
  sortKeyCondition?: Condition;
  /** Additional filter conditions applied after the key condition */
  filter?: Condition;
  /** Maximum number of items to return */
  limit?: number;
  /** Name of the Global Secondary Index to query */
  indexName?: string;
  /** Whether to use strongly consistent reads */
  consistentRead?: boolean;
  /** Direction of sort key traversal (true for ascending, false for descending) */
  scanIndexForward?: boolean;
  /** List of attributes to return in the result */
  projection?: string[];
  /** Number of items to fetch per page when using pagination */
  paginationSize?: number;
  /** Token for starting the query from a specific point */
  lastEvaluatedKey?: Record<string, unknown>;
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
 * - Complex filtering conditions
 * - Sorting and pagination
 * - Global Secondary Indexes
 * - Attribute projection
 *
 * @example
 * ```ts
 * // Find active carnivores
 * const result = await new QueryBuilder(executor, eq('species', 'Tyrannosaurus'))
 *   .filter(op => op.eq('status', 'ACTIVE'))
 *   .execute();
 *
 * // Search habitats by security level
 * const result = await new QueryBuilder(executor, eq('type', 'CARNIVORE'))
 *   .useIndex('security-level-index')
 *   .filter(op => op.gt('securityLevel', 8))
 *   .select(['id', 'capacity', 'currentOccupants'])
 *   .sortDescending()
 *   .execute();
 *
 * // List recent incidents
 * const result = await new QueryBuilder(executor, eq('type', 'INCIDENT'))
 *   .useIndex('date-index')
 *   .filter(op => op.gt('severityLevel', 5))
 *   .paginate(10);
 * ```
 *
 * @typeParam T - The type of items being queried
 * @typeParam TConfig - The table configuration type for type-safe GSI selection
 */
export class QueryBuilder<T extends Record<string, unknown>, TConfig extends TableConfig = TableConfig>
  implements QueryBuilderInterface<T, TConfig>
{
  private readonly keyCondition: Condition;
  private options: QueryOptions = {};
  private selectedFields: Set<string> = new Set();

  private readonly executor: QueryExecutor<T>;

  constructor(executor: QueryExecutor<T>, keyCondition: Condition) {
    this.executor = executor;
    this.keyCondition = keyCondition;
  }

  /**
   * Sets the maximum number of items to return from the query.
   *
   * Note: This limit applies to the items that match the key condition
   * before any filter expressions are applied.
   *
   * @example
   * ```ts
   * // Get first 10 orders for a user
   * const result = await new QueryBuilder(executor, eq('userId', '123'))
   *   .limit(10)
   *   .execute();
   * ```
   *
   * @param limit - Maximum number of items to return
   * @returns The builder instance for method chaining
   */
  limit(limit: number): QueryBuilder<T> {
    this.options.limit = limit;
    return this;
  }

  /**
   * Gets the current limit set on the query.
   * This is used internally by the paginator to manage result sets.
   *
   * @returns The current limit or undefined if no limit is set
   */
  getLimit(): number | undefined {
    return this.options.limit;
  }

  /**
   * Specifies a Global Secondary Index (GSI) to use for the query.
   *
   * @example
   * ```ts
   * // Find all dinosaurs of a specific species
   * builder
   *   .useIndex('species-status-index')
   *   .filter(op => op.eq('status', 'ACTIVE'));
   *
   * // Search high-security habitats
   * builder
   *   .useIndex('security-level-index')
   *   .filter(op =>
   *     op.and([
   *       op.gt('securityLevel', 8),
   *       op.eq('status', 'OPERATIONAL')
   *     ])
   *   );
   * ```
   *
   * @param indexName - The name of the GSI to use (type-safe based on table configuration)
   * @returns The builder instance for method chaining
   */
  useIndex<I extends GSINames<TConfig>>(indexName: I): QueryBuilder<T, TConfig> {
    this.options.indexName = indexName as string;
    return this;
  }

  /**
   * Sets whether to use strongly consistent reads for the query.
   * Note:
   * - Consistent reads are not available on GSIs
   * - Consistent reads consume twice the throughput
   * - Default is eventually consistent reads
   *
   * @example
   * ```ts
   * // Check immediate dinosaur status
   * const result = await new QueryBuilder(executor, eq('species', 'Velociraptor'))
   *   .filter(op => op.eq('status', 'ACTIVE'))
   *   .consistentRead()
   *   .execute();
   *
   * // Monitor security breaches
   * const result = await new QueryBuilder(executor, eq('type', 'SECURITY_ALERT'))
   *   .useIndex('primary-index')
   *   .consistentRead(isEmergencyMode)
   *   .execute();
   * ```
   *
   * @param consistentRead - Whether to use consistent reads (defaults to true)
   * @returns The builder instance for method chaining
   */
  consistentRead(consistentRead = true): QueryBuilder<T> {
    this.options.consistentRead = consistentRead;
    return this;
  }

  /**
   * Adds a filter expression to refine the query results.
   *
   * @example
   * ```ts
   * // Find aggressive carnivores
   * builder.filter(op =>
   *   op.and([
   *     op.eq('diet', 'CARNIVORE'),
   *     op.gt('aggressionLevel', 7),
   *     op.eq('status', 'ACTIVE')
   *   ])
   * );
   *
   * // Search suitable breeding habitats
   * builder.filter(op =>
   *   op.and([
   *     op.between('temperature', 25, 30),
   *     op.lt('currentOccupants', 3),
   *     op.eq('quarantineStatus', 'CLEAR')
   *   ])
   * );
   * ```
   *
   * @param condition - Either a Condition object or a callback function that builds the condition
   * @returns The builder instance for method chaining
   */
  filter(condition: Condition | ((op: ConditionOperator<T>) => Condition)): QueryBuilder<T> {
    if (typeof condition === "function") {
      const conditionOperator: ConditionOperator<T> = {
        eq,
        ne,
        lt,
        lte,
        gt,
        gte,
        between,
        beginsWith,
        contains,
        attributeExists,
        attributeNotExists,
        and,
        or,
        not,
      };
      this.options.filter = condition(conditionOperator);
    } else {
      this.options.filter = condition;
    }
    return this;
  }

  /**
   * Specifies which attributes to return in the query results.
   *
   * @example
   * ```ts
   * // Get basic dinosaur info
   * builder.select([
   *   'species',
   *   'status',
   *   'stats.health',
   *   'stats.aggressionLevel'
   * ]);
   *
   * // Monitor habitat conditions
   * builder
   *   .select('securityStatus')
   *   .select([
   *     'currentOccupants',
   *     'temperature',
   *     'lastInspectionDate'
   *   ]);
   * ```
   *
   * @param fields - A single field name or an array of field names to return
   * @returns The builder instance for method chaining
   */
  select(fields: string | string[]): QueryBuilder<T> {
    if (typeof fields === "string") {
      this.selectedFields.add(fields);
    } else if (Array.isArray(fields)) {
      for (const field of fields) {
        this.selectedFields.add(field);
      }
    }

    this.options.projection = Array.from(this.selectedFields);
    return this;
  }

  /**
   * Sets the query to return items in ascending order by sort key.
   *
   * @example
   * ```ts
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
  sortAscending(): QueryBuilder<T> {
    this.options.scanIndexForward = true;
    return this;
  }

  /**
   * Sets the query to return items in descending order by sort key.
   *
   * @example
   * ```ts
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
  sortDescending(): QueryBuilder<T> {
    this.options.scanIndexForward = false;
    return this;
  }

  /**
   * Creates a paginator that handles DynamoDB pagination automatically.
   *
   * The paginator handles:
   * - Tracking the last evaluated key
   * - Managing page boundaries
   * - Respecting overall query limits
   *
   * @example
   * ```ts
   * // List dinosaurs by species
   * const paginator = new QueryBuilder(executor, eq('species', 'Velociraptor'))
   *   .filter(op => op.eq('status', 'ACTIVE'))
   *   .useIndex('species-index')
   *   .paginate(10);
   *
   * // Process pages of security incidents
   * const paginator = new QueryBuilder(executor, eq('type', 'SECURITY_BREACH'))
   *   .filter(op => op.gt('severityLevel', 7))
   *   .sortDescending()
   *   .paginate(25);
   *
   * while (paginator.hasNextPage()) {
   *   const page = await paginator.getNextPage();
   *   console.log(`Processing incidents page ${page.page}, count: ${page.items.length}`);
   *   // Handle security incidents
   * }
   * ```
   *
   * @param pageSize - The number of items to return per page
   * @returns A Paginator instance that manages the pagination state
   * @see Paginator for more pagination control options
   */
  paginate(pageSize: number): Paginator<T, TConfig> {
    return new Paginator<T, TConfig>(this, pageSize);
  }

  /**
   * Sets the starting point for the query using a previous lastEvaluatedKey.
   *
   * Note: This method is typically used for manual pagination.
   * For automatic pagination, use the paginate() method instead.
   *
   * @example
   * ```ts
   * // First batch of dinosaurs
   * const result1 = await new QueryBuilder(executor, eq('species', 'Velociraptor'))
   *   .filter(op => op.eq('status', 'ACTIVE'))
   *   .limit(5)
   *   .execute();
   *
   * if (result1.lastEvaluatedKey) {
   *   // Continue listing dinosaurs
   *   const result2 = await new QueryBuilder(executor, eq('species', 'Velociraptor'))
   *     .filter(op => op.eq('status', 'ACTIVE'))
   *     .startFrom(result1.lastEvaluatedKey)
   *     .limit(5)
   *     .execute();
   *
   *   console.log('Additional dinosaurs:', result2.items);
   * }
   * ```
   *
   * @param lastEvaluatedKey - The exclusive start key from a previous query result
   * @returns The builder instance for method chaining
   */
  startFrom(lastEvaluatedKey: Record<string, unknown>): QueryBuilder<T> {
    this.options.lastEvaluatedKey = lastEvaluatedKey;
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
   * ```ts
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
   * ```ts
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
