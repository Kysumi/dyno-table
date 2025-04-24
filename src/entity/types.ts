import type { StandardSchemaV1 } from "../standard-schema";
import type { GenerateType } from "../utils/sort-key-template";
import type { StrictGenerateType } from "../utils/partition-key-template";

export interface KeyTemplate {
  template: string;
  variables: string[];
}

/**
 * Type for index projection specification
 */
export type IndexProjection =
  | { projectionType: "ALL" }
  | { projectionType: "KEYS_ONLY" }
  | { projectionType: "INCLUDE"; nonKeyAttributes: string[] };

/**
 * Interface for entity definition
 */
export interface EntityDefinition<
  T extends Record<string, unknown>,
  PKDef extends {
    partitionKey: (params: StrictGenerateType<readonly string[]>) => string;
    sortKey: (params: GenerateType<readonly string[]>) => string;
  },
  I extends Record<string, unknown> = Record<string, never>,
> {
  name: string;
  schema: StandardSchemaV1;
  primaryKey: PKDef;
  indexes?: I;
}

// Helper type to extract the parameter types from a key function
type KeyParams<T> = T extends (params: infer P) => string ? P : never;

// Helper type to get the combined parameters for the primary key
type PrimaryKeyParams<PKDef> = PKDef extends { partitionKey: infer PK; sortKey: infer SK }
  ? PK extends (params: infer P) => string
    ? SK extends (params: infer S) => string
      ? P & S
      : never
    : never
  : never;

// Helper type to get the combined parameters for an index (Restored)
type IndexParams<T> = {
  [K in keyof T]: T[K] extends { partitionKey: infer PK; sortKey: infer SK }
    ? PK extends (params: infer P) => string
      ? SK extends (params: infer S) => string
        ? P & S
        : never
      : never
    : never;
};

// Import QueryBuilder type
import type { QueryBuilder } from "../builders/query-builder";
import type { TableConfig } from "../types";

// Export PrimaryKeyParams and IndexParams using export type
export type { PrimaryKeyParams, IndexParams };

// Type for query methods that maps index names to their parameter types
export type QueryMethods<
  T extends Record<string, unknown>,
  I extends Record<string, unknown>,
  TConfig extends TableConfig = TableConfig,
> = {
  [K in keyof I]: (params: IndexParams<I>[K]) => QueryBuilder<T, TConfig>;
};

export interface EntityRepository<
  T extends Record<string, unknown>,
  I extends Record<string, unknown>,
  PKDef,
  TConfig extends TableConfig = TableConfig,
> {
  create: (data: T) => Promise<T>;
  update: (data: Partial<T>) => Promise<T>;
  delete: (key: PrimaryKeyParams<PKDef>) => Promise<void>;
  get: (key: PrimaryKeyParams<PKDef>) => Promise<T | null>;
  query: QueryMethods<T, I, TConfig>;
}

export type EntityQueryBuilder<
  T extends Record<string, unknown>,
  PKDef extends {
    partitionKey: (params: StrictGenerateType<readonly string[]>) => string;
    sortKey: (params: GenerateType<readonly string[]>) => string;
  },
  I extends NonNullable<EntityDefinition<T, PKDef, Record<string, unknown>>["indexes"]>,
  TConfig extends TableConfig = TableConfig,
> = QueryMethods<T, I, TConfig>;
