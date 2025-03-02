import type { DynamoDBDocument, QueryCommandInput } from "@aws-sdk/lib-dynamodb";
import type { Index, TableConfig } from "./types";
import {
  and,
  beginsWith,
  between,
  eq,
  gt,
  gte,
  lt,
  lte,
  type Condition,
  type ConditionOperator,
  type ExpressionParams,
  type KeyConditionOperator,
  type PrimaryKey,
  type PrimaryKeyWithoutExpression,
} from "./conditions";
import { buildExpression, generateAttributeName } from "./expression";
import { QueryBuilder, type QueryOptions } from "./builders/query-builder";
import { PutBuilder, type PutCommandParams } from "./builders/put-builder";
import { DeleteBuilder, type DeleteCommandParams } from "./builders/delete-builder";
import { UpdateBuilder, type UpdateCommandParams } from "./builders/update-builder";
import type { Path } from "./builders/types";
import { TransactionBuilder, type TransactionOptions } from "./builders/transaction-builder";
import type { BatchWriteOperation } from "./operation-types";
import { chunkArray } from "./utils/chunk-array";
import { ConditionCheckBuilder } from "./builders/condition-check-builder";
import { debugCommand } from "./utils/debug-expression";
import { GetBuilder, type GetCommandParams } from "./builders/get-builder";
import type { TransactWriteCommandInput } from "@aws-sdk/lib-dynamodb";

const DDB_BATCH_WRITE_LIMIT = 25;
const DDB_BATCH_GET_LIMIT = 100;
const DDB_TRANSACT_GET_LIMIT = 100;
const DDB_TRANSACT_WRITE_LIMIT = 100;

export class Table<TConfig extends TableConfig = TableConfig> {
  private dynamoClient: DynamoDBDocument;
  readonly tableName: string;
  readonly partitionKey: string;
  readonly sortKey?: string;
  readonly gsis: Record<string, Index>;

  constructor(config: TConfig) {
    this.dynamoClient = config.client;

    this.tableName = config.tableName;
    this.partitionKey = config.indexes.partitionKey;
    this.sortKey = config.indexes.sortKey;

    this.gsis = config.indexes.gsis || {};
  }

  /**
   * Creates a new item in the table, it will fail if the item already exists
   *
   * @param item The item to create
   * @returns A PutBuilder instance for chaining conditions and executing the put operation
   */
  create<T extends Record<string, unknown>>(item: T): PutBuilder<T> {
    return this.put(item).condition((op: ConditionOperator<T>) => op.attributeNotExists(this.partitionKey as Path<T>));
  }

  get<T extends Record<string, unknown>>(keyCondition: PrimaryKeyWithoutExpression): GetBuilder<T> {
    const executor = async (params: GetCommandParams): Promise<{ item: T | undefined }> => {
      try {
        const result = await this.dynamoClient.get({
          TableName: params.tableName,
          Key: params.key,
          ProjectionExpression: params.projectionExpression,
          ExpressionAttributeNames: params.expressionAttributeNames,
          ConsistentRead: params.consistentRead,
        });

        return {
          item: result.Item ? (result.Item as T) : undefined,
        };
      } catch (error) {
        console.error("Error getting item:", error);
        throw error;
      }
    };

    return new GetBuilder<T>(executor, keyCondition, this.tableName);
  }

  /**
   * Updates an item in the table
   *
   * @param item The item to update
   * @returns A PutBuilder instance for chaining conditions and executing the put operation
   */
  put<T extends Record<string, unknown>>(item: T): PutBuilder<T> {
    // Define the executor function that will be called when execute() is called on the builder
    const executor = async (params: PutCommandParams): Promise<T> => {
      try {
        await this.dynamoClient.put({
          TableName: params.tableName,
          Item: params.item,
          ConditionExpression: params.conditionExpression,
          ExpressionAttributeNames: params.expressionAttributeNames,
          ExpressionAttributeValues: params.expressionAttributeValues,
          ReturnValues: params.returnValues,
        });
        return params.item as T;
      } catch (error) {
        console.error("Error creating item:", error);
        throw error;
      }
    };

    return new PutBuilder<T>(executor, item, this.tableName);
  }

