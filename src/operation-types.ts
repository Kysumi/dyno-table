import type { PrimaryKeyWithoutExpression } from "./conditions";

export type BatchWriteOperation<T extends Record<string, unknown>> =
  | { type: "put"; item: T }
  | { type: "delete"; key: PrimaryKeyWithoutExpression };
