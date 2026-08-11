import type { BatchBuilder } from "../builders/batch-builder.js";
import type { UpdateCommandParams } from "../builders/builder-types.js";
import type { DeleteBuilder } from "../builders/delete-builder.js";
import type { GetBuilder } from "../builders/get-builder.js";
import type { PutBuilder } from "../builders/put-builder.js";
import type { TransactionBuilder } from "../builders/transaction-builder.js";
import type { Path, PathType } from "../builders/types.js";
import type { UpdateBuilder } from "../builders/update-builder.js";
import type { Condition, ConditionOperator } from "../conditions.js";
import type { Table } from "../table.js";
import type { DynamoItem } from "../types.js";
import type { IndexDefinition } from "./create-index.js";
import { GsiKeyBuilder } from "./ddb-indexing.js";

type SetElementType<T> = T extends Set<infer U> ? U : T extends Array<infer U> ? U : never;
type PathSetElementType<T, K extends Path<T>> = SetElementType<PathType<T, K>>;

export interface EntityPutBuilder<T extends DynamoItem> {
  readonly entityName: string;

  set(values: Partial<T>): this;

  set<K extends Path<T>>(path: K, value: PathType<T, K>): this;

  condition(condition: Condition | ((op: ConditionOperator<T>) => Condition)): this;

  returnValues(returnValues: "ALL_OLD" | "NONE" | "CONSISTENT" | "INPUT"): this;

  withTransaction(transaction: TransactionBuilder): PutBuilder<T>;

  withBatch<
    TEntities extends Record<string, DynamoItem> = Record<string, DynamoItem>,
    K extends keyof TEntities = keyof TEntities,
  >(batch: BatchBuilder<TEntities>, entityType?: K): void;

  debug(): ReturnType<PutBuilder<T>["debug"]>;

  execute(): Promise<T | undefined>;
}

export class EntityAwarePutBuilder<T extends DynamoItem> implements EntityPutBuilder<T> {
  public item?: T;

  constructor(
    private readonly builder: PutBuilder<T>,
    public readonly entityName: string,
    private readonly prepareSync: () => T,
    private readonly prepareAsync: () => Promise<T>,
    private readonly onExecuteResult?: (item: T, executorResult: T | undefined) => T | undefined,
  ) {}

  private applySync(): void {
    this.item = this.prepareSync();
    this.builder.set(this.item);
  }

  private async applyAsync(): Promise<void> {
    this.item = await this.prepareAsync();
    this.builder.set(this.item);
  }

  set(values: Partial<T>): this;
  set<K extends Path<T>>(path: K, value: PathType<T, K>): this;
  set<K extends Path<T>>(valuesOrPath: K | Partial<T>, value?: PathType<T, K>): this {
    if (typeof valuesOrPath === "object") this.builder.set(valuesOrPath);
    else this.builder.set(valuesOrPath, value as PathType<T, K>);
    return this;
  }

  condition(condition: Condition | ((op: ConditionOperator<T>) => Condition)): this {
    this.builder.condition(condition);
    return this;
  }

  returnValues(returnValues: "ALL_OLD" | "NONE" | "CONSISTENT" | "INPUT"): this {
    this.builder.returnValues(returnValues);
    return this;
  }

  withTransaction(transaction: TransactionBuilder): PutBuilder<T> {
    this.applySync();
    return this.builder.withTransaction(transaction);
  }

  withBatch<
    TEntities extends Record<string, DynamoItem> = Record<string, DynamoItem>,
    K extends keyof TEntities = keyof TEntities,
  >(batch: BatchBuilder<TEntities>, entityType?: K): void {
    this.applySync();
    this.builder.withBatch(batch, entityType ?? (this.entityName as K));
  }

  debug(): ReturnType<PutBuilder<T>["debug"]> {
    return this.builder.debug();
  }

  async execute(): Promise<T | undefined> {
    await this.applyAsync();
    const result = await this.builder.execute();
    return this.onExecuteResult ? this.onExecuteResult(this.item as T, result) : result;
  }
}

export interface EntityGetBuilder<T extends DynamoItem> {
  readonly entityName: string;

  select<K extends Path<T>>(fields: K | K[]): this;

  includeIndexes(): this;

  consistentRead(consistentRead?: boolean): this;

  withBatch<
    TEntities extends Record<string, DynamoItem> = Record<string, DynamoItem>,
    K extends keyof TEntities = keyof TEntities,
  >(batch: BatchBuilder<TEntities>, entityType?: K): void;

  execute(): Promise<{ item: T | undefined }>;
}

export class EntityAwareGetBuilder<T extends DynamoItem> implements EntityGetBuilder<T> {
  constructor(
    private readonly builder: GetBuilder<T>,
    public readonly entityName: string,
  ) {}