  /**
   * Creates a query builder for complex queries
   * If useIndex is called on the returned QueryBuilder, it will use the GSI configuration
   */
  query<T extends Record<string, unknown>>(keyCondition: PrimaryKey): QueryBuilder<T, TConfig> {
    // Default to main table's partition and sort keys
    const pkAttributeName = "pk";
    const skAttributeName = "sk";

    // Create the key condition expression using the main table's keys
    let keyConditionExpression = eq(pkAttributeName, keyCondition.pk);

    if (keyCondition.sk) {
      const keyConditionOperator: KeyConditionOperator = {
        eq: (value) => eq(skAttributeName, value),
        lt: (value) => lt(skAttributeName, value),
        lte: (value) => lte(skAttributeName, value),
        gt: (value) => gt(skAttributeName, value),
        gte: (value) => gte(skAttributeName, value),
        between: (lower, upper) => between(skAttributeName, lower, upper),
        beginsWith: (value) => beginsWith(skAttributeName, value),
        and: (...conditions) => and(...conditions),
      };

      const skCondition = keyCondition.sk(keyConditionOperator);

      // Create key condition expression
      keyConditionExpression = and(eq(pkAttributeName, keyCondition.pk), skCondition);
    }

    const executor = async (originalKeyCondition: Condition, options: QueryOptions) => {
      // Start with the original key condition
      let finalKeyCondition = originalKeyCondition;

      // If an index is specified, we need to adjust the query based on the GSI configuration
      if (options.indexName) {
        const gsiName = String(options.indexName);
        const gsi = this.gsis[gsiName];

        if (!gsi) {
          throw new Error(`GSI with name "${gsiName}" does not exist on table "${this.tableName}"`);
        }

        // For GSI queries, we need to rebuild the key condition expression using the GSI's keys
        const gsiPkAttributeName = gsi.partitionKey;
        const gsiSkAttributeName = gsi.sortKey;

        // Extract the partition key value from the original condition
        // This is a simplification - in a real implementation, you might need more complex logic
        // to extract the correct values from the original condition
        let pkValue: unknown | undefined;
        let skValue: unknown | undefined;
        let extractedSkCondition: Condition | undefined;

        // Extract values from the original key condition
        if (originalKeyCondition.type === "eq") {
          pkValue = originalKeyCondition.value;
        } else if (originalKeyCondition.type === "and" && originalKeyCondition.conditions) {
          // Find the partition key condition
          const pkCondition = originalKeyCondition.conditions.find(
            (c) => c.type === "eq" && c.attr === pkAttributeName,
          );
          if (pkCondition && pkCondition.type === "eq") {
            pkValue = pkCondition.value;
          }

          // Find any sort key conditions
          const skConditions = originalKeyCondition.conditions.filter((c) => c.attr === skAttributeName);
          if (skConditions.length > 0) {
            if (skConditions.length === 1) {
              extractedSkCondition = skConditions[0];
              if (extractedSkCondition && extractedSkCondition.type === "eq") {
                skValue = extractedSkCondition.value;
              }
            } else if (skConditions.length > 1) {
              extractedSkCondition = and(...skConditions);
            }
          }
        }

        if (!pkValue) {
          throw new Error("Could not extract partition key value from key condition");
        }

        // Build a new key condition expression for the GSI
        let gsiKeyCondition = eq(gsiPkAttributeName, pkValue);

        // Add sort key condition if applicable
        if (skValue && gsiSkAttributeName) {
          gsiKeyCondition = and(gsiKeyCondition, eq(gsiSkAttributeName, skValue));
        } else if (extractedSkCondition && gsiSkAttributeName) {
          // Replace the attribute name in the condition with the GSI sort key
          // We need to create a deep copy to avoid modifying the original condition
          // This is a simplified approach - a real implementation would need to handle all condition types
          if (extractedSkCondition.attr === skAttributeName) {
            const updatedSkCondition = {
              ...extractedSkCondition,
              attr: gsiSkAttributeName,
            };
            gsiKeyCondition = and(gsiKeyCondition, updatedSkCondition);
          } else {
            // If the attribute name doesn't match the table's sort key, use it as is
            gsiKeyCondition = and(gsiKeyCondition, extractedSkCondition);
          }
        }

        // Use the GSI-specific key condition
        finalKeyCondition = gsiKeyCondition;
      }

      // Implementation of the query execution logic
      const expressionParams: ExpressionParams = {
        expressionAttributeNames: {},
        expressionAttributeValues: {},
        valueCounter: { count: 0 },
      };

      const keyConditionExpression = buildExpression(finalKeyCondition, expressionParams);

      let filterExpression: string | undefined;
      if (options.filter) {
        filterExpression = buildExpression(options.filter, expressionParams);
      }

      const projectionExpression = options.projection
        ?.map((p) => generateAttributeName(expressionParams, p))
        .join(", ");

      const { expressionAttributeNames, expressionAttributeValues } = expressionParams;
      const { indexName, limit, consistentRead, scanIndexForward, lastEvaluatedKey } = options;

      const params: QueryCommandInput = {
        TableName: this.tableName,
        KeyConditionExpression: keyConditionExpression,
        FilterExpression: filterExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        IndexName: indexName,
        Limit: limit,
        ConsistentRead: consistentRead,
        ScanIndexForward: scanIndexForward,
        ProjectionExpression: projectionExpression,
        ExclusiveStartKey: lastEvaluatedKey,
      };

      try {
        const result = await this.dynamoClient.query(params);
        return {
          items: result.Items as T[],
          lastEvaluatedKey: result.LastEvaluatedKey,
        };
      } catch (error) {
        console.log(debugCommand(params));
        console.error("Error querying items:", error);
        throw error;
      }
    };

    return new QueryBuilder<T, TConfig>(executor, keyConditionExpression);
  }

