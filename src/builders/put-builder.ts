import type { Condition, ConditionOperator } from "../conditions";
import {
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
} from "../conditions";
import type { TransactionBuilder } from "./transaction-builder";
import type { BatchBuilder } from "./batch-builder";
import { prepareExpressionParams } from "../expression";
import { debugCommand } from "../utils/debug-expression";
import type { PutCommandParams } from "./builder-types";
import type { Path, PathType } from "./types";
import type { DynamoItem } from "../types";

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

type PutExecutor<T extends DynamoItem> = (params: PutCommandParams) => Promise<T>;

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
  private readonly item: T;
  private options: PutOptions;
  private readonly executor: PutExecutor<T>;
  private readonly tableName: string;

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
   *
   * @example
   * ```typescript
   * // Update multiple attributes
   * builder.set({
   *   species: 'Tyrannosaurus Rex',
   *   height: 20,
   *   diet: 'CARNIVORE',
   *   'stats.threatLevel': 10
   * });
   * ```
   */
  set(values: Partial<T>): this;

  /**
   * Sets a single attribute to a specific value.
   *
   * @example
   * ```typescript
   * // Set simple attributes
   * builder
   *   .set('status', 'SLEEPING')
   *   .set('lastFeeding', new Date().toISOString());
   *
   * // Set nested attributes
   * builder
   *   .set('location.zone', 'RESTRICTED')
   *   .set('stats.health', 100);
   * ```
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
   *
   * @example
   * ```ts
   * // Ensure item doesn't exist (insert only)
   * builder.condition(op => op.attributeNotExists('id'))
   *
   * // Complex condition with version check
   * builder.condition(op =>
   *   op.and([
   *     op.attributeExists('id'),
   *     op.eq('version', currentVersion),
   *     op.eq('status', 'ACTIVE')
   *   ])
   * )
   * ```
   *
   * @param condition - Either a Condition object or a callback function that builds the condition
   * @returns The builder instance for method chaining
   */
  /**
   * Adds a condition that must be satisfied for the put operation to succeed.
   *
   * @example
   * ```typescript
   * // Ensure unique dinosaur ID
   * builder.condition(op =>
   *   op.attributeNotExists('id')
   * );
   *
   * // Verify habitat requirements
   * builder.condition(op =>
   *   op.and([
   *     op.eq('securityStatus', 'READY'),
   *     op.attributeExists('lastInspection'),
   *     op.gt('securityLevel', 5)
   *   ])
   * );
   *
   * // Check breeding facility conditions
   * builder.condition(op =>
   *   op.and([
   *     op.between('temperature', 25, 30),
   *     op.between('humidity', 60, 80),
   *     op.eq('quarantineStatus', 'CLEAR')
   *   ])
   * );
   * ```
   *
   * @param condition - Either a Condition object or a callback function that builds the condition
   * @returns The builder instance for method chaining
   */
  public condition(condition: Condition | ((op: ConditionOperator<T>) => Condition)): this {
    if (typeof condition === "function") {
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
      this.options.condition = condition(conditionOperator);
    } else {
      this.options.condition = condition;
    }
    return this;
  }

  /**
   * Sets whether to return the item's previous values (if it existed).
   *
   * @options
   *  - NONE: No return value
   *  - ALL_OLD: Returns the item's previous state if it existed, no read capacity units are consumed
   *  - CONSISTENT: Performs a GET operation after the put to retrieve the item's new state
   *  - INPUT: Returns the input values that were passed to the operation
   *
   * @example
   * ```ts
   * // Get previous dinosaur state
   * const result = await builder
   *   .returnValues('ALL_OLD')
   *   .execute();
   *
   * if (result) {
   *   console.log('Previous profile:', {
   *     species: result.species,
   *     status: result.status,
   *     stats: {
   *       health: result.stats.health,
   *       threatLevel: result.stats.threatLevel
   *     }
   *   });
   * }
   *
   * // Return input values for create operations
   * const createResult = await builder
   *   .returnValues('INPUT')
   *   .execute();
   * ```
   *
   * @param returnValues - Use 'ALL_OLD' to return previous values, 'INPUT' to return input values, 'CONSISTENT' for fresh data, or 'NONE' (default).
   * @returns The builder instance for method chaining
   */
  public returnValues(returnValues: "ALL_OLD" | "NONE" | "CONSISTENT" | "INPUT"): this {
    this.options.returnValues = returnValues;
    return this;
  }

  /**
   * Generate the DynamoDB command parameters
   */
  private toDynamoCommand(): PutCommandParams {
    const { expression, names, values } = prepareExpressionParams(this.options.condition);

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
   *
   * @example
   * ```ts
   * const transaction = new TransactionBuilder();
   *
   * // Add dinosaur to new habitat
   * new PutBuilder(executor, {
   *   id: 'TREX-002',
   *   location: 'PADDOCK-B',
   *   status: 'ACTIVE',
   *   transferDate: new Date().toISOString()
   * }, 'dinosaurs')
   *   .withTransaction(transaction);
   *
   * // Update habitat records
   * new UpdateBuilder(executor, 'habitats', { id: 'PADDOCK-B' })
   *   .add('occupants', 1)
   *   .set('lastTransfer', new Date().toISOString())
   *   .withTransaction(transaction);
   *
   * // Execute transfer atomically
   * await transaction.execute();
   * ```
   *
   * @param transaction - The transaction builder to add this operation to
   * @returns The builder instance for method chaining
   */
  public withTransaction(transaction: TransactionBuilder): this {
    const command = this.toDynamoCommand();
    transaction.putWithCommand(command);

    return this;
  }

  /**
   * Adds this put operation to a batch with optional entity type information.
   *
   * @example Basic Usage
   * ```ts
   * const batch = table.batchBuilder();
   *
   * // Add multiple dinosaurs to batch
   * dinosaurRepo.create(newDino1).withBatch(batch);
   * dinosaurRepo.create(newDino2).withBatch(batch);
   * dinosaurRepo.create(newDino3).withBatch(batch);
   *
   * // Execute all operations efficiently
   * await batch.execute();
   * ```
   *
   * @example Typed Usage
   * ```ts
   * const batch = table.batchBuilder<{
   *   User: UserEntity;
   *   Order: OrderEntity;
   * }>();
   *
   * // Add operations with type information
   * userRepo.create(newUser).withBatch(batch, 'User');
   * orderRepo.create(newOrder).withBatch(batch, 'Order');
   *
   * // Execute and get typed results
   * const result = await batch.execute();
   * const users: UserEntity[] = result.reads.itemsByType.User;
   * ```
   *
   * @param batch - The batch builder to add this operation to
   * @param entityType - Optional entity type key for type tracking
   */
  public withBatch<
    TEntities extends Record<string, DynamoItem> = Record<string, DynamoItem>,
    K extends keyof TEntities = keyof TEntities,
  >(batch: BatchBuilder<TEntities>, entityType?: K) {
    const command = this.toDynamoCommand();
    batch.putWithCommand(command, entityType);
  }

  /**
   * Executes the put operation against DynamoDB.
   *
   * @example
   * ```ts
   * try {
   *   // Put with condition and return old values
   *   const result = await new PutBuilder(executor, newItem, 'myTable')
   *     .condition(op => op.eq('version', 1))
   *     .returnValues('ALL_OLD')
   *     .execute();
   *
   *   console.log('Put successful, old item:', result);
   * } catch (error) {
   *   // Handle condition check failure or other errors
   *   console.error('Put failed:', error);
   * }
   * ```
   *
   * @returns A promise that resolves to the operation result (type depends on returnValues setting)
   * @throws Will throw an error if the condition check fails or other DynamoDB errors occur
   */
  public async execute(): Promise<T | undefined> {
    const params = this.toDynamoCommand();
    return this.executor(params);
  }

  /**
   * Gets a human-readable representation of the put command
   * with all expression placeholders replaced by their actual values.
   *
   * @example
   * ```ts
   * const debugInfo = new PutBuilder(executor, {
   *   id: 'RAPTOR-003',
   *   species: 'Velociraptor',
   *   status: 'QUARANTINE',
   *   stats: {
   *     health: 100,
   *     aggressionLevel: 7,
   *     age: 2
   *   }
   * }, 'dinosaurs')
   *   .condition(op =>
   *     op.and([
   *       op.attributeNotExists('id'),
   *       op.eq('quarantineStatus', 'READY'),
   *       op.gt('securityLevel', 8)
   *     ])
   *   )
   *   .debug();
   *
   * console.log('Dinosaur transfer command:', debugInfo);
   * ```
   *
   * @returns A readable representation of the put command with resolved expressions
   */
  public debug() {
    const command = this.toDynamoCommand();
    return debugCommand(command);
  }
}
