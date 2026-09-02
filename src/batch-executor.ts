import type { ConsumedCapacity } from "@aws-sdk/client-dynamodb";
import type { BatchGetCommandInput, BatchWriteCommandInput, DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import type { BatchGetCommand, BatchGetExecutorResult } from "./builders/batch-builder.js";
import type { ExpressionParams, PrimaryKeyWithoutExpression } from "./conditions.js";
import { generateAttributeName } from "./expression.js";
import {
  type BatchExecutionOptions,
  type BatchWriteOperation,
  type ResolvedBatchExecutionOptions,
  resolveBatchExecutionOptions,
} from "./operation-types.js";
import { distinctEntityNames, instrumentRequest, type TablePlugin } from "./plugins.js";
import type { DynamoItem, VectorIndexConfig } from "./types.js";
import { chunkArray } from "./utils/chunk-array.js";
import { OperationErrors } from "./utils/error-factory.js";
import { isAbortError } from "./utils/error-utils.js";
import { validateItemVectors } from "./vector.js";

const DDB_BATCH_WRITE_LIMIT = 25;
const DDB_BATCH_GET_LIMIT = 100;
const MAX_BATCH_RETRY_DELAY_MS = 20_000;

type BatchWriteRequest = NonNullable<BatchWriteCommandInput["RequestItems"]>[string][number];

export class BatchExecutor {
  constructor(
    private readonly dynamoClient: DynamoDBDocument,
    private readonly tableName: string,
    private readonly partitionKey: string,
    private readonly sortKey: string | undefined,
    private readonly createKey: (key: PrimaryKeyWithoutExpression) => Record<string, unknown>,
    private readonly vectorIndexes: Record<string, VectorIndexConfig>,
    private readonly plugins?: readonly TablePlugin[],
  ) {}

  async batchGet<T extends DynamoItem>(
    keys: Array<PrimaryKeyWithoutExpression>,
    options?: BatchExecutionOptions,
  ): Promise<{ items: T[]; unprocessedKeys: PrimaryKeyWithoutExpression[] }> {
    const result = await this.batchGetCommands(
      keys.map((key) => ({ tableName: this.tableName, key })),
      options,
    );
    return {
      items: result.items as T[],
      unprocessedKeys: result.unprocessedKeys,
    };
  }

  async batchWrite<T extends DynamoItem>(
    operations: Array<BatchWriteOperation<T>>,
    options?: BatchExecutionOptions,
  ): Promise<{ unprocessedItems: Array<BatchWriteOperation<T>>; consumedCapacity?: ConsumedCapacity[] }> {
    for (const operation of operations) {
      if (operation.type === "put") validateItemVectors(operation.item, this.vectorIndexes);
    }

    const retryOptions = resolveBatchExecutionOptions(options);
    const allUnprocessedItems: Array<BatchWriteOperation<T>> = [];
    const consumedCapacity: ConsumedCapacity[] = [];

    try {
      for (const chunk of chunkArray(operations, DDB_BATCH_WRITE_LIMIT)) {
        const entityNames = distinctEntityNames(chunk.map((operation) => operation.entityType));
        const writeRequests: BatchWriteRequest[] = chunk.map((operation) => {
          if (operation.type === "put") {
            return { PutRequest: { Item: operation.item } };
          }

          return { DeleteRequest: { Key: this.createKey(operation.key) } };
        });

        const { unprocessed } = await this.retryBatch(writeRequests, retryOptions, async (requests) => {
          const batchParams = {
            RequestItems: { [this.tableName]: requests },
            ...(retryOptions.returnConsumedCapacity
              ? { ReturnConsumedCapacity: retryOptions.returnConsumedCapacity }
              : {}),
          };
          const result = await instrumentRequest(
            this.plugins,
            { operation: "batchWrite", tableName: this.tableName, entityNames, params: batchParams },
            () => this.dynamoClient.batchWrite(batchParams, { abortSignal: retryOptions.abortSignal }),
          );
          if (result.ConsumedCapacity) consumedCapacity.push(...result.ConsumedCapacity);
          return {
            processed: [],
            unprocessed: result.UnprocessedItems?.[this.tableName] ?? [],
          };
        });

        for (const request of unprocessed) {
          if (request.PutRequest?.Item) {
            allUnprocessedItems.push({ type: "put", item: request.PutRequest.Item as T });
          } else if (request.DeleteRequest?.Key) {
            allUnprocessedItems.push({
              type: "delete",
              key: {
                pk: request.DeleteRequest.Key[this.partitionKey] as string,
                sk: this.sortKey ? (request.DeleteRequest.Key[this.sortKey] as string) : undefined,
              },
            });
          } else {
            throw new Error("Invalid unprocessed item format returned from DynamoDB");
          }
        }
      }
    } catch (error) {
      if (isAbortError(error, retryOptions.abortSignal)) throw retryOptions.abortSignal?.reason ?? error;
      throw OperationErrors.batchWriteFailed(
        this.tableName,
        { requestedOperations: operations.length },
        error instanceof Error ? error : undefined,
      );
    }

    return {
      unprocessedItems: allUnprocessedItems,
      ...(consumedCapacity.length > 0 ? { consumedCapacity } : {}),
    };
  }

  async batchGetCommands(
    commands: BatchGetCommand[],
    options?: BatchExecutionOptions,
  ): Promise<BatchGetExecutorResult> {
    const retryOptions = resolveBatchExecutionOptions(options);
    const groups = new Map<string, { projection?: string[]; consistentRead: boolean; commands: BatchGetCommand[] }>();

    for (const command of commands) {
      const projection = command.projection?.length ? [...new Set(command.projection)].sort() : undefined;
      const consistentRead = command.consistentRead === true;
      const groupKey = JSON.stringify([projection ?? null, consistentRead]);
      const group = groups.get(groupKey);

      if (group) group.commands.push(command);
      else groups.set(groupKey, { projection, consistentRead, commands: [command] });
    }

    const items: DynamoItem[] = [];
    const itemEntityTypes: Array<string | undefined> = [];
    const unprocessedKeys: PrimaryKeyWithoutExpression[] = [];

    try {
      for (const group of groups.values()) {
        for (const chunk of chunkArray(group.commands, DDB_BATCH_GET_LIMIT)) {
          const entityNames = distinctEntityNames(chunk.map((command) => command.entityType));
          const commandsByKey = new Map(chunk.map((command) => [this.batchKey(this.createKey(command.key)), command]));
          const keys = [...commandsByKey.values()].map((command) => this.createKey(command.key));
          const requestOptions = this.createBatchGetRequestOptions(group.projection, group.consistentRead);
          const { processed, unprocessed } = await this.retryBatch(keys, retryOptions, async (remainingKeys) => {
            const params: BatchGetCommandInput = {
              RequestItems: {
                [this.tableName]: {
                  Keys: remainingKeys,
                  ...requestOptions,
                },
              },
            };
            const result = await instrumentRequest(
              this.plugins,
              { operation: "batchGet", tableName: this.tableName, entityNames, params },
              () => this.dynamoClient.batchGet(params, { abortSignal: retryOptions.abortSignal }),
            );
            return {
              processed: (result.Responses?.[this.tableName] ?? []) as DynamoItem[],
              unprocessed: (result.UnprocessedKeys?.[this.tableName]?.Keys ?? []) as Array<Record<string, unknown>>,
            };
          });

          for (const item of processed) {
            items.push(this.removeBatchCorrelationKeys(item, group.projection));
            itemEntityTypes.push(commandsByKey.get(this.batchKey(item))?.entityType);
          }
          unprocessedKeys.push(...unprocessed.map((key) => this.toPrimaryKey(key)));
        }
      }
    } catch (error) {
      if (isAbortError(error, retryOptions.abortSignal)) throw retryOptions.abortSignal?.reason ?? error;
      throw OperationErrors.batchGetFailed(
        this.tableName,
        { requestedKeys: commands.length },
        error instanceof Error ? error : undefined,
      );
    }

    return { items, itemEntityTypes, unprocessedKeys };
  }

  private createBatchGetRequestOptions(projection: string[] | undefined, consistentRead: boolean) {
    const options: {
      ProjectionExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ConsistentRead?: true;
    } = consistentRead ? { ConsistentRead: true } : {};

    if (!projection) return options;

    const expressionParams: ExpressionParams = {
      expressionAttributeNames: {},
      expressionAttributeValues: {},
      valueCounter: { count: 0 },
    };
    const projectedPaths = [
      ...new Set([...projection, this.partitionKey, ...(this.sortKey ? [this.sortKey] : [])]),
    ].sort();
    options.ProjectionExpression = projectedPaths
      .map((path) => generateAttributeName(expressionParams, path))
      .join(", ");
    options.ExpressionAttributeNames = expressionParams.expressionAttributeNames;
    return options;
  }

  private removeBatchCorrelationKeys(item: DynamoItem, projection?: string[]): DynamoItem {
    if (!projection) return item;

    const result = { ...item };
    if (!projection.includes(this.partitionKey)) delete result[this.partitionKey];
    if (this.sortKey && !projection.includes(this.sortKey)) delete result[this.sortKey];
    return result;
  }

  private batchKey(item: Record<string, unknown>): string {
    return JSON.stringify([item[this.partitionKey], ...(this.sortKey ? [item[this.sortKey]] : [])]);
  }

  private toPrimaryKey(key: Record<string, unknown>): PrimaryKeyWithoutExpression {
    return {
      pk: key[this.partitionKey] as string,
      sk: this.sortKey ? (key[this.sortKey] as string) : undefined,
    };
  }

  private async retryBatch<T, R>(
    initial: T[],
    options: ResolvedBatchExecutionOptions,
    send: (items: T[]) => Promise<{ processed: R[]; unprocessed: T[] }>,
  ): Promise<{ processed: R[]; unprocessed: T[] }> {
    const processed: R[] = [];
    let unprocessed = initial;

    for (let attempt = 1; attempt <= options.maxAttempts && unprocessed.length > 0; attempt++) {
      if (attempt > 1) {
        const ceiling = Math.min(options.baseDelayMs * 2 ** (attempt - 2), MAX_BATCH_RETRY_DELAY_MS);
        const delay = Math.random() * ceiling;
        await this.waitForBatchRetry(delay, options.abortSignal);
      }

      this.throwIfBatchAborted(options.abortSignal);
      const result = await send(unprocessed);
      processed.push(...result.processed);
      unprocessed = result.unprocessed;
    }

    return { processed, unprocessed };
  }

  private waitForBatchRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
    this.throwIfBatchAborted(signal);

    return new Promise((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(signal?.reason);
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, delayMs);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  private throwIfBatchAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw signal.reason;
  }
}
