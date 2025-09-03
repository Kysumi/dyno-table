import type { DynamoItem } from "../types";
import type { BatchBuilder } from "./batch-builder";
import type { PutBuilder } from "./put-builder";
import type { GetBuilder } from "./get-builder";
import type { DeleteBuilder } from "./delete-builder";
import type { UpdateBuilder } from "./update-builder";
import type { Path, PathType } from "./types";
import type { Condition, ConditionOperator } from "../conditions";
import type { TransactionBuilder } from "./transaction-builder";
import type { UpdateCommandParams } from "./builder-types";
import type { Table } from "../table";
import type { IndexDefinition } from "../entity/entity";

type SetElementType<T> = T extends Set<infer U> ? U : T extends Array<infer U> ? U : never;
type PathSetElementType<T, K extends Path<T>> = SetElementType<PathType<T, K>>;

/**
 * Creates an entity-aware wrapper that automatically provides entity names to batch operations
 * while transparently delegating all other method calls to the underlying builder.
 */
function createEntityAwareBuilder<T extends object>(
  builder: T,
  entityName: string,
): T & { readonly entityName: string } {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      // Expose the entity name as a readonly property
      if (prop === "entityName") {
        return entityName;
      }

      // Intercept withBatch method to provide automatic entity type inference
      if (prop === "withBatch" && typeof (target as Record<string, unknown>)[prop] === "function") {
        return <
          TEntities extends Record<string, DynamoItem> = Record<string, DynamoItem>,
          K extends keyof TEntities = keyof TEntities,
        >(
          batch: BatchBuilder<TEntities>,
          entityType?: K,
        ) => {
          // Use provided entityType or fall back to stored entityName
          const typeToUse = entityType ?? (entityName as K);
          const fn = (target as Record<string, unknown>)[prop] as (
            batch: BatchBuilder<TEntities>,
            entityType?: K,
          ) => unknown;
          // Call the function with the original target as 'this' context
          return fn.call(target, batch, typeToUse);
        };
      }

      // For all other properties/methods, delegate to the original builder
      return Reflect.get(target, prop, receiver);
    },
  }) as T & { readonly entityName: string };
}

/**
 * Entity-aware wrapper for PutBuilder that automatically provides entity name to batch operations
 */
export type EntityAwarePutBuilder<T extends DynamoItem> = PutBuilder<T> & {
  readonly entityName: string;
};

/**
 * Creates an entity-aware PutBuilder
 */
export function createEntityAwarePutBuilder<T extends DynamoItem>(
  builder: PutBuilder<T>,
  entityName: string,
): EntityAwarePutBuilder<T> {
  return createEntityAwareBuilder(builder, entityName);
}

/**
 * Entity-aware wrapper for GetBuilder that automatically provides entity name to batch operations
 */
export type EntityAwareGetBuilder<T extends DynamoItem> = GetBuilder<T> & {
  readonly entityName: string;
};

/**
 * Creates an entity-aware GetBuilder
 */
export function createEntityAwareGetBuilder<T extends DynamoItem>(
  builder: GetBuilder<T>,
  entityName: string,
): EntityAwareGetBuilder<T> {
  return createEntityAwareBuilder(builder, entityName);
}

/**
 * Entity-aware wrapper for DeleteBuilder that automatically provides entity name to batch operations
 */
export type EntityAwareDeleteBuilder = DeleteBuilder & {
  readonly entityName: string;
};

/**
 * Creates an entity-aware DeleteBuilder
 */
export function createEntityAwareDeleteBuilder(builder: DeleteBuilder, entityName: string): EntityAwareDeleteBuilder {
  return createEntityAwareBuilder(builder, entityName);
}

/**
 * Entity-aware wrapper for UpdateBuilder that adds forceIndexRebuild functionality
 * and automatically provides entity name to batch operations
 */
export class EntityAwareUpdateBuilder<T extends DynamoItem> {
  private forceRebuildIndexes: string[] = [];
  public readonly entityName: string;
  private builder: UpdateBuilder<T>;
  private entityConfig?: {
    data: Partial<T>;
    key: T;
    table: Table;
    indexes: Record<string, IndexDefinition<T>> | undefined;
    generateTimestamps: () => Record<string, string | number>;
    buildIndexUpdates: (
      currentData: T,
      updates: Partial<T>,
      table: Table,
      indexes: Record<string, IndexDefinition<T>> | undefined,
      forceRebuildIndexes?: string[],
    ) => Record<string, string>;
  };
  private updateDataApplied = false;

  constructor(builder: UpdateBuilder<T>, entityName: string) {
    this.builder = builder;
    this.entityName = entityName;
  }

  /**
   * Configure entity-specific logic for automatic timestamp generation and index updates
   */
  configureEntityLogic(config: {
    data: Partial<T>;
    key: T;
    table: Table;
    indexes: Record<string, IndexDefinition<T>> | undefined;
    generateTimestamps: () => Record<string, string | number>;
    buildIndexUpdates: (
      currentData: T,
      updates: Partial<T>,
      table: Table,
      indexes: Record<string, IndexDefinition<T>> | undefined,
      forceRebuildIndexes?: string[],
    ) => Record<string, string>;
  }): void {
    this.entityConfig = config;
  }

