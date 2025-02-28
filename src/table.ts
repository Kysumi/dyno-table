import type { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
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
  type ExpressionParams,
  type KeyConditionOperator,
  type PrimaryKey,
} from "./conditions";
import { buildExpression, generateAttributeName } from "./expression";
import type { AttributeValue, PutItemCommandInput, QueryCommandInput } from "@aws-sdk/client-dynamodb";
import { QueryBuilder, type QueryOptions } from "./query-builder";
import { PutBuilder, type PutOptions } from "./put-builder";

// Helper type for converting unknown values to AttributeValue
type AttributeValueRecord = Record<string, AttributeValue>;

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
    return this.put(item).condition((op) => op.attributeNotExists("pk"));
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

      const params: PutItemCommandInput = {
        TableName: this.tableName,
        Item: item as Record<string, AttributeValue>,
        ConditionExpression: conditionExpression,
        ExpressionAttributeNames:
          Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
        ExpressionAttributeValues:
          Object.keys(expressionAttributeValues).length > 0
            ? (expressionAttributeValues as AttributeValueRecord)
            : undefined,
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
      // Create a KeyConditionOperator object
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

      // Execute the function to get the condition
      const skCondition = keyCondition.sk(keyConditionOperator);

      // Create key condition expression
      keyConditionExpression = and(eq(pkAttributeName, keyCondition.pk), skCondition);
    }

    // CRAZY SHIZ
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
        ExpressionAttributeValues: expressionAttributeValues as AttributeValueRecord,
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
}
