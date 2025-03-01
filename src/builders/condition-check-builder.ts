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

export interface ConditionCheckCommandParams extends DynamoCommandWithExpressions {
  tableName: string;
  key: PrimaryKeyWithoutExpression;
  conditionExpression: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, unknown>;
}

export class ConditionCheckBuilder {
  private key: PrimaryKeyWithoutExpression;
  private tableName: string;
  private conditionExpression?: Condition;

  constructor(tableName: string, key: PrimaryKeyWithoutExpression) {
    this.tableName = tableName;
    this.key = key;
  }

  /**
   * Add a condition expression that must be satisfied
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
   * Generate the DynamoDB command parameters
   */
  toDynamoCommand(): ConditionCheckCommandParams {
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
   * Add this condition check to a transaction
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
   * Get a human-readable representation of the condition check command
   * with all expression placeholders replaced by their actual values.
   * This is useful for debugging complex condition check operations.
   *
   * @returns A readable representation of the condition check command
   */
  debug(): Record<string, unknown> {
    const command = this.toDynamoCommand();
    return debugCommand(command);
  }
}
