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
 * Request-level hooks for tracing/logging every physical DynamoDB request
 * (query, put, scan, batch chunk, etc.) — for wiring into APM tools like
 * Sentry/New Relic or a simple query logger.
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
export type RequestHookEvent = {
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
export type RequestHookResult = {
  [K in DynamoOperation]: {
    operation: K;
    tableName: string;
    entityNames: readonly string[];
    params: OperationParamsMap[K];
    durationMs: number;
    /** The raw Document Client response. Present only on success. */
    result?: OperationResultMap[K];
    /** The original error. Present only on failure. */
    error?: unknown;
  };
}[DynamoOperation];

export interface TableHooks {
  onRequestStart?(event: RequestHookEvent): void;
  onRequestEnd?(event: RequestHookResult): void;
}

function shallowCloneParams<T>(params: T): T {
  if (params && typeof params === "object" && !Array.isArray(params)) {
    return { ...(params as object) } as T;
  }
  return params;
}

export async function instrumentRequest<Op extends DynamoOperation, T>(
  hooks: TableHooks | undefined,
  event: { operation: Op; tableName: string; entityNames: readonly string[]; params: OperationParamsMap[Op] },
  fn: () => Promise<T>,
): Promise<T> {
  if (!hooks?.onRequestStart && !hooks?.onRequestEnd) return fn();

  // Hooks are observers, not interceptors: they receive a shallow copy of `params` so
  // that mutating it in onRequestStart can never leak into the request actually sent.
  const safeEvent = { ...event, params: shallowCloneParams(event.params) } as RequestHookEvent;
  hooks.onRequestStart?.(safeEvent);
  const start = performance.now();
  try {
    const result = await fn();
    hooks.onRequestEnd?.({ ...safeEvent, durationMs: performance.now() - start, result } as RequestHookResult);
    return result;
  } catch (error) {
    hooks.onRequestEnd?.({ ...safeEvent, durationMs: performance.now() - start, error } as RequestHookResult);
    throw error;
  }
}

export function entityNamesOf(entityName: string | undefined): readonly string[] {
  return entityName ? [entityName] : [];
}

export function distinctEntityNames(entityNames: ReadonlyArray<string | undefined>): readonly string[] {
  return [...new Set(entityNames.filter((name): name is string => Boolean(name)))].sort();
}
