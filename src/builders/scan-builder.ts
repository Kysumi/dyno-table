import { FilterBuilder, type FilterOptions } from "./filter-builder";
import type { DynamoItem, TableConfig } from "../types";
import type { ScanBuilderInterface } from "./builder-types";
import { IterableQueryResult } from "./iterable-query-result";

/**
 * Configuration options for DynamoDB scan operations.
 * Extends the base FilterOptions.
 */
export type ScanOptions = FilterOptions;

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
  protected readonly executor: ScanExecutor<T>;

  constructor(executor: ScanExecutor<T>) {
    super();
    this.executor = executor;
  }

  /**
   * Creates a deep clone of this ScanBuilder instance.
   * Use this method when you need to:
   * - Create scan templates
   * - Run multiple variations of a scan
   * - Implement pagination (used internally by paginate())
   *
   * @returns A new ScanBuilder instance with the same configuration
   */
  clone(): ScanBuilder<T, TConfig> {
    const clone = new ScanBuilder<T, TConfig>(this.executor);
    clone.options = { ...this.options };
    clone.selectedFields = new Set(this.selectedFields);
    return clone;
  }

  /**
   * Executes the scan against DynamoDB.
   * Use this method when you need to:
   * - Search across the entire table
   * - Find items matching specific criteria
   * - Perform full table analysis
   * - Generate reports across all data
   *
   * The method returns an iterable result that lazily loads additional pages
   * as you iterate through the results.
   *
   * @example
   * ```typescript
   * try {
   *   // Find all dinosaurs with high aggression levels
   *   const result = await new ScanBuilder(executor)
   *     .filter(op =>
   *       op.and([
   *         op.eq('status', 'ACTIVE'),
   *         op.gt('aggressionLevel', 7)
   *       ])
   *     )
   *     .limit(20)
   *     .execute();
   *
   *   // Iterate through all results (pages are loaded on demand)
   *   for await (const dinosaur of result) {
   *     console.log(`Processing ${dinosaur.id}`);
   *   }
   *
   *   // Or convert to an array (loads all pages)
   *   const allDinosaurs = await result.toArray();
   *   console.log(`Found ${allDinosaurs.length} potentially dangerous dinosaurs`);
   * } catch (error) {
   *   console.error('Security scan failed:', error);
   * }
   * ```
   *
   * @returns A promise that resolves to an IterableQueryResult that lazily loads pages
   */
  async execute(): Promise<IterableQueryResult<T, TConfig>> {
    const result = await this.executeRaw();
    return new IterableQueryResult<T, TConfig>(result.items, result.lastEvaluatedKey, this);
  }

  /**
   * Executes the scan against DynamoDB and returns the raw result.
   * 
   * This method is primarily for internal use. Most applications should use execute() instead.
   *
   * @returns A promise that resolves to an object containing:
   *          - items: Array of items matching the scan criteria
   *          - lastEvaluatedKey: Token for continuing the scan, if more items exist
   */
  async executeRaw(): Promise<{ items: T[]; lastEvaluatedKey?: Record<string, unknown> }> {
    return this.executor(this.options);
  }
}
