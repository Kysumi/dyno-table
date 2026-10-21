import type { BatchBuilder } from "../builders/batch-builder.js";
import type { BatchParameter, UpdateCommandParams, WriteExecutionMetadata } from "../builders/builder-types.js";
import type { DeleteBuilder } from "../builders/delete-builder.js";
import type { GetBuilder } from "../builders/get-builder.js";
import type { PutBuilder } from "../builders/put-builder.js";
import type { TransactionBuilder } from "../builders/transaction-builder.js";
import type { Path, PathType } from "../builders/types.js";
import type { UpdateBuilder } from "../builders/update-builder.js";
import type { Condition, ConditionOperator } from "../conditions.js";
import type { Table } from "../table.js";
import type { DynamoItem } from "../types.js";
import { setItemValues } from "../utils/item-values.js";
import type { IndexDefinition } from "./create-index.js";
import { GsiKeyBuilder } from "./ddb-indexing.js";

type SetElementType<T> = T extends Set<infer U> ? U : T extends Array<infer U> ? U : never;
type PathSetElementType<T, K extends Path<T>> = SetElementType<PathType<T, K>>;

export type EntityPutBuilder<
  T extends DynamoItem,
  TInput extends DynamoItem = T,
  TConditional extends boolean = false,
> = EntityAwarePutBuilder<T, TInput, TConditional>;

/** @typeParam TConditional - Whether the put carries a condition, which removes `withBatch` */
export class EntityAwarePutBuilder<
  T extends DynamoItem,
  TInput extends DynamoItem = T,
  TConditional extends boolean = false,
> {
  public item?: T;

  constructor(
    private readonly builder: PutBuilder<T, boolean>,
    public readonly entityName: string,
    private data: TInput,
    private readonly prepareSync: (data: TInput) => T,
    private readonly prepareAsync: (data: TInput) => Promise<T>,
  ) {}

  private applyPrepared(item: T): void {
    this.item = item;
    this.builder.replaceItem(item);
  }

  private applySync(): void {
    this.applyPrepared(this.prepareSync(this.data));
  }

  private async applyAsync(): Promise<void> {
    this.applyPrepared(await this.prepareAsync(this.data));
  }

  set(values: Partial<TInput>): this;
  set<K extends Path<TInput>>(path: K, value: PathType<TInput, K>): this;
  set<K extends Path<TInput>>(valuesOrPath: K | Partial<TInput>, value?: PathType<TInput, K>): this {
    this.data = setItemValues(this.data, valuesOrPath, value);
    return this;
  }

  condition(condition: Condition | ((op: ConditionOperator<T>) => Condition)): EntityAwarePutBuilder<T, TInput, true> {
    this.builder.condition(condition);
    return this as EntityAwarePutBuilder<T, TInput, true>;
  }

  returnValues(returnValues: "ALL_OLD" | "NONE" | "CONSISTENT" | "INPUT"): this {
    this.builder.returnValues(returnValues);
    return this;
  }

  returnConsumedCapacity(value: "INDEXES" | "TOTAL" | "NONE"): this {
    this.builder.returnConsumedCapacity(value);
    return this;
  }

  withTransaction(transaction: TransactionBuilder): this {
    this.applySync();
    this.builder.withTransaction(transaction, this.entityName);
    return this;
  }

  withBatch<
    TEntities extends Record<string, DynamoItem> = Record<string, DynamoItem>,
    K extends keyof TEntities = keyof TEntities,
  >(batch: BatchParameter<TConditional, BatchBuilder<TEntities>>, entityType?: K): void {
    this.applySync();
    this.builder.withBatch(batch as BatchBuilder<TEntities>, entityType ?? (this.entityName as K));
  }

  debug(): ReturnType<PutBuilder<T>["debug"]> {
    this.applySync();
    return this.builder.debug();
  }

  async execute(): Promise<T | undefined> {
    await this.applyAsync();
    return this.builder.execute();
  }

  async executeWithMetadata(): Promise<{ item: T | undefined } & WriteExecutionMetadata> {
    await this.applyAsync();
    return this.builder.executeWithMetadata();
  }
}

export type EntityGetBuilder<T extends DynamoItem> = EntityAwareGetBuilder<T>;

