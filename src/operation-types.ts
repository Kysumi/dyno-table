import type { PrimaryKeyWithoutExpression } from "./conditions.js";
import { ConfigurationErrors } from "./utils/error-factory.js";

export interface BatchExecutionOptions {
  /** Total attempts including the initial request. Default: 5. */
  maxAttempts?: number;
  /** Initial full-jitter backoff ceiling in milliseconds. Default: 25. */
  baseDelayMs?: number;
  /** Cancels backoff and in-flight DynamoDB requests. */
  abortSignal?: AbortSignal;
  /** Requests DynamoDB consumed capacity metrics for the batch write. */
  returnConsumedCapacity?: "INDEXES" | "TOTAL" | "NONE";
}

export type BatchWriteOperation<T extends Record<string, unknown>> =
  | { type: "put"; item: T; entityType?: string }
  | { type: "delete"; key: PrimaryKeyWithoutExpression; entityType?: string };

export interface ResolvedBatchExecutionOptions {
  maxAttempts: number;
  baseDelayMs: number;
  abortSignal?: AbortSignal;
  returnConsumedCapacity?: "INDEXES" | "TOTAL" | "NONE";
}

export function resolveBatchExecutionOptions(options: BatchExecutionOptions = {}): ResolvedBatchExecutionOptions {
  const maxAttempts = options.maxAttempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 25;

  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
    throw ConfigurationErrors.invalidMaxAttempts(maxAttempts);
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
    throw ConfigurationErrors.invalidBaseDelayMs(baseDelayMs);
  }

  return {
    maxAttempts,
    baseDelayMs,
    abortSignal: options.abortSignal,
    returnConsumedCapacity: options.returnConsumedCapacity,
  };
}
