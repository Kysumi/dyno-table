import type {
  PutCommandInput,
  UpdateCommandInput,
  GetCommandInput,
  QueryCommandInput,
  DeleteCommandInput,
  ScanCommandInput,
  TransactWriteCommandInput,
  BatchWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";
import type {
  DynamoQueryOptions,
  DynamoPutOptions,
  DynamoUpdateOptions,
  DynamoDeleteOptions,
  DynamoScanOptions,
  DynamoTransactItem,
  DynamoBatchWriteItem,
  DynamoExpression,
  DynamoGetOptions,
} from "./dynamo-types";

export class DynamoConverter {
  constructor(private readonly tableName: string) {}

  /**
   * Converts our expression format to DynamoDB expression format
   */
  private convertExpression(expr?: DynamoExpression) {
    if (!expr) return {};

    return {
      ...(expr.expression && { Expression: expr.expression }),
      ...(expr.names && { ExpressionAttributeNames: expr.names }),
      ...(expr.values && { ExpressionAttributeValues: expr.values }),
    };
  }

  /**
   * Convert our format to DynamoDB put command input
   */
  toPutCommand(options: DynamoPutOptions): PutCommandInput {
    return {
      TableName: this.tableName,
      Item: options.item,
      ...(options.condition && {
        ConditionExpression: options.condition.expression,
        ExpressionAttributeNames: options.condition.names,
        ExpressionAttributeValues: options.condition.values,
      }),
    };
  }

  /**
   * Convert our format to DynamoDB get command input
   */
  toGetCommand(options: DynamoGetOptions): GetCommandInput {
    return {
      TableName: this.tableName,
      Key: options.key,
      ...(options.indexName && { IndexName: options.indexName }),
    };
  }

  /**
   * Convert our format to DynamoDB update command input
   */
  toUpdateCommand(options: DynamoUpdateOptions): UpdateCommandInput {
    return {
      TableName: this.tableName,
      Key: options.key,
      UpdateExpression: options.update.expression,
      ExpressionAttributeNames: {
        ...options.update.names,
        ...options.condition?.names,
      },
      ExpressionAttributeValues: {
        ...options.update.values,
        ...options.condition?.values,
      },
      ...(options.condition && {
        ConditionExpression: options.condition.expression,
      }),
      ...(options.returnValues && {
        ReturnValues: options.returnValues,
      }),
    };
  }

  /**
   * Convert our format to DynamoDB delete command input
   */
  toDeleteCommand(options: DynamoDeleteOptions): DeleteCommandInput {
    return {
      TableName: this.tableName,
      Key: options.key,
      ...(options.condition && {
        ConditionExpression: options.condition.expression,
        ExpressionAttributeNames: options.condition.names,
        ExpressionAttributeValues: options.condition.values,
      }),
    };
  }

  /**
   * Convert our format to DynamoDB query command input
   */
  toQueryCommand(options: DynamoQueryOptions): QueryCommandInput {
    return {
      TableName: this.tableName,
      ...(options.keyCondition && {
        KeyConditionExpression: options.keyCondition.expression,
        ExpressionAttributeNames: {
          ...options.keyCondition.names,
          ...options.filter?.names,
        },
        ExpressionAttributeValues: {
          ...options.keyCondition.values,
          ...options.filter?.values,
        },
      }),
      ...(options.filter && {
        FilterExpression: options.filter.expression,
      }),
      IndexName: options.indexName,
      Limit: options.limit,
      ExclusiveStartKey: options.pageKey,
      ConsistentRead: options.consistentRead,
    };
  }

  /**
   * Convert our format to DynamoDB scan command input
   */
  toScanCommand(options: DynamoScanOptions): ScanCommandInput {
    return {
      TableName: this.tableName,
      ...(options.filter && {
        FilterExpression: options.filter.expression,
        ExpressionAttributeNames: options.filter.names,
        ExpressionAttributeValues: options.filter.values,
      }),
      IndexName: options.indexName,
      Limit: options.limit,
      ExclusiveStartKey: options.pageKey,
    };
  }

  /**
   * Convert our format to DynamoDB batch write command input
   */
  toBatchWriteCommand(items: DynamoBatchWriteItem[]): BatchWriteCommandInput {
    const requests = items.map((item) => {
      if (item.put) {
        return {
          PutRequest: {
            Item: item.put,
          },
        };
      }
      if (item.delete) {
        return {
          DeleteRequest: {
            Key: item.delete,
          },
        };
      }
      throw new Error("Invalid batch write item");
    });

    return {
      RequestItems: {
        [this.tableName]: requests,
      },
    };
  }

  /**
   * Convert our format to DynamoDB transact write command input
   */
  toTransactWriteCommand(items: DynamoTransactItem[]): TransactWriteCommandInput {
    return {
      TransactItems: items.map((item) => {
        if (item.put) {
          return {
            Put: {
              TableName: this.tableName,
              Item: item.put.item,
              ...(item.put.condition && {
                ConditionExpression: item.put.condition.expression,
                ExpressionAttributeNames: item.put.condition.names,
                ExpressionAttributeValues: item.put.condition.values,
              }),
            },
          };
        }
        if (item.delete) {
          return {
            Delete: {
              TableName: this.tableName,
              Key: item.delete.key,
              ...(item.delete.condition && {
                ConditionExpression: item.delete.condition.expression,
                ExpressionAttributeNames: item.delete.condition.names,
                ExpressionAttributeValues: item.delete.condition.values,
              }),
            },
          };
        }
        if (item.update) {
          return {
            Update: {
              TableName: this.tableName,
              Key: item.update.key,
              UpdateExpression: item.update.update.expression,
              ...(item.update.condition && {
                ConditionExpression: item.update.condition.expression,
                ExpressionAttributeNames: {
                  ...item.update.update.names,
                  ...item.update.condition.names,
                },
                ExpressionAttributeValues: {
                  ...item.update.update.values,
                  ...item.update.condition.values,
                },
              }),
            },
          };
        }
        throw new Error("Invalid transaction item");
      }),
    };
  }

  /**
   * Convert DynamoDB batch write response to our format
   */
  fromBatchWriteResponse(response: Record<string, unknown>[]): DynamoBatchWriteItem[] {
    return response.map((item) => {
      if ("PutRequest" in item) {
        return {
          put: (item.PutRequest as { Item: Record<string, unknown> }).Item,
        };
      }
      if ("DeleteRequest" in item) {
        return {
          delete: (item.DeleteRequest as { Key: Record<string, unknown> }).Key,
        };
      }
      throw new Error("Invalid batch write response item");
    });
  }
}
