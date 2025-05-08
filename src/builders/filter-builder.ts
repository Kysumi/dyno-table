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
import type { DynamoItem, GSINames, TableConfig } from "../types";
import type { FilterBuilderInterface } from "./builder-types";

/**
 * Configuration options for DynamoDB filter operations.
 * These are common options shared between query and scan operations.
 */
export interface FilterOptions {
  /** Filter conditions applied to results */
  filter?: Condition;
  /** Maximum number of items to return */
  limit?: number;
  /** Name of the Global Secondary Index to use */
  indexName?: string;
  /** Whether to use strongly consistent reads */
  consistentRead?: boolean;
  /** List of attributes to return in the result */
  projection?: string[];
  /** Token for starting the operation from a specific point */
  lastEvaluatedKey?: DynamoItem;
}

/**
 * Abstract base builder for creating DynamoDB filter operations.
 * This class provides common functionality for both Query and Scan operations.
 *
 * The builder supports:
 * - Type-safe GSI selection
 * - Complex filter conditions
 * - Pagination
 * - Consistent reads
 * - Attribute projection
 *
 * @typeParam T - The type of items being filtered
 * @typeParam TConfig - The table configuration type for type-safe GSI selection
 */
export abstract class FilterBuilder<T extends DynamoItem, TConfig extends TableConfig = TableConfig>
  implements FilterBuilderInterface<T, TConfig>
{
  protected options: FilterOptions = {};
  protected selectedFields: Set<string> = new Set();

  /**
   * Sets the maximum number of items to return.
   * Use this method when you need to:
   * - Limit the number of dinosaurs returned
   * - Control the size of habitat reports
   * - Implement manual pagination of security logs
   *
   * Note: This limit applies to the items that match the key condition
   * before any filter expressions are applied.
   *
   * @example
   * ```typescript
   * // Get first 10 dinosaurs
   * const result = await builder
   *   .limit(10)
   *   .execute();
   * ```
   *
   * @param limit - Maximum number of items to return
   * @returns The builder instance for method chaining
   */
  limit(limit: number): this {
    this.options.limit = limit;
    return this;
  }

  /**
   * Gets the current limit set on the operation.
   * This is used internally by the paginator to manage result sets.
   *
   * @returns The current limit or undefined if no limit is set
   */
  getLimit(): number | undefined {
    return this.options.limit;
  }

  /**
   * Specifies a Global Secondary Index (GSI) to use for the operation.
   * Use this method when you need to:
   * - Find dinosaurs by species or status
   * - Search habitats by security level
   * - Find incidents by date
   * - List feeding schedules by time
   *
   * @example
   * ```typescript
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
  useIndex<I extends GSINames<TConfig>>(indexName: I): this {
    this.options.indexName = indexName as string;
    return this;
  }

  /**
   * Sets whether to use strongly consistent reads for the operation.
   * Use this method when you need to:
   * - Get real-time dinosaur status updates
   * - Monitor critical security systems
   * - Track immediate habitat changes
   * - Verify containment protocols
   *
   * Note:
   * - Consistent reads are not available on GSIs
   * - Consistent reads consume twice the throughput
   * - Default is eventually consistent reads
   *
   * @example
   * ```typescript
   * // Check immediate dinosaur status
   * const result = await builder
   *   .filter(op => op.eq('status', 'ACTIVE'))
   *   .consistentRead()
   *   .execute();
   *
   * // Monitor security breaches
   * const result = await builder
   *   .useIndex('primary-index')
   *   .consistentRead(isEmergencyMode)
   *   .execute();
   * ```
   *
   * @param consistentRead - Whether to use consistent reads (defaults to true)
   * @returns The builder instance for method chaining
   */
  consistentRead(consistentRead = true): this {
    this.options.consistentRead = consistentRead;
    return this;
  }

  /**
   * Adds a filter expression to refine the operation results.
   * Use this method when you need to:
   * - Filter dinosaurs by behavior patterns
   * - Find habitats with specific conditions
   * - Search for security incidents
   * - Monitor feeding patterns
   *
   * @example
   * ```typescript
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
  filter(condition: Condition | ((op: ConditionOperator<T>) => Condition)): this {
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
   * Specifies which attributes to return in the results.
   * Use this method when you need to:
   * - Get specific dinosaur attributes
   * - Retrieve habitat statistics
   * - Monitor security metrics
   * - Optimize response size
   *
   * @example
   * ```typescript
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
  select(fields: string | string[]): this {
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
   * Creates a paginator that handles DynamoDB pagination automatically.
   * The paginator handles:
   * - Tracking the last evaluated key
   * - Managing page boundaries
   * - Respecting overall query limits
   *
   * @example
   * ```typescript
   * // Create a paginator for dinosaur records
   * const paginator = builder
   *   .filter(op => op.eq('status', 'ACTIVE'))
   *   .paginate(10);
   *
   * // Process pages of dinosaur results
   * while (paginator.hasNextPage()) {
   *   const page = await paginator.getNextPage();
   *   console.log(`Processing page ${page.page}, count: ${page.items.length}`);
   *   // Process dinosaur data
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
   * Sets the starting point using a previous lastEvaluatedKey.
   * Use this method when you need to:
   * - Implement manual dinosaur list pagination
   * - Resume habitat inspection reviews
   * - Continue security incident analysis
   * - Store operation position between sessions
   *
   * Note: This method is typically used for manual pagination.
   * For automatic pagination, use the paginate() method instead.
   *
   * @example
   * ```typescript
   * // First batch of dinosaurs
   * const result1 = await builder
   *   .filter(op => op.eq('status', 'ACTIVE'))
   *   .limit(5)
   *   .execute();
   *
   * if (result1.lastEvaluatedKey) {
   *   // Continue listing dinosaurs
   *   const result2 = await builder
   *     .filter(op => op.eq('status', 'ACTIVE'))
   *     .startFrom(result1.lastEvaluatedKey)
   *     .limit(5)
   *     .execute();
   *
   *   console.log('Additional dinosaurs:', result2.items);
   * }
   * ```
   *
   * @param lastEvaluatedKey - The exclusive start key from a previous result
   * @returns The builder instance for method chaining
   */
  startFrom(lastEvaluatedKey: DynamoItem): this {
    this.options.lastEvaluatedKey = lastEvaluatedKey;
    return this;
  }

  /**
   * Creates a deep clone of this builder instance.
   * Use this method when you need to:
   * - Query different dinosaur statuses
   * - Check multiple habitat conditions
   * - Monitor various security levels
   * - Create report templates
   *
   * This is particularly useful when:
   * - Implementing pagination (used internally by paginate())
   * - Creating operation templates
   * - Running multiple variations of an operation
   *
   * @example
   * ```typescript
   * // Create base dinosaur query
   * const baseBuilder = builder
   *   .useIndex('status-index')
   *   .select(['id', 'status', 'location']);
   *
   * // Check active dinosaurs
   * const activeRaptors = baseBuilder.clone()
   *   .filter(op => op.eq('status', 'HUNTING'))
   *   .execute();
   *
   * // Check contained dinosaurs
   * const containedRaptors = baseBuilder.clone()
   *   .filter(op => op.eq('status', 'CONTAINED'))
   *   .execute();
   * ```
   *
   * @returns A new builder instance with the same configuration
   */
  abstract clone(): FilterBuilderInterface<T, TConfig>;

  /**
   * Executes the operation against DynamoDB.
   * This method must be implemented by subclasses to handle
   * their specific execution logic.
   */
  abstract execute(): Promise<{ items: T[]; lastEvaluatedKey?: DynamoItem }>;
}
