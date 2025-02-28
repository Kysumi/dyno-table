import type {
  DynamoDBDocument,
  DeleteCommandInput,
  PutCommandInput,
  QueryCommandInput,
  UpdateCommandInput,
} from "@aws-sdk/lib-dynamodb";
import type { EntityConfig, IndexDefinition, TableConfig } from "./types";
import { Entity } from "./entity";
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
import { buildExpression, generateAttributeName, prepareExpressionParams } from "./expression";
import { QueryBuilder, type QueryOptions } from "./builders/query-builder";
import { PutBuilder, type PutOptions } from "./builders/put-builder";
import { DeleteBuilder, type DeleteOptions } from "./builders/delete-builder";
import { UpdateBuilder, type UpdateOptions, type UpdateAction } from "./builders/update-builder";
import type { Path } from "./builders/types";

export interface GetBuilder<T> {
  execute: () => Promise<{ item?: T }>;
}

export class Table {
  private dynamoClient: DynamoDBDocument;
  readonly tableName: string;
  readonly partitionKey: string;
  readonly sortKey?: string;
  readonly gsis: IndexDefinition[];
  readonly lsis: IndexDefinition[];

  constructor(client: DynamoDBDocument, config: TableConfig) {
    this.dynamoClient = client;

    this.tableName = config.name;
    this.partitionKey = config.partitionKey;
    this.sortKey = config.sortKey;
    this.gsis = config.gsis || [];
    this.lsis = config.lsis || [];
  }

  entity<T extends Record<string, unknown>>(entityConfig: EntityConfig<T>): Entity<T> {
    return new Entity<T>(this, entityConfig);
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
    return {
      execute: async () => {
        const result = await this.dynamoClient.get({
          TableName: this.tableName,
          Key: {
            pk: keyCondition.pk,
            sk: keyCondition.sk,
          },
        });

        return {
          item: result.Item ? (result.Item as T) : undefined,
        };
      },
    };
  }

  /**
   * Updates an item in the table
   *
   * @param item The item to update
   * @returns A PutBuilder instance for chaining conditions and executing the put operation
   */
  put<T extends Record<string, unknown>>(item: T): PutBuilder<T> {
    // Define the executor function that will be called when execute() is called on the builder
    const executor = async (item: T, options: PutOptions): Promise<T> => {
      const expressionParams: ExpressionParams = {
        expressionAttributeNames: {},
        expressionAttributeValues: {},
        valueCounter: { count: 0 },
      };

      let conditionExpression: string | undefined;
      if (options.condition) {
        conditionExpression = buildExpression(options.condition, expressionParams);
      }

      const { expressionAttributeNames, expressionAttributeValues } = expressionParams;

      const params: PutCommandInput = {
        TableName: this.tableName,
        Item: item,
        ConditionExpression: conditionExpression,
        ExpressionAttributeNames:
          Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
        ExpressionAttributeValues:
          Object.keys(expressionAttributeValues).length > 0 ? expressionAttributeValues : undefined,
        ReturnValues: options.returnValues,
      };

      try {
        await this.dynamoClient.put(params);
        return item;
      } catch (error) {
        console.error("Error creating item:", error);
        throw error;
      }
    };

    return new PutBuilder<T>(executor, item);
  }

  /**
   * Creates a query builder for complex queries
   */
  query<T extends Record<string, unknown>>(keyCondition: PrimaryKey): QueryBuilder<T> {
    const pkAttributeName = "pk";
    const skAttributeName = "sk";

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

    const executor = async (keyCondition: Condition, options: QueryOptions) => {
      // Implementation of the query execution logic
      const expressionParams: ExpressionParams = {
        expressionAttributeNames: {},
        expressionAttributeValues: {},
        valueCounter: { count: 0 },
      };

      const keyConditionExpression = buildExpression(keyCondition, expressionParams);

      let filterExpression: string | undefined;
      if (options.filter) {
        filterExpression = buildExpression(options.filter, expressionParams);
      }

      const projectionExpression = options.projection
        ?.map((p) => generateAttributeName(expressionParams, p))
        .join(", ");

      const { expressionAttributeNames, expressionAttributeValues } = expressionParams;
      const { indexName, limit, consistentRead, scanIndexForward, projection } = options;

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
      };

      try {
        const result = await this.dynamoClient.query(params);
        return {
          items: result.Items as T[],
          lastEvaluatedKey: result.LastEvaluatedKey,
        };
      } catch (error) {
        console.error("Error querying items:", error);
        throw error;
      }
    };

