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

export interface PutOptions {
  condition?: Condition;
  returnValues?: "ALL_OLD" | "NONE";
}

export interface PutCommandParams extends DynamoCommandWithExpressions {
  tableName: string;
  item: Record<string, unknown>;
  conditionExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, unknown>;
  returnValues?: "ALL_OLD" | "NONE";
}

type PutExecutor<T extends Record<string, unknown>> = (params: PutCommandParams) => Promise<T>;

export class PutBuilder<T extends Record<string, unknown>> {
  private item: T;
  private options: PutOptions = {};
  private executor: PutExecutor<T>;
  private tableName: string;

  constructor(executor: PutExecutor<T>, item: T, tableName: string) {
    this.executor = executor;
    this.item = item;
    this.tableName = tableName;
  }

  /**
   * Add a condition expression that must be satisfied for the put operation to succeed
   */
  condition(condition: Condition | ((op: ConditionOperator<T>) => Condition)): PutBuilder<T> {
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
   * Set the return values option for the put operation
   *
   * NONE is the default
   */
  returnValues(returnValues: "ALL_OLD" | "NONE"): PutBuilder<T> {
    this.options.returnValues = returnValues;
    return this;
  }

  /**
   * Generate the DynamoDB command parameters
   */
  toDynamoCommand(): PutCommandParams {
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
   * Add this operation to a transaction
   */
  withTransaction(transaction: TransactionBuilder): PutBuilder<T> {
    const command = this.toDynamoCommand();
    transaction.putWithCommand(command);

    return this;
  }

  /**
   * Execute the put operation
   */
  async execute(): Promise<T> {
    const params = this.toDynamoCommand();
    return this.executor(params);
  }

  /**
   * Get a human-readable representation of the put command
   * with all expression placeholders replaced by their actual values.
   * This is useful for debugging complex put operations.
   *
   * @returns A readable representation of the put command
   */
  debug(): Record<string, unknown> {
    const command = this.toDynamoCommand();
    return debugCommand(command);
  }
}
