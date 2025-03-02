import type { Condition, ConditionOperator } from "../conditions";
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
} from "../conditions";
import type { TransactionBuilder } from "./transaction-builder";
import { buildExpression, prepareExpressionParams } from "../expression";
import type { DynamoCommandWithExpressions } from "../utils/debug-expression";
import { debugCommand } from "../utils/debug-expression";

/**
 * Configuration options for DynamoDB put operations.
 */
export interface PutOptions {
  /** Optional condition that must be satisfied for the put operation to succeed */
  condition?: Condition;
  /** Determines whether to return the item's previous state (if it existed) */
  returnValues?: "ALL_OLD" | "NONE";
}

/**
 * Parameters for the DynamoDB put command.
 * These parameters are used when executing the operation against DynamoDB.
 */
export interface PutCommandParams extends DynamoCommandWithExpressions {
  tableName: string;
  item: Record<string, unknown>;
  conditionExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, unknown>;
  returnValues?: "ALL_OLD" | "NONE";
}

type PutExecutor<T extends Record<string, unknown>> = (params: PutCommandParams) => Promise<T>;

/**
 * Builder for creating DynamoDB put operations.
 * Use this builder when you need to:
 * - Add new dinosaurs to the registry
 * - Create new habitats
 * - Update dinosaur profiles completely
 * - Initialize tracking records
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
export class PutBuilder<T extends Record<string, unknown>> {
  private readonly item: T;
  private options: PutOptions = {};
  private readonly executor: PutExecutor<T>;
  private readonly tableName: string;

  constructor(executor: PutExecutor<T>, item: T, tableName: string) {
    this.executor = executor;
    this.item = item;
    this.tableName = tableName;
  }

  /**
   * Adds a condition that must be satisfied for the put operation to succeed.
   * Use this method when you need to:
   * - Prevent overwriting existing items (optimistic locking)
   * - Ensure items meet certain criteria before replacement
   * - Implement complex business rules for item updates
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
   * Use this method when you need to:
   * - Prevent duplicate dinosaur entries
   * - Ensure habitat requirements
   * - Validate security protocols
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
  public condition(condition: Condition | ((op: ConditionOperator<T>) => Condition)): PutBuilder<T> {
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
      this.options.condition = condition(conditionOperator);
    } else {
      this.options.condition = condition;
    }
    return this;
  }

  /**
   * Sets whether to return the item's previous values (if it existed).
   * Use this method when you need to:
   * - Track dinosaur profile updates
   * - Monitor habitat modifications
   * - Maintain change history
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
   * ```
   *
   * @param returnValues - Use 'ALL_OLD' to return previous values, or 'NONE' (default)
   * @returns The builder instance for method chaining
   */
  public returnValues(returnValues: "ALL_OLD" | "NONE"): PutBuilder<T> {
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
   * Use this method when you need to:
   * - Transfer dinosaurs between habitats
   * - Initialize new breeding programs
   * - Update multiple facility records
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
  public withTransaction(transaction: TransactionBuilder): PutBuilder<T> {
    const command = this.toDynamoCommand();
    transaction.putWithCommand(command);

    return this;
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
  public async execute(): Promise<T> {
    const params = this.toDynamoCommand();
    return this.executor(params);
  }

  /**
   * Gets a human-readable representation of the put command
   * with all expression placeholders replaced by their actual values.
   * Use this method when you need to:
   * - Debug complex dinosaur transfers
   * - Verify habitat assignments
   * - Log security protocols
   * - Troubleshoot breeding program conditions
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
  public debug(): Record<string, unknown> {
    const command = this.toDynamoCommand();
    return debugCommand(command);
  }
}
