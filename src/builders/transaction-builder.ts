import type { DynamoDBDocument, TransactWriteCommandInput } from "@aws-sdk/lib-dynamodb";
import type { Condition } from "../conditions";
import { buildExpression, prepareExpressionParams } from "../expression";
import type { PrimaryKeyWithoutExpression } from "../conditions";
import type { PutCommandParams } from "./put-builder";
import type { UpdateCommandParams } from "./update-builder";
import type { DeleteCommandParams } from "./delete-builder";
import type { ConditionCheckCommandParams } from "./condition-check-builder";
import { debugTransaction } from "../utils/debug-transaction";

export type TransactionItem =
  | { type: "Put"; params: PutCommandParams }
  | { type: "Update"; params: UpdateCommandParams }
  | { type: "Delete"; params: DeleteCommandParams }
  | { type: "ConditionCheck"; params: ConditionCheckCommandParams };

export interface TransactionOptions {
  clientRequestToken?: string;
  returnConsumedCapacity?: "INDEXES" | "TOTAL" | "NONE";
  returnItemCollectionMetrics?: "SIZE" | "NONE";
}

export class TransactionBuilder {
  private items: TransactionItem[] = [];
  private dynamoClient: DynamoDBDocument;
  private options: TransactionOptions = {};

  constructor(client: DynamoDBDocument) {
    this.dynamoClient = client;
  }

  /**
   * Add a put operation to the transaction
   */
  put<T extends Record<string, unknown>>(tableName: string, item: T, condition?: Condition): TransactionBuilder {
    const transactionItem: TransactionItem = {
      type: "Put",
      params: {
        tableName,
        item,
      },
    };

    if (condition) {
      const { expression, names, values } = prepareExpressionParams(condition);
      transactionItem.params.conditionExpression = expression;
      transactionItem.params.expressionAttributeNames = names;
      transactionItem.params.expressionAttributeValues = values;
    }

    this.items.push(transactionItem);
    return this;
  }

  /**
   * Add a put operation to the transaction using a command object
   */
  putWithCommand(command: PutCommandParams): TransactionBuilder {
    const transactionItem: TransactionItem = {
      type: "Put",
      params: command,
    };

    this.items.push(transactionItem);
    return this;
  }

  /**
   * Add a delete operation to the transaction
   */
  delete(tableName: string, key: PrimaryKeyWithoutExpression, condition?: Condition): TransactionBuilder {
    const transactionItem: TransactionItem = {
      type: "Delete",
      params: {
        tableName,
        key: {
          pk: key.pk,
          sk: key.sk,
        },
      },
    };

    if (condition) {
      const { expression, names, values } = prepareExpressionParams(condition);
      transactionItem.params.conditionExpression = expression;
      transactionItem.params.expressionAttributeNames = names;
      transactionItem.params.expressionAttributeValues = values;
    }

    this.items.push(transactionItem);
    return this;
  }

  /**
   * Add a delete operation to the transaction using a command object
   */
  deleteWithCommand(command: DeleteCommandParams): TransactionBuilder {
    const transactionItem: TransactionItem = {
      type: "Delete",
      params: command,
    };
    this.items.push(transactionItem);
    return this;
  }

  /**
   * Add an update operation to the transaction
   */
  update<T extends Record<string, unknown>>(
    tableName: string,
    key: PrimaryKeyWithoutExpression,
    updateExpression: string,
    expressionAttributeNames?: Record<string, string>,
    expressionAttributeValues?: Record<string, unknown>,
    condition?: Condition,
  ): TransactionBuilder {
    const transactionItem: TransactionItem = {
      type: "Update",
      params: {
        tableName,
        key: {
          pk: key.pk,
          sk: key.sk,
        },
        updateExpression,
        expressionAttributeNames,
        expressionAttributeValues,
      },
    };

    if (condition) {
      const { expression, names, values } = prepareExpressionParams(condition);
      transactionItem.params.conditionExpression = expression;

      // Merge the condition expression attribute names and values with the update ones
      transactionItem.params.expressionAttributeNames = {
        ...transactionItem.params.expressionAttributeNames,
        ...names,
      };

      transactionItem.params.expressionAttributeValues = {
        ...transactionItem.params.expressionAttributeValues,
        ...values,
      };
    }

    this.items.push(transactionItem);
    return this;
  }

