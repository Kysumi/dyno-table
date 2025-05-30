import type { Condition, ConditionOperator, PrimaryKeyWithoutExpression } from "../conditions";
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
import { prepareExpressionParams } from "../expression";
import { debugCommand } from "../utils/debug-expression";
import type { DeleteCommandParams } from "./builder-types";
import type { DynamoItem } from "../types";

export interface DeleteOptions {
  condition?: Condition;
  returnValues?: "ALL_OLD";
}

type DeleteExecutor = (params: DeleteCommandParams) => Promise<{ item?: DynamoItem }>;

/**
 * Builder for creating DynamoDB delete operations.
 *
 * @example
 * ```typescript
 * // Simple delete
 * const result = await new DeleteBuilder(executor, 'dinosaurs', { id: 'TREX-001' })
 *   .execute();
 *
 * // Conditional delete with old value retrieval
 * const result = await new DeleteBuilder(executor, 'habitats', { id: 'PADDOCK-A' })
 *   .condition(op =>
 *     op.and([
 *       op.eq('status', 'DECOMMISSIONED'),
 *       op.eq('occupants', 0),
 *       op.lt('securityIncidents', 1)
 *     ])
 *   )
 *   .returnValues('ALL_OLD')
 *   .execute();
 * ```
 */
export class DeleteBuilder {
  private options: DeleteOptions = {
    returnValues: "ALL_OLD",
  };
  private readonly executor: DeleteExecutor;
  private readonly tableName: string;
  private readonly key: PrimaryKeyWithoutExpression;

  constructor(executor: DeleteExecutor, tableName: string, key: PrimaryKeyWithoutExpression) {
    this.executor = executor;
    this.tableName = tableName;
    this.key = key;
  }

  /**
   * Adds a condition that must be satisfied for the delete operation to succeed.
   *
   * @example
   * ```typescript
   * // Ensure dinosaur can be safely removed
   * builder.condition(op =>
   *   op.and([
   *     op.eq('status', 'SEDATED'),
   *     op.eq('location', 'MEDICAL_BAY'),
   *     op.attributeExists('lastCheckup')
   *   ])
   * );
   *
   * // Verify habitat is empty
   * builder.condition(op =>
   *   op.and([
   *     op.eq('occupants', 0),
   *     op.eq('maintenanceStatus', 'COMPLETE'),
   *     op.not(op.attributeExists('activeAlerts'))
   *   ])
   * );
   * ```
   *
   * @param condition - Either a Condition object or a callback function that builds the condition
   * @returns The builder instance for method chaining
   */
  public condition<T extends DynamoItem>(
    condition: Condition | ((op: ConditionOperator<T>) => Condition),
  ): DeleteBuilder {
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
   * Sets whether to return the item's attribute values before deletion.
   *
   * @example
   * ```ts
   * // Archive dinosaur data before removal
   * const result = await builder
   *   .returnValues('ALL_OLD')
   *   .execute();
   *
   * if (result.item) {
   *   console.log('Removed dinosaur data:', {
   *     species: result.item.species,
   *     age: result.item.age,
   *     lastLocation: result.item.location
   *   });
   * }
   * ```
   *
   * @param returnValues - Use 'ALL_OLD' to return all attributes of the deleted item
   * @returns The builder instance for method chaining
   */
  public returnValues(returnValues: "ALL_OLD"): DeleteBuilder {
    this.options.returnValues = returnValues;
    return this;
  }

  /**
   * Generate the DynamoDB command parameters
   */
  private toDynamoCommand(): DeleteCommandParams {
    const { expression, names, values } = prepareExpressionParams(this.options.condition);

    return {
      tableName: this.tableName,
      key: this.key,
      conditionExpression: expression,
      expressionAttributeNames: names,
      expressionAttributeValues: values,
      returnValues: this.options.returnValues,
    };
  }

  /**
   * Adds this delete operation to a transaction.
   *
   * @example
   * ```ts
   * const transaction = new TransactionBuilder();
   *
   * // Remove dinosaur from old habitat
   * new DeleteBuilder(executor, 'dinosaurs', { id: 'RAPTOR-001' })
   *   .condition(op => op.eq('status', 'SEDATED'))
   *   .withTransaction(transaction);
   *
   * // Update old habitat occupancy
   * new UpdateBuilder(executor, 'habitats', { id: 'PADDOCK-A' })
   *   .add('occupants', -1)
   *   .withTransaction(transaction);
   *
   * // Execute transfer atomically
   * await transaction.execute();
   * ```
   *
   * @param transaction - The transaction builder to add this operation to
   */
  public withTransaction(transaction: TransactionBuilder) {
    const command = this.toDynamoCommand();

    transaction.deleteWithCommand(command);
  }

  /**
   * Executes the delete operation against DynamoDB.
   *
   * @example
   * ```ts
   * // Delete with condition and retrieve old values
   * const result = await new DeleteBuilder(executor, 'myTable', { id: '123' })
   *   .condition(op => op.eq('status', 'INACTIVE'))
   *   .returnValues('ALL_OLD')
   *   .execute();
   *
   * if (result.item) {
   *   console.log('Deleted item:', result.item);
   * }
   * ```
   *
   * @returns A promise that resolves to an object containing the deleted item's attributes (if returnValues is 'ALL_OLD')
   */
  public async execute(): Promise<{ item?: DynamoItem }> {
    const params = this.toDynamoCommand();
    return this.executor(params);
  }

  /**
   * Gets a human-readable representation of the delete command
   * with all expression placeholders replaced by their actual values.
   *
   * @example
   * ```ts
   * const debugInfo = new DeleteBuilder(executor, 'dinosaurs', { id: 'TREX-001' })
   *   .condition(op => op.and([
   *     op.eq('status', 'SEDATED'),
   *     op.eq('location', 'MEDICAL_BAY'),
   *     op.gt('sedationLevel', 8)
   *     op.eq('version', 1),
   *     op.attributeExists('status')
   *   ]))
   *   .debug();
   *
   * console.log('Delete command:', debugInfo);
   * ```
   *
   * @returns A readable representation of the delete command with resolved expressions
   */
  debug(): DynamoItem {
    const command = this.toDynamoCommand();
    return debugCommand(command);
  }
}
