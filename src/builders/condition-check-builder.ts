import type { Condition, ConditionOperator, PrimaryKeyWithoutExpression } from "../conditions";
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
  ne,
  not,
  or,
} from "../conditions";
import { prepareExpressionParams } from "../expression";
import type { DynamoItem } from "../types";
import { debugCommand } from "../utils/debug-expression";
import { ConfigurationErrors, ValidationErrors } from "../utils/error-factory";
import type { ConditionCheckCommandParams } from "./builder-types";
import type { TransactionBuilder } from "./transaction-builder";

/**
 * Builder for creating DynamoDB condition check operations.
 * Use this builder when you need to:
 * - Verify item state without modifying it
 * - Ensure preconditions in transactions
 * - Implement optimistic locking patterns
 * - Validate business rules
 *
 * @example
 * ```typescript
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
   *
   * @example
   * ```typescript
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
   * @param condition - Either a Condition DynamoItem or a callback function that builds the condition
   * @returns The builder instance for method chaining
   */
  condition<T extends DynamoItem>(condition: Condition | ((op: ConditionOperator<T>) => Condition)): this {
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
      throw ValidationErrors.conditionRequired(this.tableName, this.key);
    }

    const { expression, names, values } = prepareExpressionParams(this.conditionExpression);

    if (!expression) {
      throw ConfigurationErrors.conditionGenerationFailed(this.conditionExpression);
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
  withTransaction(transaction: TransactionBuilder): this {
    if (!this.conditionExpression) {
      throw ValidationErrors.conditionRequired(this.tableName, this.key);
    }

    const command = this.toDynamoCommand();
    transaction.conditionCheckWithCommand(command);

    return this;
  }

  /**
   * Gets a human-readable representation of the condition check command
   * with all expression placeholders replaced by their actual values.
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
  debug() {
    const command = this.toDynamoCommand();
    return debugCommand(command);
  }
}