    return new QueryBuilder<T>(executor, keyConditionExpression);
  }

  delete(keyCondition: PrimaryKeyWithoutExpression): DeleteBuilder {
    const executor = async (options: DeleteOptions) => {
      const { expression, names, values } = prepareExpressionParams(options.condition);

      // Create a properly typed params object for the delete operation
      const params: DeleteCommandInput = {
        TableName: this.tableName,
        Key: {
          pk: keyCondition.pk,
          sk: keyCondition.sk,
        },
        ConditionExpression: expression,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: options.returnValues,
      };

      try {
        const result = await this.dynamoClient.delete(params);
        return {
          item: result.Attributes as Record<string, unknown>,
        };
      } catch (error) {
        console.error("Error deleting item:", error);
        throw error;
      }
    };

    return new DeleteBuilder(executor);
  }

  /**
   * Updates an item in the table
   *
   * @param keyCondition The primary key of the item to update
   * @returns An UpdateBuilder instance for chaining update operations and conditions
   */
  update<T extends Record<string, unknown>>(keyCondition: PrimaryKeyWithoutExpression): UpdateBuilder<T> {
    const executor = async (updates: UpdateAction[], options: UpdateOptions) => {
      if (updates.length === 0) {
        throw new Error("No update actions specified");
      }

      const expressionParams: ExpressionParams = {
        expressionAttributeNames: {},
        expressionAttributeValues: {},
        valueCounter: { count: 0 },
      };

      // Build the update expression
      let updateExpression = "";

      // Group updates by type
      const setUpdates: UpdateAction[] = [];
      const removeUpdates: UpdateAction[] = [];
      const addUpdates: UpdateAction[] = [];
      const deleteUpdates: UpdateAction[] = [];

      for (const update of updates) {
        switch (update.type) {
          case "SET":
            setUpdates.push(update);
            break;
          case "REMOVE":
            removeUpdates.push(update);
            break;
          case "ADD":
            addUpdates.push(update);
            break;
          case "DELETE":
            deleteUpdates.push(update);
            break;
        }
      }

      // Build SET clause
      if (setUpdates.length > 0) {
        updateExpression += "SET ";
        updateExpression += setUpdates
          .map((update) => {
            const attrName = generateAttributeName(expressionParams, update.path);
            const valueName = `:v${expressionParams.valueCounter.count++}`;
            expressionParams.expressionAttributeValues[valueName] = update.value;
            return `${attrName} = ${valueName}`;
          })
          .join(", ");
      }

      // Build REMOVE clause
      if (removeUpdates.length > 0) {
        if (updateExpression) updateExpression += " ";
        updateExpression += "REMOVE ";
        updateExpression += removeUpdates
          .map((update) => {
            return generateAttributeName(expressionParams, update.path);
          })
          .join(", ");
      }

      // Build ADD clause
      if (addUpdates.length > 0) {
        if (updateExpression) updateExpression += " ";
        updateExpression += "ADD ";
        updateExpression += addUpdates
          .map((update) => {
            const attrName = generateAttributeName(expressionParams, update.path);
            const valueName = `:v${expressionParams.valueCounter.count++}`;
            expressionParams.expressionAttributeValues[valueName] = update.value;
            return `${attrName} ${valueName}`;
          })
          .join(", ");
      }

      // Build DELETE clause
      if (deleteUpdates.length > 0) {
        if (updateExpression) updateExpression += " ";
        updateExpression += "DELETE ";
        updateExpression += deleteUpdates
          .map((update) => {
            const attrName = generateAttributeName(expressionParams, update.path);
            const valueName = `:v${expressionParams.valueCounter.count++}`;
            expressionParams.expressionAttributeValues[valueName] = update.value;
            return `${attrName} ${valueName}`;
          })
          .join(", ");
      }

      // Build condition expression if provided
      let conditionExpression: string | undefined;
      if (options.condition) {
        conditionExpression = buildExpression(options.condition, expressionParams);
      }

      const { expressionAttributeNames, expressionAttributeValues } = expressionParams;

      const params: UpdateCommandInput = {
        TableName: this.tableName,
        Key: {
          pk: keyCondition.pk,
          sk: keyCondition.sk,
        },
        UpdateExpression: updateExpression,
        ConditionExpression: conditionExpression,
        ExpressionAttributeNames:
          Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
        ExpressionAttributeValues:
          Object.keys(expressionAttributeValues).length > 0 ? expressionAttributeValues : undefined,
        ReturnValues: options.returnValues,
      };

      try {
        const result = await this.dynamoClient.update(params);
        return {
          item: result.Attributes as T,
        };
      } catch (error) {
        console.error("Error updating item:", error);
        throw error;
      }
    };

    return new UpdateBuilder<T>(executor);
  }
}