  /**
   * Forces a rebuild of one or more readonly indexes during the update operation.
   *
   * By default, readonly indexes are not updated during entity updates to prevent
   * errors when required index attributes are missing. This method allows you to
   * override that behavior and force specific indexes to be rebuilt.
   *
   * @example
   * ```typescript
   * // Force rebuild a single readonly index
   * const result = await repo.update({ id: 'TREX-001' }, { status: 'ACTIVE' })
   *   .forceIndexRebuild('gsi1')
   *   .execute();
   *
   * // Force rebuild multiple readonly indexes
   * const result = await repo.update({ id: 'TREX-001' }, { status: 'ACTIVE' })
   *   .forceIndexRebuild(['gsi1', 'gsi2'])
   *   .execute();
   *
   * // Chain with other update operations
   * const result = await repo.update({ id: 'TREX-001' }, { status: 'ACTIVE' })
   *   .set('lastUpdated', new Date().toISOString())
   *   .forceIndexRebuild('gsi1')
   *   .condition(op => op.eq('status', 'INACTIVE'))
   *   .execute();
   * ```
   *
   * @param indexes - A single index name or array of index names to force rebuild
   * @returns The builder instance for method chaining
   */
  forceIndexRebuild(indexes: string | string[]): this {
    if (Array.isArray(indexes)) {
      this.forceRebuildIndexes = [...this.forceRebuildIndexes, ...indexes];
    } else {
      this.forceRebuildIndexes.push(indexes);
    }
    return this;
  }

  /**
   * Gets the list of indexes that should be force rebuilt.
   * This is used internally by entity update logic.
   *
   * @returns Array of index names to force rebuild
   */
  getForceRebuildIndexes(): string[] {
    return [...this.forceRebuildIndexes];
  }

  /**
   * Apply entity-specific update data (timestamps and index updates)
   * This is called automatically when needed
   */
  private applyEntityUpdates(): void {
    if (!this.entityConfig || this.updateDataApplied) return;

    // Generate timestamps at the time this is called
    const timestamps = this.entityConfig.generateTimestamps();

    // Build index updates with force rebuild support
    const updatedItem = { ...this.entityConfig.key, ...this.entityConfig.data, ...timestamps } as T;
    const indexUpdates = this.entityConfig.buildIndexUpdates(
      this.entityConfig.key,
      updatedItem,
      this.entityConfig.table,
      this.entityConfig.indexes,
      this.forceRebuildIndexes,
    );

    // Apply all updates together: data, timestamps, and index updates
    this.builder.set({ ...this.entityConfig.data, ...timestamps, ...indexUpdates });
    this.updateDataApplied = true;
  }

  // Delegate all UpdateBuilder methods to the wrapped builder
  set(values: Partial<T>): this;
  set<K extends Path<T>>(path: K, value: PathType<T, K>): this;
  set<K extends Path<T>>(valuesOrPath: K | Partial<T>, value?: PathType<T, K>): this {
    if (typeof valuesOrPath === "object") {
      this.builder.set(valuesOrPath);
    } else {
      if (value === undefined) {
        throw new Error("Value is required when setting a single path");
      }
      this.builder.set(valuesOrPath, value);
    }
    return this;
  }

  remove<K extends Path<T>>(path: K): this {
    this.builder.remove(path);
    return this;
  }

  add<K extends Path<T>>(path: K, value: PathType<T, K>): this {
    this.builder.add(path, value);
    return this;
  }

  deleteElementsFromSet<K extends Path<T>>(
    path: K,
    value: PathSetElementType<T, K>[] | Set<PathSetElementType<T, K>>,
  ): this {
    this.builder.deleteElementsFromSet(path, value);
    return this;
  }

  condition(condition: Condition | ((op: ConditionOperator<T>) => Condition)): this {
    this.builder.condition(condition);
    return this;
  }

  returnValues(returnValues: "ALL_NEW" | "UPDATED_NEW" | "ALL_OLD" | "UPDATED_OLD" | "NONE"): this {
    this.builder.returnValues(returnValues);
    return this;
  }

  toDynamoCommand(): UpdateCommandParams {
    return this.builder.toDynamoCommand();
  }

  withTransaction(transaction: TransactionBuilder): void {
    this.applyEntityUpdates();
    this.builder.withTransaction(transaction);
  }

  debug(): ReturnType<UpdateBuilder<T>['debug']> {
    return this.builder.debug();
  }

  async execute(): Promise<{ item?: T }> {
    // Reset the flag for each execution to ensure fresh timestamps
    this.updateDataApplied = false;
    this.applyEntityUpdates();
    return this.builder.execute();
  }
}

/**
 * Creates an entity-aware UpdateBuilder with force index rebuild functionality
 */
export function createEntityAwareUpdateBuilder<T extends DynamoItem>(
  builder: UpdateBuilder<T>,
  entityName: string,
): EntityAwareUpdateBuilder<T> {
  return new EntityAwareUpdateBuilder(builder, entityName);
}
