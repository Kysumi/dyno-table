import type { TransactWriteCommandInput } from "@aws-sdk/lib-dynamodb";
import type { Condition } from "../conditions";
import { prepareExpressionParams } from "../expression";
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

interface IndexConfig {
  partitionKey: string;
  sortKey?: string;
}

export type TransactionExecutor = (params: TransactWriteCommandInput) => Promise<void>;

export class TransactionBuilder {
  private items: TransactionItem[] = [];
  private options: TransactionOptions = {};
  private indexConfig: IndexConfig;
  private executor: TransactionExecutor;

  constructor(executor: TransactionExecutor, indexConfig: IndexConfig) {
    this.executor = executor;
    this.indexConfig = indexConfig;
  }

  /**
   * Checks if an item with the same primary key already exists in the transaction
   * @private
   */
  private checkForDuplicateItem(tableName: string, newItem: Record<string, unknown>): void {
    const pkName = this.indexConfig.partitionKey;
    const skName = this.indexConfig.sortKey || "";

    // Extract the primary key values from the provided key
    const pkValue = newItem[pkName];
    const skValue = skName ? newItem[skName] : undefined;

    if (!pkValue) {
      throw new Error(`Primary key value for '${pkName}' is missing`);
    }

    const duplicateItem = this.items.find((item) => {
      // Get the key from the item based on its type
      let itemKey: Record<string, unknown> | undefined;
      let itemTableName: string | undefined;

      switch (item.type) {
        case "Put":
          itemTableName = item.params.tableName;
          // For Put operations, the key is part of the item
          itemKey = item.params.item;
          break;
        case "Update":
        case "Delete":
        case "ConditionCheck":
          itemTableName = item.params.tableName;
          itemKey = item.params.key;
          break;
      }

      // Check if the table name and keys match
      if (itemTableName === tableName && itemKey) {
        const itemPkValue = itemKey[pkName];
        const itemSkValue = skName ? itemKey[skName] : undefined;

        // Match if partition keys match and either both sort keys match or both are undefined
        if (itemPkValue === pkValue) {
          if (skValue === undefined && itemSkValue === undefined) {
            return true;
          }
          if (skValue !== undefined && itemSkValue !== undefined && skValue === itemSkValue) {
            return true;
          }
        }
      }

      return false;
    });

    if (duplicateItem) {
      throw new Error(
        `Duplicate item detected in transaction: Table=${tableName}, ${pkName}=${String(pkValue)}, ${skName}=${skValue !== undefined ? String(skValue) : "undefined"}. DynamoDB transactions do not allow multiple operations on the same item.`,
      );
    }
  }

  /**
   * Add a put operation to the transaction
   */
  put<T extends Record<string, unknown>>(tableName: string, item: T, condition?: Condition): TransactionBuilder {
    // Check for duplicate item
    this.checkForDuplicateItem(tableName, item);

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
    // Check for duplicate item
    this.checkForDuplicateItem(command.tableName, command.item);

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
    // Check for duplicate item
    this.checkForDuplicateItem(tableName, key);

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
    // Check for duplicate item
    this.checkForDuplicateItem(command.tableName, command.key);

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
    // Check for duplicate item
    this.checkForDuplicateItem(tableName, key);

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
    // Check for duplicate item
    this.checkForDuplicateItem(command.tableName, command.key);

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
    // Check for duplicate item
    this.checkForDuplicateItem(tableName, key);

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
    // Check for duplicate item
    this.checkForDuplicateItem(command.tableName, command.key);

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
      await this.executor(params);
    } catch (error) {
      console.log(this.debug());
      console.error("Error executing transaction:", error);
      throw error;
    }
  }
}