export class EntityAwareGetBuilder<T extends DynamoItem> {
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

export type EntityDeleteBuilder = EntityAwareDeleteBuilder;

/** Entity deletes always guard on the entity type, so they cannot be batched; use `withTransaction` instead. */
export class EntityAwareDeleteBuilder {
  constructor(
    private readonly builder: DeleteBuilder<boolean>,
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

  returnConsumedCapacity(value: "INDEXES" | "TOTAL" | "NONE"): this {
    this.builder.returnConsumedCapacity(value);
    return this;
  }

  withTransaction(transaction: TransactionBuilder): void {
    this.builder.withTransaction(transaction, this.entityName);
  }

  execute(): Promise<{ item?: DynamoItem }> {
    return this.builder.execute();
  }

  executeWithMetadata(): Promise<{ item?: DynamoItem } & WriteExecutionMetadata> {
    return this.builder.executeWithMetadata();
  }

  debug(): ReturnType<DeleteBuilder["debug"]> {
    return this.builder.debug();
  }
}

interface EntityUpdateConfig<T extends DynamoItem> {
  data: Partial<T>;
  key: T;
  table: Table;
  indexes: Record<string, IndexDefinition<T>> | undefined;
  generateTimestamps: (data: Partial<T>) => Record<string, string | number>;
}

/**
 * Entity-aware wrapper for UpdateBuilder that adds forceIndexRebuild functionality
 * and automatically provides the entity name to transactions
 */
export class EntityAwareUpdateBuilder<T extends DynamoItem> {
  private forceRebuildIndexes: string[] = [];
  private readonly rebuiltIndexes = new Set<string>();
  public readonly entityName: string;
  private builder: UpdateBuilder<T>;
  private readonly entityConfig: EntityUpdateConfig<T>;

  constructor(builder: UpdateBuilder<T>, entityName: string, entityConfig: EntityUpdateConfig<T>) {
    this.builder = builder;
    this.entityName = entityName;
    this.entityConfig = { ...entityConfig, data: { ...entityConfig.data } };
    this.builder.set(this.entityConfig.data);
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
    this.forceRebuildIndexes = [
      ...new Set([...this.forceRebuildIndexes, ...(Array.isArray(indexes) ? indexes : [indexes])]),
    ];
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
    // Generate timestamps at the time this is called
    const timestamps = this.entityConfig.generateTimestamps(this.entityConfig.data);

    // Build index updates with force rebuild support
    const updates = { ...this.entityConfig.data, ...timestamps };
    const indexUpdates = new GsiKeyBuilder(this.entityConfig.table, this.entityConfig.indexes).buildForUpdate(
      this.entityConfig.key,
      updates,
      { forceRebuildIndexes: [...new Set([...this.forceRebuildIndexes, ...this.rebuiltIndexes])] },
    );

    // Once inspected, derived keys must refresh even when a setter restores the original value.
    for (const name of Object.keys(this.entityConfig.indexes ?? {})) {
      const index = this.entityConfig.table.gsis[name];
      if (index && (index.partitionKey in indexUpdates || (index.sortKey && index.sortKey in indexUpdates))) {
        this.rebuiltIndexes.add(name);
      }
    }

    // The table builder already holds user mutations in call order.
    this.builder.set({ ...timestamps, ...indexUpdates } as Partial<T>);
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
    this.entityConfig.data = setItemValues(this.entityConfig.data, valuesOrPath, value);
    return this;
  }

  remove<K extends Path<T>>(path: K): this {
    this.builder.remove(path);
    this.entityConfig.data = setItemValues(this.entityConfig.data, path, undefined);
    return this;
  }

  add<K extends Path<T>>(path: K, value: PathType<T, K>): this {
    this.builder.add(path, value);
    this.entityConfig.data = setItemValues(this.entityConfig.data, path, undefined);
    return this;
  }

  deleteElementsFromSet<K extends Path<T>>(
    path: K,
    value: PathSetElementType<T, K>[] | Set<PathSetElementType<T, K>>,
  ): this {
    this.builder.deleteElementsFromSet(path, value);
    this.entityConfig.data = setItemValues(this.entityConfig.data, path, undefined);
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

  returnConsumedCapacity(value: "INDEXES" | "TOTAL" | "NONE"): this {
    this.builder.returnConsumedCapacity(value);
    return this;
  }

  toDynamoCommand(): UpdateCommandParams {
    this.applyEntityUpdates();
    return this.builder.toDynamoCommand();
  }

  withTransaction(transaction: TransactionBuilder): void {
    this.applyEntityUpdates();
    this.builder.withTransaction(transaction, this.entityName);
  }

  debug(): ReturnType<UpdateBuilder<T>["debug"]> {
    this.applyEntityUpdates();
    return this.builder.debug();
  }

  async execute(): Promise<{ item?: T }> {
    this.applyEntityUpdates();
    return this.builder.execute();
  }

  async executeWithMetadata(): Promise<{ item?: T } & WriteExecutionMetadata> {
    this.applyEntityUpdates();
    return this.builder.executeWithMetadata();
  }
}
