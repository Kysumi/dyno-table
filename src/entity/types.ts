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
 * Extract input and output types from a schema
 */
export type SchemaTypes<S> = S extends StandardSchemaV1<infer I, infer O>
  ? {
      input: I;
      output: O;
    }
  : never;

/**
 * Interface for entity definition
 */
export interface QueryDefinition<TSchema> {
  index: string;
  partitionKey: (params: StrictGenerateType<readonly string[]>) => string;
  sortKey: {
    condition: string;
    value: (params: GenerateType<readonly string[]>) => string;
  };
}

export interface EntityDefinition<
  TSchema extends StandardSchemaV1<Record<string, unknown>, Record<string, unknown>>,
  PKDef extends {
    partitionKey: (params: StrictGenerateType<readonly string[]>) => string;
    sortKey: (params: GenerateType<readonly string[]>) => string;
  },
  I extends Record<string, unknown> = Record<string, never>,
  Q extends Record<string, QueryDefinition<TSchema>> = Record<string, never>,
> {
  name: string;
  schema: TSchema;
  primaryKey: PKDef;
  indexes?: I;
  query?: Q;
}

// Extract key parameter types - used internally
type ExtractParams<F> = F extends (params: infer P) => string ? P : never;

// Helper type to get the parameters for the partition key
export type PartitionKeyParams<PKDef> = PKDef extends { partitionKey: infer PK } ? ExtractParams<PK> : never;

// Helper type to get the combined parameters for the primary key
export type PrimaryKeyParams<PKDef> = PKDef extends { partitionKey: infer PK; sortKey: infer SK }
  ? ExtractParams<PK> & ExtractParams<SK>
  : never;

// Helper type for index parameters
export type IndexParams<T> = {
  [K in keyof T]: T[K] extends { partitionKey: infer PK; sortKey: infer SK }
    ? ExtractParams<PK> & ExtractParams<SK>
    : never;
};

// Helper type for query parameters
export type QueryParams<Q> = {
  [K in keyof Q]: Q[K] extends { partitionKey: infer PK; sortKey: { value: infer SK } }
    ? ExtractParams<PK> & ExtractParams<SK>
    : never;
};

// Import QueryBuilder type
import type { QueryBuilder } from "../builders/query-builder";
import type { TableConfig } from "../types";

// Type for query methods
export type QueryMethods<
  TSchema extends StandardSchemaV1<Record<string, unknown>, Record<string, unknown>>,
  I extends Record<string, unknown>,
  Q extends Record<string, QueryDefinition<TSchema>> = Record<string, never>,
  TConfig extends TableConfig = TableConfig,
> = {
  [K in keyof I]: (
    params: IndexParams<I>[K],
  ) => QueryBuilder<Extract<SchemaTypes<TSchema>["output"], Record<string, unknown>>, TConfig>;
} & {
  [K in keyof Q]: (
    params: QueryParams<Q>[K],
  ) => QueryBuilder<Extract<SchemaTypes<TSchema>["output"], Record<string, unknown>>, TConfig>;
};

export interface EntityRepository<
  TSchema extends StandardSchemaV1<Record<string, unknown>, Record<string, unknown>>,
  I extends Record<string, unknown>,
  PKDef,
  Q extends Record<string, QueryDefinition<TSchema>> = Record<string, never>,
  TConfig extends TableConfig = TableConfig,
> {
  create: (data: SchemaTypes<TSchema>["input"]) => Promise<SchemaTypes<TSchema>["output"]>;
  update: (
    data: Partial<SchemaTypes<TSchema>["input"]> & PrimaryKeyParams<PKDef>,
  ) => Promise<SchemaTypes<TSchema>["output"]>;
  delete: (key: PrimaryKeyParams<PKDef>) => Promise<void>;
  get: (key: PrimaryKeyParams<PKDef>) => Promise<SchemaTypes<TSchema>["output"] | null>;
  query: QueryMethods<TSchema, I, Q, TConfig>;
}

export type EntityQueryBuilder<
  TSchema extends StandardSchemaV1<Record<string, unknown>, Record<string, unknown>>,
  PKDef extends {
    partitionKey: (params: StrictGenerateType<readonly string[]>) => string;
    sortKey: (params: GenerateType<readonly string[]>) => string;
  },
  I extends NonNullable<EntityDefinition<TSchema, PKDef, Record<string, unknown>>["indexes"]>,
  Q extends NonNullable<
    EntityDefinition<TSchema, PKDef, Record<string, unknown>, Record<string, QueryDefinition<TSchema>>>["query"]
  >,
  TConfig extends TableConfig = TableConfig,
> = QueryMethods<TSchema, I, Q, TConfig>;
