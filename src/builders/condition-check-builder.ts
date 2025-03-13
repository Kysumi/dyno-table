import type { Condition, ConditionOperator, PrimaryKeyWithoutExpression } from "../conditions";
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
import { prepareExpressionParams } from "../expression";
import type { DynamoCommandWithExpressions } from "../utils/debug-expression";
import { debugCommand } from "../utils/debug-expression";
import type { ConditionCheckCommandParams } from "./builder-types";

/**
 * Builder for creating DynamoDB condition check operations.
 * Use this builder when you need to:
 * - Verify item state without modifying it
 * - Ensure preconditions in transactions
 * - Implement optimistic locking patterns
 * - Validate business rules
 *
 * @example
 * ```ts
 * // Check if dinosaur is ready for feeding
 * const check = new ConditionCheckBuilder('dinosaurs', { id: 'TREX-001' })
 *   .condition(op =>
 *     op.and([
 *       op.eq('status', 'HUNTING'),
 *       op.gt('stats.hunger', 80),
 *       op.lt('stats.health', 100)
 *     ])
 *   )
 *   .toDynamoCommand();
 *
 * // Check habitat security status
 * const securityCheck = new ConditionCheckBuilder('habitats', { id: 'PADDOCK-A' })
 *   .condition(op =>
 *     op.and([
 *       op.eq('securityStatus', 'ACTIVE'),
 *       op.attributeExists('lastInspection'),
 *       op.lt('threatLevel', 5)
 *     ])
 *   )
 *   .toDynamoCommand();
 * ```
 */
export class ConditionCheckBuilder {
  private readonly key: PrimaryKeyWithoutExpression;
  private readonly tableName: string;
  private conditionExpression?: Condition;

  constructor(tableName: string, key: PrimaryKeyWithoutExpression) {
    this.tableName = tableName;
    this.key = key;
  }

  /**
   * Adds a condition that must be satisfied for the check to succeed.
   * Use this method when you need to:
   * - Validate complex item states
   * - Check multiple attributes together
   * - Ensure safety conditions are met
   *
   * @example
   * ```ts
   * // Check dinosaur health and behavior
   * builder.condition(op =>
   *   op.and([
   *     op.gt('stats.health', 50),
   *     op.not(op.eq('status', 'SEDATED')),
   *     op.lt('aggressionLevel', 8)
   *   ])
   * );
   *
   * // Verify habitat conditions
   * builder.condition(op =>
   *   op.and([
   *     op.eq('powerStatus', 'ONLINE'),
   *     op.between('temperature', 20, 30),
   *     op.attributeExists('lastMaintenance')
   *   ])
   * );
   *
   * // Check breeding conditions
   * builder.condition(op =>
   *   op.and([
   *     op.eq('species', 'VELOCIRAPTOR'),
   *     op.gte('age', 3),
   *     op.eq('geneticPurity', 100)
   *   ])
   * );
   * ```
   *
   * @param condition - Either a Condition object or a callback function that builds the condition
   * @returns The builder instance for method chaining
   */
  condition<T extends Record<string, unknown>>(
    condition: Condition | ((op: ConditionOperator<T>) => Condition),
  ): ConditionCheckBuilder {
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
      this.conditionExpression = condition(conditionOperator);
    } else {
      this.conditionExpression = condition;
    }
    return this;
  }

  /**
   * Generates the DynamoDB command parameters for direct execution.
   * Use this method when you want to:
   * - Execute the condition check as a standalone operation
   * - Get the raw DynamoDB command for custom execution
   * - Inspect the generated command parameters
   *
   * @example
   * ```ts
   * const command = new ConditionCheckBuilder('myTable', { id: '123' })
   *   .condition(op => op.attributeExists('status'))
   *   .toDynamoCommand();
   * // Use command with DynamoDB client
   * ```
   *
   * @throws {Error} If no condition has been set
   * @returns The DynamoDB command parameters
   */
  private toDynamoCommand(): ConditionCheckCommandParams {
    if (!this.conditionExpression) {
      throw new Error("Condition is required for condition check operations");
    }

    const { expression, names, values } = prepareExpressionParams(this.conditionExpression);

    if (!expression) {
      throw new Error("Failed to generate condition expression");
    }

    return {
      tableName: this.tableName,
      key: this.key,
      conditionExpression: expression,
      expressionAttributeNames: names,
      expressionAttributeValues: values,
    };
  }

  /**
   * Adds this condition check operation to a transaction.
   * Use this method when you need to:
   * - Verify habitat safety before transfers
   * - Ensure proper feeding conditions
   * - Validate security protocols
   *
   * @example
   * ```ts
   * const transaction = new TransactionBuilder();
   * new ConditionCheckBuilder('habitats', { id: 'PADDOCK-B' })
   *   .condition(op => op.and([
   *     op.eq('securityStatus', 'ACTIVE'),
   *     op.lt('currentOccupants', 3),
   *     op.eq('habitatType', 'CARNIVORE')
   *   ]))
   *   .withTransaction(transaction);
   * // Add dinosaur transfer operations
   * ```
   *
   * @param transaction - The transaction builder to add this operation to
   * @throws {Error} If no condition has been set
   * @returns The builder instance for method chaining
   */
  withTransaction(transaction: TransactionBuilder): ConditionCheckBuilder {
    if (!this.conditionExpression) {
      throw new Error("Condition is required for condition check operations");
    }

    const command = this.toDynamoCommand();
    transaction.conditionCheckWithCommand(command);

    return this;
  }

  /**
   * Gets a human-readable representation of the condition check command
   * with all expression placeholders replaced by their actual values.
   * Use this method when you need to:
   * - Debug complex condition expressions
   * - Verify condition parameters
   * - Log safety checks
   * - Troubleshoot condition failures
   *
   * @example
   * ```ts
   * const debugInfo = new ConditionCheckBuilder('dinosaurs', { id: 'TREX-001' })
   *   .condition(op => op.and([
   *     op.between('stats.health', 50, 100),
   *     op.not(op.eq('status', 'SEDATED')),
   *     op.attributeExists('lastFeedingTime')
   *     op.eq('version', 1)
   *   ]))
   *   .debug();
   * console.log(debugInfo);
   * ```
   *
   * @returns A readable representation of the condition check command with resolved expressions
   */
  debug(): Record<string, unknown> {
    const command = this.toDynamoCommand();
    return debugCommand(command);
  }
}