  select<K extends Path<T>>(fields: K | K[]): this {
    this.builder.select(fields);
    return this;
  }

  includeIndexes(): this {
    this.builder.includeIndexes();
    return this;
  }

  consistentRead(consistentRead = true): this {
    this.builder.consistentRead(consistentRead);
    return this;
  }

  withBatch<
    TEntities extends Record<string, DynamoItem> = Record<string, DynamoItem>,
    K extends keyof TEntities = keyof TEntities,
  >(batch: BatchBuilder<TEntities>, entityType?: K): void {
    this.builder.withBatch(batch, entityType ?? (this.entityName as K));
  }

  execute(): Promise<{ item: T | undefined }> {
    return this.builder.execute();
  }
}

export interface EntityDeleteBuilder {
  readonly entityName: string;

  condition<T extends DynamoItem>(condition: Condition | ((op: ConditionOperator<T>) => Condition)): this;

  returnValues(returnValues: "ALL_OLD"): this;

  withTransaction(transaction: TransactionBuilder): void;

  withBatch<
    TEntities extends Record<string, DynamoItem> = Record<string, DynamoItem>,
    K extends keyof TEntities = keyof TEntities,
  >(batch: BatchBuilder<TEntities>, entityType?: K): void;

  execute(): Promise<{ item?: DynamoItem }>;

  debug(): ReturnType<DeleteBuilder["debug"]>;
}

export class EntityAwareDeleteBuilder implements EntityDeleteBuilder {
  constructor(
    private readonly builder: DeleteBuilder,
    public readonly entityName: string,
  ) {}

  condition<T extends DynamoItem>(condition: Condition | ((op: ConditionOperator<T>) => Condition)): this {
    this.builder.condition(condition);
    return this;
  }

  returnValues(returnValues: "ALL_OLD"): this {
    this.builder.returnValues(returnValues);
    return this;
  }

  withTransaction(transaction: TransactionBuilder): void {
    this.builder.withTransaction(transaction);
  }

  withBatch<
    TEntities extends Record<string, DynamoItem> = Record<string, DynamoItem>,
    K extends keyof TEntities = keyof TEntities,
  >(batch: BatchBuilder<TEntities>, entityType?: K): void {
    this.builder.withBatch(batch, entityType ?? (this.entityName as K));
  }

  execute(): Promise<{ item?: DynamoItem }> {
    return this.builder.execute();
  }

  debug(): ReturnType<DeleteBuilder["debug"]> {
    return this.builder.debug();
  }
}

/**
 * Entity-aware wrapper for UpdateBuilder that adds forceIndexRebuild functionality
 * and automatically provides entity name to batch operations
 */
export class EntityAwareUpdateBuilder<T extends DynamoItem> {
  private forceRebuildIndexes: string[] = [];
  public readonly entityName: string;
  private builder: UpdateBuilder<T>;
  private readonly entityConfig: {
    data: Partial<T>;
    key: T;
    table: Table;
    indexes: Record<string, IndexDefinition<T>> | undefined;
    generateTimestamps: () => Record<string, string | number>;
  };
  private updateDataApplied = false;

  constructor(
    builder: UpdateBuilder<T>,
    entityName: string,
    entityConfig: {
      data: Partial<T>;
      key: T;
      table: Table;
      indexes: Record<string, IndexDefinition<T>> | undefined;
      generateTimestamps: () => Record<string, string | number>;
    },
  ) {
    this.builder = builder;
    this.entityName = entityName;
    this.entityConfig = entityConfig;
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
    if (this.updateDataApplied) return;

    // Generate timestamps at the time this is called
    const timestamps = this.entityConfig.generateTimestamps();

    // Build index updates with force rebuild support
    const updatedItem = { ...this.entityConfig.key, ...this.entityConfig.data, ...timestamps } as T;
    const indexUpdates = new GsiKeyBuilder(this.entityConfig.table, this.entityConfig.indexes).buildForUpdate(
      this.entityConfig.key,
      updatedItem,
      { forceRebuildIndexes: this.forceRebuildIndexes },
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
      this.builder.set(valuesOrPath, value as PathType<T, K>);
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
    this.updateDataApplied = false;
    this.applyEntityUpdates();
    this.builder.withTransaction(transaction);
  }

  debug(): ReturnType<UpdateBuilder<T>["debug"]> {
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
  entityConfig: {
    data: Partial<T>;
    key: T;
    table: Table;
    indexes: Record<string, IndexDefinition<T>> | undefined;
    generateTimestamps: () => Record<string, string | number>;
  },
): EntityAwareUpdateBuilder<T> {
  return new EntityAwareUpdateBuilder(builder, entityName, entityConfig);
}