  delete(keyCondition: PrimaryKeyWithoutExpression): DeleteBuilder {
    const executor = async (params: DeleteCommandParams) => {
      try {
        const result = await this.dynamoClient.delete({
          TableName: params.tableName,
          Key: params.key,
          ConditionExpression: params.conditionExpression,
          ExpressionAttributeNames: params.expressionAttributeNames,
          ExpressionAttributeValues: params.expressionAttributeValues,
          ReturnValues: params.returnValues,
        });
        return {
          item: result.Attributes as Record<string, unknown>,
        };
      } catch (error) {
        console.error("Error deleting item:", error);
        throw error;
      }
    };

    return new DeleteBuilder(executor, this.tableName, keyCondition);
  }

  /**
   * Updates an item in the table
   *
   * @param keyCondition The primary key of the item to update
   * @returns An UpdateBuilder instance for chaining update operations and conditions
   */
  update<T extends Record<string, unknown>>(keyCondition: PrimaryKeyWithoutExpression): UpdateBuilder<T> {
    const executor = async (params: UpdateCommandParams) => {
      try {
        const result = await this.dynamoClient.update({
          TableName: params.tableName,
          Key: params.key,
          UpdateExpression: params.updateExpression,
          ConditionExpression: params.conditionExpression,
          ExpressionAttributeNames: params.expressionAttributeNames,
          ExpressionAttributeValues: params.expressionAttributeValues,
          ReturnValues: params.returnValues,
        });
        return {
          item: result.Attributes as T,
        };
      } catch (error) {
        console.error("Error updating item:", error);
        throw error;
      }
    };

    return new UpdateBuilder<T>(executor, this.tableName, keyCondition);
  }

  /**
   * Creates a transaction builder for performing multiple operations atomically
   */
  transactionBuilder(): TransactionBuilder {
    // Create an executor function for the transaction
    const executor = async (params: TransactWriteCommandInput): Promise<void> => {
      await this.dynamoClient.transactWrite(params);
    };

    // Create a transaction builder with the executor and table's index configuration
    return new TransactionBuilder(executor, {
      partitionKey: this.partitionKey,
      sortKey: this.sortKey,
    });
  }

  /**
   * Executes a transaction using a callback function
   *
   * @param callback A function that receives a transaction context and performs operations on it
   * @param options Optional transaction options
   * @returns A promise that resolves when the transaction is complete
   */
  transaction<T>(callback: (tx: TransactionBuilder) => Promise<T>, options?: TransactionOptions): Promise<T> {
    const executor = async (): Promise<T> => {
      // Create an executor function for the transaction
      const transactionExecutor = async (params: TransactWriteCommandInput): Promise<void> => {
        await this.dynamoClient.transactWrite(params);
      };

      // Create a transaction builder with the executor and table's index configuration
      const transaction = new TransactionBuilder(transactionExecutor, {
        partitionKey: this.partitionKey,
        sortKey: this.sortKey,
      });

      if (options) {
        transaction.withOptions(options);
      }

      const result = await callback(transaction);
      await transaction.execute();
      return result;
    };

    return executor();
  }

