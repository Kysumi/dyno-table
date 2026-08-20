import type { PrimaryKeyWithoutExpression } from "./conditions.js";

export interface BatchExecutionOptions {
  /** Total attempts including the initial request. Default: 5. */
  maxAttempts?: number;
  /** Initial full-jitter backoff ceiling in milliseconds. Default: 25. */
  baseDelayMs?: number;
  /** Cancels backoff and in-flight DynamoDB requests. */
  abortSignal?: AbortSignal;
}

export type BatchWriteOperation<T extends Record<string, unknown>> =
  | { type: "put"; item: T }
  | { type: "delete"; key: PrimaryKeyWithoutExpression };
