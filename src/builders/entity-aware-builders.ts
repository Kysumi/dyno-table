import type { DynamoItem } from "../types";
import type { DeleteExecutor } from "./delete-builder";
import { DeleteBuilder } from "./delete-builder";
import { GetBuilder, type GetExecutor } from "./get-builder";
import { PutBuilder, type PutExecutor } from "./put-builder";
import type { BatchBuilder } from "./batch-builder";
import type { Condition, PrimaryKeyWithoutExpression } from "../conditions";

/**
 * Entity-aware PutBuilder — carries entityName for withBatch auto-inference.
 */
export class EntityAwarePutBuilder<T extends DynamoItem> extends PutBuilder<T> {
  public readonly entityName: string;

  constructor(executor: PutExecutor<T>, item: T, tableName: string, entityName: string) {
    super(executor, item, tableName);
    this.entityName = entityName;
  }

  public override withBatch<
    TEntities extends Record<string, DynamoItem> = Record<string, DynamoItem>,
    K extends keyof TEntities = keyof TEntities,
  >(batch: BatchBuilder<TEntities>, entityType?: K) {
    super.withBatch(batch, entityType ?? (this.entityName as any));
  }
}

/**
 * Entity-aware GetBuilder — carries entityName for withBatch auto-inference.
 */
export class EntityAwareGetBuilder<T extends DynamoItem> extends GetBuilder<T> {
  public readonly entityName: string;

  constructor(
    executor: GetExecutor<T>,
    key: PrimaryKeyWithoutExpression,
    tableName: string,
    indexAttributeNames: string[],
    entityName: string,
  ) {
    super(executor, key, tableName, indexAttributeNames);
    this.entityName = entityName;
  }

  public override withBatch<
    TEntities extends Record<string, DynamoItem> = Record<string, DynamoItem>,
    K extends keyof TEntities = keyof TEntities,
  >(batch: BatchBuilder<TEntities>, entityType?: K) {
    super.withBatch(batch, entityType ?? (this.entityName as any));
  }
}

/**
 * Entity-aware DeleteBuilder — carries entityName for withBatch auto-inference.
 */
export class EntityAwareDeleteBuilder extends DeleteBuilder {
  public readonly entityName: string;

  constructor(executor: DeleteExecutor, tableName: string, key: PrimaryKeyWithoutExpression, entityName: string) {
    super(executor, tableName, key);
    this.entityName = entityName;
  }

  public override withBatch<
    TEntities extends Record<string, DynamoItem> = Record<string, DynamoItem>,
    K extends keyof TEntities = keyof TEntities,
  >(batch: BatchBuilder<TEntities>, entityType?: K) {
    super.withBatch(batch, entityType ?? (this.entityName as any));
  }
}
