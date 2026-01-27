import type {
  DynamoDBDocument,
  QueryCommandInput,
  ScanCommandInput,
  TransactWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { BatchBuilder } from "./builders/batch-builder";
import type { DeleteCommandParams, PutCommandParams, UpdateCommandParams } from "./builders/builder-types";
import { ConditionCheckBuilder } from "./builders/condition-check-builder";
import { DeleteBuilder } from "./builders/delete-builder";
import { GetBuilder, type GetCommandParams } from "./builders/get-builder";
import { PutBuilder } from "./builders/put-builder";
import { QueryBuilder, type QueryOptions } from "./builders/query-builder";
import type { ScanOptions } from "./builders/scan-builder";
import { ScanBuilder } from "./builders/scan-builder";
import { TransactionBuilder, type TransactionOptions } from "./builders/transaction-builder";
import type { Path } from "./builders/types";
import { UpdateBuilder } from "./builders/update-builder";
import {
  and,
  beginsWith,
  between,
  type Condition,
  type ConditionOperator,
  type ExpressionParams,
  eq,
  gt,
  gte,
  type KeyConditionOperator,
  lt,
  lte,
  type PrimaryKey,
  type PrimaryKeyWithoutExpression,
} from "./conditions";
import { buildExpression, generateAttributeName } from "./expression";
import type { BatchWriteOperation } from "./operation-types";
import type { DynamoItem, Index, TableConfig } from "./types";
import { chunkArray } from "./utils/chunk-array";
import { ConfigurationErrors, OperationErrors } from "./utils/error-factory";

const DDB_BATCH_WRITE_LIMIT = 25;
const DDB_BATCH_GET_LIMIT = 100;
const _DDB_TRANSACT_GET_LIMIT = 100;
const _DDB_TRANSACT_WRITE_LIMIT = 100;

export class Table<TConfig extends TableConfig = TableConfig> {
  private readonly dynamoClient: DynamoDBDocument;
  readonly tableName: string;
  /**
   * The column name of the partitionKey for the Table
   */
  readonly partitionKey: string;
  /**
   * The column name of the sortKey for the Table
   */
  readonly sortKey?: string;
  /**
   * The Global Secondary Indexes that are configured on this table
   */
  readonly gsis: Record<string, Index>;

  constructor(config: TConfig) {
    this.dynamoClient = config.client;

    this.tableName = config.tableName;
    this.partitionKey = config.indexes.partitionKey;
    this.sortKey = config.indexes.sortKey;

    this.gsis = config.indexes.gsis || {};
  }

  private getIndexAttributeNames(): string[] {
    const names = new Set<string>();

    for (const gsi of Object.values(this.gsis)) {
      names.add(gsi.partitionKey);
      if (gsi.sortKey) {
        names.add(gsi.sortKey);
      }
    }

    return Array.from(names);
  }

  protected createKeyForPrimaryIndex(keyCondition: PrimaryKeyWithoutExpression): Record<string, unknown> {
    const primaryCondition = { [this.partitionKey]: keyCondition.pk };

    //  If the table has a sort key, we need to add it to the condition
    if (this.sortKey) {
      if (!keyCondition.sk) {
        throw ConfigurationErrors.sortKeyRequired(this.tableName, this.partitionKey, this.sortKey);
      }
      // Apply the sort key condition
      primaryCondition[this.sortKey] = keyCondition.sk;
    }

    return primaryCondition;
  }

  /**
   * Creates a new item in the table, it will fail if the item already exists.
   *
   * By default, this method returns the input values passed to the create operation
   * upon successful creation.
   *
   * You can customise the return behaviour by chaining the `.returnValues()` method:
   *
   * @param item The item to create
   * @returns A PutBuilder instance for chaining additional conditions and executing the create operation
   *
   * @example
   * ```ts
   * // Create with default behavior (returns input values)
   * const result = await table.create({
   *   id: 'user-123',
   *   name: 'John Doe',
   *   email: 'john@example.com'
   * }).execute();
   * console.log(result); // Returns the input object
   *
   * // Create with no return value for better performance
   * await table.create(userData).returnValues('NONE').execute();
   *
   * // Create and get fresh data from dynamodb using a strongly consistent read
   * const freshData = await table.create(userData).returnValues('CONSISTENT').execute();
   *
   * // Create and get previous values (if the item was overwritten)
   * const oldData = await table.create(userData).returnValues('ALL_OLD').execute();
   * ```
   */
  create<T extends DynamoItem>(item: T): PutBuilder<T> {
    return this.put(item)
      .condition((op: ConditionOperator<T>) => op.attributeNotExists(this.partitionKey as Path<T>))
      .returnValues("INPUT");
  }

  get<T extends DynamoItem>(keyCondition: PrimaryKeyWithoutExpression): GetBuilder<T> {
    const indexAttributeNames = this.getIndexAttributeNames();
    const executor = async (params: GetCommandParams): Promise<{ item: T | undefined }> => {
      try {
        const result = await this.dynamoClient.get({
          TableName: params.tableName,
          Key: this.createKeyForPrimaryIndex(keyCondition),
          ProjectionExpression: params.projectionExpression,
          ExpressionAttributeNames: params.expressionAttributeNames,
          ConsistentRead: params.consistentRead,
        });

        return {
          item: result.Item ? (result.Item as T) : undefined,
        };
      } catch (error) {
        throw OperationErrors.getFailed(params.tableName, keyCondition, error instanceof Error ? error : undefined);
      }
    };

    return new GetBuilder<T>(executor, keyCondition, this.tableName, indexAttributeNames);
  }

  /**
   * Updates an item in the table
   *
   * @param item The item to update
   * @returns A PutBuilder instance for chaining conditions and executing the put operation
   */
  put<T extends DynamoItem>(item: T): PutBuilder<T> {
    // Define the executor function that will be called when execute() is called on the builder
    const executor = async (params: PutCommandParams): Promise<T> => {
      try {
        const result = await this.dynamoClient.put({
          TableName: params.tableName,
          Item: params.item,
          ConditionExpression: params.conditionExpression,
          ExpressionAttributeNames: params.expressionAttributeNames,
          ExpressionAttributeValues: params.expressionAttributeValues,
          // CONSISTENT and INPUT are not valid ReturnValues for DDB, so we set NONE as we are not interested in its
          // response and will be handling these cases separately
          ReturnValues:
            params.returnValues === "CONSISTENT" || params.returnValues === "INPUT" ? "NONE" : params.returnValues,
        });

        // Handle different return value options
        if (params.returnValues === "INPUT") {
          // Return the input values that were passed to the operation
          // this is fairly common for create operations when using entities
          return params.item as T;
        }

        // Reload the item from the DB, so the user gets the most correct representation of the item from the DB
        if (params.returnValues === "CONSISTENT") {
          const getResult = await this.dynamoClient.get({
            TableName: params.tableName,
            Key: this.createKeyForPrimaryIndex({
              pk: params.item[this.partitionKey] as string,
              ...(this.sortKey && { sk: params.item[this.sortKey] as string }),
            }),
            ConsistentRead: true,
          });

          return getResult.Item as T;
        }

        return result.Attributes as T;
      } catch (error) {
        throw OperationErrors.putFailed(params.tableName, params.item, error instanceof Error ? error : undefined);
      }
    };

    return new PutBuilder<T>(executor, item, this.tableName);
  }

  /**
   * Creates a query builder for complex queries
   * If useIndex is called on the returned QueryBuilder, it will use the GSI configuration
   */
  query<T extends DynamoItem>(keyCondition: PrimaryKey): QueryBuilder<T, TConfig> {
    const indexAttributeNames = this.getIndexAttributeNames();
    // Default to main table's partition and sort keys
    const pkAttributeName = this.partitionKey;
    const skAttributeName = this.sortKey;

    // Create the key condition expression using the main table's keys
    let keyConditionExpression = eq(pkAttributeName, keyCondition.pk);

    if (keyCondition.sk) {
      if (!skAttributeName) {
        throw ConfigurationErrors.sortKeyNotDefined(this.tableName, pkAttributeName);
      }

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

      // Create a key condition expression
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
          throw ConfigurationErrors.gsiNotFound(gsiName, this.tableName, Object.keys(this.gsis));
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
          throw ConfigurationErrors.pkExtractionFailed(this.tableName, options.indexName, originalKeyCondition);
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
        throw OperationErrors.queryFailed(
          this.tableName,
          { indexName, keyConditionExpression, filterExpression },
          error instanceof Error ? error : undefined,
        );
      }
    };

    return new QueryBuilder<T, TConfig>(executor, keyConditionExpression, indexAttributeNames);
  }

  /**
   * Creates a scan builder for scanning the entire table
   * Use this when you need to:
   * - Process all items in a table
   * - Apply filters to a large dataset
   * - Use a GSI for scanning
   *
   * @returns A ScanBuilder instance for chaining operations
   */
  scan<T extends DynamoItem>(): ScanBuilder<T, TConfig> {
    const executor = async (options: ScanOptions) => {
      // Implementation of the scan execution logic
      const expressionParams: ExpressionParams = {
        expressionAttributeNames: {},
        expressionAttributeValues: {},
        valueCounter: { count: 0 },
      };

      let filterExpression: string | undefined;
      if (options.filter) {
        filterExpression = buildExpression(options.filter, expressionParams);
      }

      const projectionExpression = options.projection
        ?.map((p) => generateAttributeName(expressionParams, p))
        .join(", ");

      const { expressionAttributeNames, expressionAttributeValues } = expressionParams;
      const { indexName, limit, consistentRead, lastEvaluatedKey } = options;

      const params: ScanCommandInput = {
        TableName: this.tableName,
        FilterExpression: filterExpression,
        ExpressionAttributeNames:
          Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
        ExpressionAttributeValues:
          Object.keys(expressionAttributeValues).length > 0 ? expressionAttributeValues : undefined,
        IndexName: indexName,
        Limit: limit,
        ConsistentRead: consistentRead,
        ProjectionExpression: projectionExpression,
        ExclusiveStartKey: lastEvaluatedKey,
      };

      try {
        const result = await this.dynamoClient.scan(params);
        return {
          items: result.Items as T[],
          lastEvaluatedKey: result.LastEvaluatedKey,
        };
      } catch (error) {
        throw OperationErrors.scanFailed(
          this.tableName,
          { indexName: options.indexName, filterExpression },
          error instanceof Error ? error : undefined,
        );
      }
    };

    return new ScanBuilder<T, TConfig>(executor);
  }

  delete(keyCondition: PrimaryKeyWithoutExpression): DeleteBuilder {
    const executor = async (params: DeleteCommandParams) => {
      try {
        const result = await this.dynamoClient.delete({
          TableName: params.tableName,
          Key: this.createKeyForPrimaryIndex(keyCondition),
          ConditionExpression: params.conditionExpression,
          ExpressionAttributeNames: params.expressionAttributeNames,
          ExpressionAttributeValues: params.expressionAttributeValues,
          ReturnValues: params.returnValues,
        });
        return {
          item: result.Attributes as DynamoItem,
        };
      } catch (error) {
        throw OperationErrors.deleteFailed(params.tableName, keyCondition, error instanceof Error ? error : undefined);
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
  update<T extends DynamoItem>(keyCondition: PrimaryKeyWithoutExpression): UpdateBuilder<T> {
    const executor = async (params: UpdateCommandParams) => {
      try {
        const result = await this.dynamoClient.update({
          TableName: params.tableName,
          Key: this.createKeyForPrimaryIndex(keyCondition),
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
        throw OperationErrors.updateFailed(params.tableName, keyCondition, error instanceof Error ? error : undefined);
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
   * Creates a batch builder for performing multiple operations efficiently with optional type inference
   *
   * @example Basic Usage
   * ```typescript
   * const batch = table.batchBuilder();
   *
   * // Add operations
   * userRepo.create(newUser).withBatch(batch);
   * orderRepo.get({ id: 'order-1' }).withBatch(batch);
   *
   * // Execute operations
   * const result = await batch.execute();
   * ```
   *
   * @example Typed Usage
   * ```typescript
   * // Define entity types for the batch
   * const batch = table.batchBuilder<{
   *   User: UserEntity;
   *   Order: OrderEntity;
   *   Product: ProductEntity;
   * }>();
   *
   * // Add operations with type information
   * userRepo.create(newUser).withBatch(batch, 'User');
   * orderRepo.get({ id: 'order-1' }).withBatch(batch, 'Order');
   * productRepo.delete({ id: 'old-product' }).withBatch(batch, 'Product');
   *
   * // Execute and get typed results
   * const result = await batch.execute();
   * const users: UserEntity[] = result.reads.itemsByType.User;
   * const orders: OrderEntity[] = result.reads.itemsByType.Order;
   * ```
   */
  batchBuilder<TEntities extends Record<string, DynamoItem> = Record<string, DynamoItem>>(): BatchBuilder<TEntities> {
    // Create executor functions for batch operations
    const batchWriteExecutor = async (operations: Array<BatchWriteOperation<DynamoItem>>) => {
      return this.batchWrite(operations);
    };

    const batchGetExecutor = async (keys: Array<PrimaryKeyWithoutExpression>) => {
      return this.batchGet(keys);
    };

    // Create a batch builder with the executors and table's index configuration
    return new BatchBuilder<TEntities>(batchWriteExecutor, batchGetExecutor, {
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
  async transaction(
    callback: (tx: TransactionBuilder) => Promise<void> | void,
    options?: TransactionOptions,
  ): Promise<void> {
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
  async batchGet<T extends DynamoItem>(
    keys: Array<PrimaryKeyWithoutExpression>,
  ): Promise<{ items: T[]; unprocessedKeys: PrimaryKeyWithoutExpression[] }> {
    const allItems: T[] = [];
    const allUnprocessedKeys: PrimaryKeyWithoutExpression[] = [];

    // Process each chunk from the generator
    for (const chunk of chunkArray(keys, DDB_BATCH_GET_LIMIT)) {
      const formattedKeys = chunk.map((key) => ({
        [this.partitionKey]: key.pk,
        ...(this.sortKey ? { [this.sortKey]: key.sk } : {}),
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
          pk: key[this.partitionKey] as string,
          sk: this.sortKey ? (key[this.sortKey] as string) : undefined,
        }));

        if (unprocessedKeys.length > 0) {
          allUnprocessedKeys.push(...unprocessedKeys);
        }
      } catch (error) {
        throw OperationErrors.batchGetFailed(
          this.tableName,
          { requestedKeys: keys.length },
          error instanceof Error ? error : undefined,
        );
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
  async batchWrite<T extends DynamoItem>(
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
            Key: this.createKeyForPrimaryIndex(operation.key),
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
                  pk: request.DeleteRequest.Key[this.partitionKey] as string,
                  sk: this.sortKey ? (request.DeleteRequest.Key[this.sortKey] as string) : undefined,
                },
              };
            }

            // This should never happen, but TypeScript needs a fallback
            throw new Error("Invalid unprocessed item format returned from DynamoDB");
          });

          allUnprocessedItems.push(...unprocessedItems);
        }
      } catch (error) {
        throw OperationErrors.batchWriteFailed(
          this.tableName,
          { requestedOperations: operations.length },
          error instanceof Error ? error : undefined,
        );
      }
    }

    return {
      unprocessedItems: allUnprocessedItems,
    };
  }
}