  /**
   * Creates a condition check operation for use in transactions
   *
   * This is useful for when you require a transaction to succeed only when a specific condition is met on a
   * a record within the database that you are not directly updating.
   *
   * For example, you are updating a record and you want to ensure that another record exists and/or has a specific value before proceeding.
   */
  conditionCheck(keyCondition: PrimaryKeyWithoutExpression): ConditionCheckBuilder {
    return new ConditionCheckBuilder(this.tableName, keyCondition);
  }

  /**
   * Performs a batch get operation to retrieve multiple items at once
   *
   * @param keys Array of primary keys to retrieve
   * @returns A promise that resolves to the retrieved items
   */
  async batchGet<T extends Record<string, unknown>>(
    keys: Array<PrimaryKeyWithoutExpression>,
  ): Promise<{ items: T[]; unprocessedKeys: PrimaryKeyWithoutExpression[] }> {
    const allItems: T[] = [];
    const allUnprocessedKeys: PrimaryKeyWithoutExpression[] = [];

    // Process each chunk from the generator
    for (const chunk of chunkArray(keys, DDB_BATCH_GET_LIMIT)) {
      const formattedKeys = chunk.map((key) => ({
        pk: key.pk,
        sk: key.sk,
      }));

      const params = {
        RequestItems: {
          [this.tableName]: {
            Keys: formattedKeys,
          },
        },
      };

      try {
        const result = await this.dynamoClient.batchGet(params);

        // Add the retrieved items to our result
        if (result.Responses?.[this.tableName]) {
          allItems.push(...(result.Responses[this.tableName] as T[]));
        }

        // Track any unprocessed keys
        const unprocessedKeysArray = result.UnprocessedKeys?.[this.tableName]?.Keys || [];
        const unprocessedKeys = unprocessedKeysArray.map((key) => ({
          pk: key.pk as string,
          sk: key.sk as string,
        }));

        if (unprocessedKeys.length > 0) {
          allUnprocessedKeys.push(...unprocessedKeys);
        }
      } catch (error) {
        console.error("Error in batch get operation:", error);
        throw error;
      }
    }

    return {
      items: allItems,
      unprocessedKeys: allUnprocessedKeys,
    };
  }

  /**
   * Performs a batch write operation to put or delete multiple items at once
   *
   * @param operations Array of put or delete operations
   * @returns A promise that resolves to any unprocessed operations
   */
  async batchWrite<T extends Record<string, unknown>>(
    operations: Array<BatchWriteOperation<T>>,
  ): Promise<{ unprocessedItems: Array<BatchWriteOperation<T>> }> {
    const allUnprocessedItems: Array<BatchWriteOperation<T>> = [];

    // Process each chunk from the generator
    for (const chunk of chunkArray(operations, DDB_BATCH_WRITE_LIMIT)) {
      const writeRequests = chunk.map((operation) => {
        if (operation.type === "put") {
          return {
            PutRequest: {
              Item: operation.item,
            },
          };
        }

        return {
          DeleteRequest: {
            Key: {
              pk: operation.key.pk,
              sk: operation.key.sk,
            },
          },
        };
      });

      const params = {
        RequestItems: {
          [this.tableName]: writeRequests,
        },
      };

      try {
        const result = await this.dynamoClient.batchWrite(params);

        // Track any unprocessed items
        const unprocessedRequestsArray = result.UnprocessedItems?.[this.tableName] || [];

        if (unprocessedRequestsArray.length > 0) {
          const unprocessedItems = unprocessedRequestsArray.map((request) => {
            if (request?.PutRequest?.Item) {
              return {
                type: "put" as const,
                item: request.PutRequest.Item as T,
              };
            }

            if (request?.DeleteRequest?.Key) {
              return {
                type: "delete" as const,
                key: {
                  pk: request.DeleteRequest.Key.pk as string,
                  sk: request.DeleteRequest.Key.sk as string,
                },
              };
            }

            // This should never happen, but TypeScript needs a fallback
            throw new Error("Invalid unprocessed item format returned from DynamoDB");
          });

          allUnprocessedItems.push(...unprocessedItems);
        }
      } catch (error) {
        console.error("Error in batch write operation:", error);
        throw error;
      }
    }

    return {
      unprocessedItems: allUnprocessedItems,
    };
  }
}
