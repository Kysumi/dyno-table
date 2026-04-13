import type { Condition, ConditionOperator } from "../conditions";
import {
  and,
  attributeExists,
  attributeNotExists,
  beginsWith,
  between,
  contains,
  eq,
  gt,
  gte,
  inArray,
  lt,
  lte,
  mergeConditions,
  ne,
  not,
  or,
} from "../conditions";
import { prepareExpressionParams } from "../expression";
import type { DynamoItem } from "../types";
import { debugCommand } from "../utils/debug-expression";
import type { BatchBuilder } from "./batch-builder";
import type { PutCommandParams } from "./builder-types";
import type { TransactionBuilder } from "./transaction-builder";
import type { Path, PathType } from "./types";

/**
 * Configuration options for DynamoDB put operations.
 */
export interface PutOptions {
  /** Optional condition that must be satisfied for the put operation to succeed */
  condition?: Condition;
  /** Determines how to handle the return value of the put operation
   * @options
   *  - NONE: No return value
   *  - ALL_OLD: Returns the item's previous state if it existed
   *  - CONSISTENT: Performs a GET operation after the put to retrieve the item's new state
   *  - INPUT: Returns the input values that were passed to the operation
   */
  returnValues?: "ALL_OLD" | "NONE" | "CONSISTENT" | "INPUT";
}

export type PutExecutor<T extends DynamoItem> = (params: PutCommandParams) => Promise<T>;

/**
 * Builder for creating DynamoDB put operations.
 *
 * @example
 * ```typescript
 * // Add new dinosaur
 * const result = await new PutBuilder(executor, {
 *   id: 'RAPTOR-001',
 *   species: 'Velociraptor',
 *   status: 'ACTIVE',
 *   stats: {
 *     health: 100,
 *     age: 5,
 *     threatLevel: 8
 *   }
 * }, 'dinosaurs').execute();
 *
 * // Create new habitat with conditions
 * const result = await new PutBuilder(executor, {
 *   id: 'PADDOCK-C',
 *   type: 'CARNIVORE',
 *   securityLevel: 'MAXIMUM',
 *   capacity: 3,
 *   environmentType: 'TROPICAL'
 * }, 'habitats')
 *   .condition(op => op.attributeNotExists('id'))
 *   .execute();
 * ```
 *
 * @typeParam T - The type of item being put into the table
 */
export class PutBuilder<T extends DynamoItem> {
  protected item: T;
  protected options: PutOptions;
  protected internalCondition?: Condition;
  protected readonly executor: PutExecutor<T>;
  protected readonly tableName: string;

  constructor(executor: PutExecutor<T>, item: T, tableName: string) {
    this.executor = executor;
    this.item = item;
    this.tableName = tableName;
    this.options = {
      returnValues: "NONE",
    };
  }

  /**
   * Sets multiple attributes of an item using an DynamoItem.
   */
  set(values: Partial<T>): this;

  /**
   * Sets a single attribute to a specific value.
   */
  set<K extends Path<T>>(path: K, value: PathType<T, K>): this;
  set<K extends Path<T>>(valuesOrPath: K | Partial<T>, value?: PathType<T, K>): this {
    if (typeof valuesOrPath === "object") {
      Object.assign(this.item, valuesOrPath);
    } else {
      // @ts-expect-error
      this.item[valuesOrPath] = value;
    }
    return this;
  }

  /**
   * Adds a condition that must be satisfied for the put operation to succeed.
   * Multiple calls to .condition() will be ANDed together.
   *
   * @example
   * ```typescript
   * builder
   *   .condition(op => op.attributeNotExists('id'))
   *   .condition(op => op.gt('version', 1));
   * ```
   */
  public condition(condition: Condition | ((op: ConditionOperator<T>) => Condition)): this {
    const conditionOperator: ConditionOperator<T> = {
      eq,
      ne,
      lt,
      lte,
      gt,
      gte,
      between,
      inArray,
      beginsWith,
      contains,
      attributeExists,
      attributeNotExists,
      and,
      or,
      not,
    };

    const newCondition = typeof condition === "function" ? condition(conditionOperator) : condition;
    this.options.condition = mergeConditions(this.options.condition, newCondition);
    return this;
  }

  /**
   * Sets an internal condition (e.g., entity guards).
   * @internal
   */
  public _addInternalCondition(condition: Condition | ((op: ConditionOperator<T>) => Condition)): this {
    const conditionOperator: ConditionOperator<T> = {
      eq,
      ne,
      lt,
      lte,
      gt,
      gte,
      between,
      inArray,
      beginsWith,
      contains,
      attributeExists,
      attributeNotExists,
      and,
      or,
      not,
    };

    const newCondition = typeof condition === "function" ? condition(conditionOperator) : condition;
    this.internalCondition = mergeConditions(this.internalCondition, newCondition);
    return this;
  }

  /**
   * Sets whether to return the item's previous values (if it existed).
   *
   * @options
   *  - NONE: No return value (default)
   *  - ALL_OLD: Returns the item's previous state if it existed
   *  - CONSISTENT: Performs a GET operation after the put to retrieve the item's new state
   *  - INPUT: Returns the input values that were passed to the operation
   */
  public returnValues(returnValues: "ALL_OLD" | "NONE" | "CONSISTENT" | "INPUT"): this {
    this.options.returnValues = returnValues;
    return this;
  }

  /**
   * Generate the DynamoDB command parameters
   * @internal
   */
  public toDynamoCommand(): PutCommandParams {
    const finalCondition = this.internalCondition
      ? this.options.condition
        ? and(this.internalCondition, this.options.condition)
        : this.internalCondition
      : this.options.condition;
    const { expression, names, values } = prepareExpressionParams(finalCondition);

    return {
      tableName: this.tableName,
      item: this.item,
      conditionExpression: expression,
      expressionAttributeNames: names,
      expressionAttributeValues: values,
      returnValues: this.options.returnValues,
    };
  }

  /**
   * Adds this put operation to a transaction.
   */
  public withTransaction(transaction: TransactionBuilder): this {
    transaction.putWithCommand(this.toDynamoCommand());
    return this;
  }

  /**
   * Adds this put operation to a batch with optional entity type information.
   */
  public withBatch<
    TEntities extends Record<string, DynamoItem> = Record<string, DynamoItem>,
    K extends keyof TEntities = keyof TEntities,
  >(batch: BatchBuilder<TEntities>, entityType?: K) {
    batch.putWithCommand(this.toDynamoCommand(), entityType);
  }

  /**
   * Executes the put operation against DynamoDB.
   */
  public async execute(): Promise<T | undefined> {
    return this.executor(this.toDynamoCommand());
  }

  /**
   * Gets a human-readable representation of the put command.
   */
  public debug() {
    return debugCommand(this.toDynamoCommand());
  }
}
