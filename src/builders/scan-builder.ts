import type { Condition } from "../conditions.js";
import type { DynamoItem, TableConfig } from "../types.js";
import type { BuilderContext, ScanBuilderInterface } from "./builder-types.js";
import { FilterBuilder, type FilterOptions } from "./filter-builder.js";
import { ParallelScanIterator } from "./parallel-scan-iterator.js";
import { ResultIterator } from "./result-iterator.js";

const DDB_MAX_SCAN_SEGMENTS = 1_000_000;

/**
 * Configuration options for DynamoDB scan operations.
 * Extends the base FilterOptions.
 */
export interface ScanOptions extends FilterOptions {
  segment?: number;
  totalSegments?: number;
}

/**
 * Function type for executing DynamoDB filter operations.
 * @typeParam T - The type of items being filtered
 */
export type ScanExecutor<T extends DynamoItem> = (
  options: ScanOptions,
) => Promise<{ items: T[]; lastEvaluatedKey?: DynamoItem }>;

/**
 * Builder for creating DynamoDB scan operations.
 * Use this builder when you need to:
 * - Scan all items in a table
 * - Filter results based on non-key attributes
 * - Scan items on a Secondary Index (GSI)
 * - Implement pagination
 * - Project specific attributes
 *
 * The builder supports:
 * - Type-safe GSI selection
 * - Complex filter conditions
 * - Automatic pagination handling
 * - Consistent reads
 * - Attribute projection
 *
 * @example
 * ```typescript
 * // Simple scan with filtering
 * const result = await new ScanBuilder(executor)
 *   .filter(op => op.eq('status', 'ACTIVE'))
 *   .execute();
 *
 * // Scan with GSI and filtering
 * const result = await new ScanBuilder(executor)
 *   .useIndex('status-index')
 *   .filter(op => op.gt('securityLevel', 8))
 *   .select(['id', 'capacity', 'currentOccupants'])
 *   .limit(10)
 *   .execute();
 *
 * // Scan with pagination
 * const paginator = new ScanBuilder(executor)
 *   .filter(op => op.eq('type', 'INCIDENT'))
 *   .paginate(25);
 *
 * while (paginator.hasNextPage()) {
 *   const page = await paginator.getNextPage();
 *   // Process page.items
 * }
 * ```
 *
 * @typeParam T - The type of items being scanned
 * @typeParam TConfig - The table configuration type for type-safe GSI selection
 */
export class ScanBuilder<T extends DynamoItem, TConfig extends TableConfig = TableConfig>
  extends FilterBuilder<T, TConfig>
  implements ScanBuilderInterface<T, TConfig>
{
  protected override options: ScanOptions = {};
  protected readonly executor: ScanExecutor<T>;

  constructor(executor: ScanExecutor<T>, context: BuilderContext = {}) {
    super(context);
    this.executor = executor;
  }

  /**
   * Creates a deep clone of this ScanBuilder instance.
   *
   * @returns A new ScanBuilder instance with the same configuration
   */
  clone(): ScanBuilder<T, TConfig> {
    const clone = new ScanBuilder<T, TConfig>(this.executor, this.context);
    clone.options = {
      ...this.options,
      filter: this.deepCloneFilter(this.options.filter),
    };
    clone.selectedFields = new Set(this.selectedFields);
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

  /** Splits the scan across independent DynamoDB segments and merges their results. */
  segments(totalSegments: number): ParallelScanIterator<T, TConfig> {
    if (!Number.isInteger(totalSegments) || totalSegments < 1 || totalSegments > DDB_MAX_SCAN_SEGMENTS) {
      throw new Error(`segments: totalSegments must be an integer between 1 and ${DDB_MAX_SCAN_SEGMENTS}`);
    }

    const segments = Array.from({ length: totalSegments }, (_, segment) => {
      const builder = this.clone();
      builder.options.segment = segment;
      builder.options.totalSegments = totalSegments;
      return () => builder.execute();
    });

    return new ParallelScanIterator(segments, this.getLimit());
  }

  /**
   * Executes the scan against DynamoDB and returns a generator that behaves like an array.
   *
   * The generator automatically handles pagination and provides array-like methods
   * for processing results efficiently without loading everything into memory at once.
   *
   * @example
   * ```typescript
   * try {
   *   // Find all dinosaurs with high aggression levels with automatic pagination
   *   const results = await new ScanBuilder(executor)
   *     .filter(op =>
   *       op.and([
   *         op.eq('status', 'ACTIVE'),
   *         op.gt('aggressionLevel', 7)
   *       ])
   *     )
   *     .execute();
   *
   *   // Use like an array with automatic pagination
   *   for await (const dinosaur of results) {
   *     console.log(`Processing dangerous dinosaur: ${dinosaur.name}`);
   *   }
   *
   *   // Or convert to array and use array methods
   *   const allItems = await results.toArray();
   *   const criticalThreats = allItems.filter(dino => dino.aggressionLevel > 9);
   *   const totalCount = allItems.length;
   * } catch (error) {
   *   console.error('Security scan failed:', error);
   * }
   * ```
   *
   * @returns A promise that resolves to a ResultGenerator that behaves like an array
   */
  async execute(): Promise<ResultIterator<T, TConfig>> {
    await this.runBeforeExecute();
    const directExecutor = () => this.executor(this.options);
    return new ResultIterator(this, directExecutor);
  }
}
