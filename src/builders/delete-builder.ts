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

export interface DeleteOptions {
  condition?: Condition;
  returnValues?: "ALL_OLD";
}

export interface DeleteCommandParams extends DynamoCommandWithExpressions {
  tableName: string;
  key: PrimaryKeyWithoutExpression;
  conditionExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, unknown>;
  returnValues?: "ALL_OLD";
}

type DeleteExecutor = (params: DeleteCommandParams) => Promise<{ item?: Record<string, unknown> }>;

export class DeleteBuilder {
  private options: DeleteOptions = {
    returnValues: "ALL_OLD",
  };
  private executor: DeleteExecutor;
  private tableName: string;
  private key: PrimaryKeyWithoutExpression;

  constructor(executor: DeleteExecutor, tableName: string, key: PrimaryKeyWithoutExpression) {
    this.executor = executor;
    this.tableName = tableName;
    this.key = key;
  }

  /**
   * Add a condition expression that must be satisfied for the delete operation to succeed
   */
  public condition<T extends Record<string, unknown>>(
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
   * Set the return values option for the delete operation
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
   * Add this operation to a transaction
   */
  public withTransaction(transaction: TransactionBuilder) {
    const command = this.toDynamoCommand();

    transaction.deleteWithCommand(command);
  }

  /**
   * Execute the delete operation
   */
  public async execute(): Promise<{ item?: Record<string, unknown> }> {
    const params = this.toDynamoCommand();
    return this.executor(params);
  }

  /**
   * Get a human-readable representation of the delete command
   * with all expression placeholders replaced by their actual values.
   * This is useful for debugging complex delete operations.
   *
   * @returns A readable representation of the delete command
   */
  debug(): Record<string, unknown> {
    const command = this.toDynamoCommand();
    return debugCommand(command);
  }
}
