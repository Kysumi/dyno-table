import type {
  BatchGetCommandInput,
  BatchGetCommandOutput,
  BatchWriteCommandInput,
  BatchWriteCommandOutput,
  DeleteCommandInput,
  DeleteCommandOutput,
  GetCommandInput,
  GetCommandOutput,
  PutCommandInput,
  PutCommandOutput,
  QueryCommandInput,
  QueryCommandOutput,
  ScanCommandInput,
  ScanCommandOutput,
  SearchVectorsCommandInput,
  SearchVectorsCommandOutput,
  TransactWriteCommandInput,
  TransactWriteCommandOutput,
  UpdateCommandInput,
  UpdateCommandOutput,
} from "@aws-sdk/lib-dynamodb";

/**
 * Plugins observe every physical DynamoDB request (query, put, scan, batch chunk, etc.)
 * — the seam for wiring in APM tools like Sentry/New Relic, a query logger, or a metrics
 * collector. `Table` accepts a list of plugins, so independent concerns (logging, tracing,
 * metrics) can be registered side by side without composing them into one object yourself.
 */

export type DynamoOperation =
  | "get"
  | "put"
  | "query"
  | "scan"
  | "delete"
  | "update"
  | "transactWrite"
  | "batchWrite"
  | "batchGet"
  | "searchVectors";

interface OperationParamsMap {
  get: GetCommandInput;
  put: PutCommandInput;
  query: QueryCommandInput;
  scan: ScanCommandInput;
  delete: DeleteCommandInput;
  update: UpdateCommandInput;
  transactWrite: TransactWriteCommandInput;
  batchWrite: BatchWriteCommandInput;
  batchGet: BatchGetCommandInput;
  searchVectors: SearchVectorsCommandInput;
}

interface OperationResultMap {
  get: GetCommandOutput;
  put: PutCommandOutput;
  query: QueryCommandOutput;
  scan: ScanCommandOutput;
  delete: DeleteCommandOutput;
  update: UpdateCommandOutput;
  transactWrite: TransactWriteCommandOutput;
  batchWrite: BatchWriteCommandOutput;
  batchGet: BatchGetCommandOutput;
  searchVectors: SearchVectorsCommandOutput;
}

/**
 * Fired before a physical DynamoDB request is sent. `params` is typed per `operation` —
 * narrow on `operation` (e.g. `event.operation === "query"`) to get the matching
 * `*CommandInput` shape from `@aws-sdk/lib-dynamodb`.
 */
export type RequestEvent = {
  [K in DynamoOperation]: {
    operation: K;
    tableName: string;
    /**
     * Entities this request originated from (via `defineEntity`). Empty when the call was
     * made directly against `Table`, or when nothing could be attributed. `transactWrite`
     * and `batchWrite`/`batchGet` requests can carry more than one entity, since a single
     * physical request can bundle operations from several entities.
     */
    entityNames: readonly string[];
    params: OperationParamsMap[K];
  };
}[DynamoOperation];

/** Fired after a physical DynamoDB request settles, successfully or not. */
export type RequestResult = {
  [K in DynamoOperation]: {
    operation: K;
    tableName: string;
    entityNames: readonly string[];
    params: OperationParamsMap[K];
    durationMs: number;
  } & (
    | {
        /** The raw Document Client response. */
        result: OperationResultMap[K];
        error?: never;
      }
    | {
        /** The original error. */
        error: unknown;
        result?: never;
      }
  );
}[DynamoOperation];

export interface TablePlugin<RequestState = unknown> {
  /** Identifies this plugin in the `plugins` list; purely for the plugin author's own reference. */
  name?: string;
  // biome-ignore lint/suspicious/noConfusingVoidType: hooks may return request state or nothing, synchronously or asynchronously.
  onRequestStart?(event: RequestEvent): RequestState | void | Promise<RequestState | void>;
  /** The return value is ignored; promises and other thenables are awaited. */
  onRequestEnd?(event: RequestResult, state: RequestState | undefined): unknown;
}

function snapshotDocumentValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(snapshotDocumentValue) as T;
  if (value instanceof Map) return new Map([...value].map(([key, item]) => [key, snapshotDocumentValue(item)])) as T;
  if (value instanceof Set) return new Set([...value].map(snapshotDocumentValue)) as T;
  if (Buffer.isBuffer(value)) return Buffer.from(value) as T;
  if (value instanceof ArrayBuffer) return value.slice(0) as T;
  if (ArrayBuffer.isView(value)) return structuredClone(value);
  if (!value || typeof value !== "object") return value;

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;

  const snapshot = Object.create(prototype) as Record<PropertyKey, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;
    if ("value" in descriptor) descriptor.value = snapshotDocumentValue(descriptor.value);
    Object.defineProperty(snapshot, key, descriptor);
  }
  return snapshot as T;
}

async function runEndHooks(
  plugins: readonly TablePlugin[],
  states: readonly unknown[],
  event: RequestResult,
  started?: readonly boolean[],
): Promise<{ error: unknown } | undefined> {
  let firstFailure: { error: unknown } | undefined;
  for (const [index, plugin] of plugins.entries()) {
    if (started && !started[index]) continue;
    try {
      await plugin.onRequestEnd?.(event, states[index]);
    } catch (error) {
      firstFailure ??= { error };
    }
  }
  return firstFailure;
}

export async function instrumentRequest<Op extends DynamoOperation, T>(
  plugins: readonly TablePlugin[] | undefined,
  event: { operation: Op; tableName: string; entityNames: readonly string[]; params: OperationParamsMap[Op] },
  fn: () => Promise<T>,
): Promise<T> {
  if (!plugins?.length) return fn();

  const safeEvent = { ...event, params: snapshotDocumentValue(event.params) } as RequestEvent;
  const states: unknown[] = [];
  const started: boolean[] = [];
  const lifecycleStart = performance.now();
  for (const [index, plugin] of plugins.entries()) {
    if (!plugin.onRequestStart) continue;
    try {
      states[index] = await plugin.onRequestStart(safeEvent);
      started[index] = true;
    } catch (error) {
      const endEvent = { ...safeEvent, durationMs: performance.now() - lifecycleStart, error } as RequestResult;
      await runEndHooks(plugins, states, endEvent, started);
      throw error;
    }
  }
  const start = performance.now();
  let result: T;
  try {
    result = await fn();
  } catch (error) {
    const endEvent = { ...safeEvent, durationMs: performance.now() - start, error } as RequestResult;
    await runEndHooks(plugins, states, endEvent);
    throw error;
  }

  const endEvent = plugins.some((plugin) => plugin.onRequestEnd)
    ? ({
        ...safeEvent,
        durationMs: performance.now() - start,
        result: snapshotDocumentValue(result),
      } as RequestResult)
    : undefined;
  if (endEvent) {
    const hookFailure = await runEndHooks(plugins, states, endEvent);
    if (hookFailure) throw hookFailure.error;
  }
  return result;
}

export function entityNamesOf(entityName: string | undefined): readonly string[] {
  return entityName ? [entityName] : [];
}

export function distinctEntityNames(entityNames: ReadonlyArray<string | undefined>): readonly string[] {
  return [...new Set(entityNames.filter((name): name is string => Boolean(name)))].sort();
}
