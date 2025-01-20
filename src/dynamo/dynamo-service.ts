import type { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { handleDynamoError } from "../errors/error-handler";
import { ExponentialBackoffStrategy } from "../retry/exponential-backoff-strategy";
import type { RetryStrategy } from "../retry/retry-strategy";
import { DynamoConverter } from "./dynamo-converter";
import type {
  DynamoPutOptions,
  DynamoUpdateOptions,
  DynamoDeleteOptions,
  DynamoQueryOptions,
  DynamoScanOptions,
  DynamoBatchWriteItem,
  DynamoTransactItem,
} from "./dynamo-types";

const BATCH_WRITE_LIMIT = 25;
const TRANSACTION_LIMIT = 100;

export class DynamoService {
  private converter: DynamoConverter;

  constructor(
    private readonly client: DynamoDBDocument,
    private readonly tableName: string,
  ) {
    this.converter = new DynamoConverter(tableName);
  }

  async put(options: DynamoPutOptions) {
    try {
      const params = this.converter.toPutCommand(options);
      return await this.withRetry(async () => {
        return this.client.put(params);
      });
    } catch (error) {
      handleDynamoError(error, {
        operation: "PUT",
        tableName: this.tableName,
        key: options.item,
        expression: {
          condition: options.condition?.expression,
        },
      });
    }
  }

  async update(options: DynamoUpdateOptions) {
    try {
      const params = this.converter.toUpdateCommand(options);
      return await this.withRetry(() => this.client.update(params));
    } catch (error) {
      handleDynamoError(error, {
        operation: "UPDATE",
        tableName: this.tableName,
        key: options.key,
        expression: {
          update: options.update.expression,
          condition: options.condition?.expression,
        },
      });
    }
  }

  async delete(options: DynamoDeleteOptions) {
    const params = this.converter.toDeleteCommand(options);

    try {
      return await this.withRetry(() => this.client.delete(params));
    } catch (error) {
      handleDynamoError(error, {
        operation: "DELETE",
        tableName: this.tableName,
        key: options.key,
        expression: {
          condition: params.ConditionExpression,
        },
      });
    }
  }

  async get(key: Record<string, unknown>, options?: { indexName?: string }) {
    try {
      const params = this.converter.toGetCommand({ key, ...options });
      return await this.withRetry(() => this.client.get(params));
    } catch (error) {
      handleDynamoError(error, {
        operation: "GET",
        tableName: this.tableName,
        key,
      });
    }
  }

  async query(options: DynamoQueryOptions) {
    try {
      if (options.autoPaginate) {
        return await this.executeWithAutoPagination(options);
      }

      const params = this.converter.toQueryCommand(options);
      return await this.withRetry(() => this.client.query(params));
    } catch (error) {
      handleDynamoError(error, {
        operation: "QUERY",
        tableName: this.tableName,
        expression: {
          keyCondition: options.keyCondition?.expression,
          filter: options.filter?.expression,
        },
      });
    }
  }

  async scan(options: DynamoScanOptions) {
    try {
      const params = this.converter.toScanCommand(options);
      return await this.withRetry(() => this.client.scan(params));
    } catch (error) {
      handleDynamoError(error, {
        operation: "SCAN",
        tableName: this.tableName,
        expression: {
          filter: options.filter?.expression,
        },
      });
    }
  }

  async batchWrite(items: DynamoBatchWriteItem[]) {
    try {
      const chunks = this.chunkArray(items, BATCH_WRITE_LIMIT);
      return await Promise.all(chunks.map((chunk) => this.processBatchWrite(chunk)));
    } catch (error) {
      handleDynamoError(error, {
        operation: "BATCH_WRITE",
        tableName: this.tableName,
      });
    }
  }

  async transactWrite(items: DynamoTransactItem[]) {
    if (items.length > TRANSACTION_LIMIT) {
      throw new Error(`Transaction limit exceeded. Maximum is ${TRANSACTION_LIMIT} items, got ${items.length}`);
    }

    try {
      const params = this.converter.toTransactWriteCommand(items);
      return await this.withRetry(() => this.client.transactWrite(params));
    } catch (error) {
      handleDynamoError(error, {
        operation: "TRANSACT_WRITE",
        tableName: this.tableName,
      });
    }
  }

  private async executeWithAutoPagination(options: DynamoQueryOptions) {
    const allItems: unknown[] = [];
    let lastEvaluatedKey: Record<string, unknown> | undefined;

    do {
      const result = await this.query({
        ...options,
        pageKey: lastEvaluatedKey,
        autoPaginate: false,
      });

      if (result.Items) {
        allItems.push(...result.Items);
      }

      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return {
      Items: allItems,
      Count: allItems.length,
      ScannedCount: allItems.length,
      LastEvaluatedKey: undefined,
    };
  }

  private async processBatchWrite(items: DynamoBatchWriteItem[]) {
    const processUnprocessedItems = async (unprocessedItems: DynamoBatchWriteItem[]) => {
      const params = this.converter.toBatchWriteCommand(unprocessedItems);
      const result = await this.client.batchWrite(params);

      const outstandingItems = result.UnprocessedItems?.[this.tableName];
      if (outstandingItems && outstandingItems.length > 0) {
        const remainingItems = this.converter.fromBatchWriteResponse(outstandingItems);
        throw {
          name: "UnprocessedItemsError",
          unprocessedItems: remainingItems,
        };
      }

      return result;
    };

    const params = this.converter.toBatchWriteCommand(items);
    const initialResult = await this.client.batchWrite(params);

    const rawUnprocessedItems = initialResult.UnprocessedItems?.[this.tableName];

    // If no unprocessed items, return the initial result
    if (!rawUnprocessedItems || rawUnprocessedItems.length === 0) {
      return initialResult;
    }

    // Retry with unprocessed items
    const unprocessedItems = this.converter.fromBatchWriteResponse(rawUnprocessedItems);

    return this.withRetry(() => processUnprocessedItems(unprocessedItems));
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    strategy: RetryStrategy = new ExponentialBackoffStrategy(),
  ): Promise<T> {
    let attempt = 0;

    while (true) {
      try {
        return await operation();
      } catch (error) {
        if (!strategy.shouldRetry(error, attempt)) {
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, strategy.getDelay(attempt)));

        attempt++;
      }
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(array.length / size) }, (_, index) =>
      array.slice(index * size, (index + 1) * size),
    );
  }
}

export interface DynamoQueryResponse {
  Items?: Record<string, unknown>[];
  Count?: number;
  ScannedCount?: number;
  LastEvaluatedKey?: Record<string, unknown>;
}

export interface DynamoBatchWriteResponse {
  UnprocessedItems?: Record<string, unknown>[];
}