  /**
   * Add an update operation to the transaction using a command object
   */
  updateWithCommand(command: UpdateCommandParams): TransactionBuilder {
    const transactionItem: TransactionItem = {
      type: "Update",
      params: command,
    };

    this.items.push(transactionItem);
    return this;
  }

  /**
   * Add a condition check operation to the transaction
   */
  conditionCheck(tableName: string, key: PrimaryKeyWithoutExpression, condition: Condition): TransactionBuilder {
    const { expression, names, values } = prepareExpressionParams(condition);

    if (!expression) {
      throw new Error("Failed to generate condition expression");
    }

    const transactionItem: TransactionItem = {
      type: "ConditionCheck",
      params: {
        tableName,
        key: {
          pk: key.pk,
          sk: key.sk,
        },
        conditionExpression: expression,
        expressionAttributeNames: names,
        expressionAttributeValues: values,
      },
    };

    this.items.push(transactionItem);
    return this;
  }

  /**
   * Add a condition check operation to the transaction using a command object
   */
  conditionCheckWithCommand(command: ConditionCheckCommandParams): TransactionBuilder {
    const transactionItem: TransactionItem = {
      type: "ConditionCheck",
      params: command,
    };
    this.items.push(transactionItem);
    return this;
  }

  /**
   * Set options for the transaction
   */
  withOptions(options: TransactionOptions): TransactionBuilder {
    this.options = { ...this.options, ...options };
    return this;
  }

  /**
   * Get a human-readable representation of the transaction items
   * with all expression placeholders replaced by their actual values.
   * This is useful for debugging complex transactions.
   *
   * @returns An array of readable representations of the transaction items
   */
  debug(): Record<string, unknown>[] {
    return debugTransaction(this.items);
  }

  /**
   * Execute the transaction
   */
  async execute(): Promise<void> {
    if (this.items.length === 0) {
      throw new Error("No transaction items specified");
    }

    const transactItems = this.items.map((item) => {
      switch (item.type) {
        case "Put":
          return {
            Put: {
              TableName: item.params.tableName,
              Item: item.params.item,
              ConditionExpression: item.params.conditionExpression,
              ExpressionAttributeNames: item.params.expressionAttributeNames,
              ExpressionAttributeValues: item.params.expressionAttributeValues,
            },
          };
        case "Delete":
          return {
            Delete: {
              TableName: item.params.tableName,
              Key: item.params.key,
              ConditionExpression: item.params.conditionExpression,
              ExpressionAttributeNames: item.params.expressionAttributeNames,
              ExpressionAttributeValues: item.params.expressionAttributeValues,
            },
          };
        case "Update":
          return {
            Update: {
              TableName: item.params.tableName,
              Key: item.params.key,
              UpdateExpression: item.params.updateExpression,
              ConditionExpression: item.params.conditionExpression,
              ExpressionAttributeNames: item.params.expressionAttributeNames,
              ExpressionAttributeValues: item.params.expressionAttributeValues,
            },
          };
        case "ConditionCheck":
          return {
            ConditionCheck: {
              TableName: item.params.tableName,
              Key: item.params.key,
              ConditionExpression: item.params.conditionExpression,
              ExpressionAttributeNames: item.params.expressionAttributeNames,
              ExpressionAttributeValues: item.params.expressionAttributeValues,
            },
          };
        default: {
          // This should never happen as we've covered all cases in the union type
          const exhaustiveCheck: never = item;
          throw new Error(`Unsupported transaction item type: ${String(exhaustiveCheck)}`);
        }
      }
    });

    const params: TransactWriteCommandInput = {
      TransactItems: transactItems,
      ClientRequestToken: this.options.clientRequestToken,
      ReturnConsumedCapacity: this.options.returnConsumedCapacity,
      ReturnItemCollectionMetrics: this.options.returnItemCollectionMetrics,
    };

    try {
      await this.dynamoClient.transactWrite(params);
    } catch (error) {
      console.error("Error executing transaction:", error);
      throw error;
    }
  }
}
