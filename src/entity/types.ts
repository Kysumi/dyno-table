import type { StandardSchemaV1 } from "../standard-schema";
import type { Index } from "../types";
import type { GenerateType, sortKey } from "../utils/sort-key-template";
import type { partitionKey, StrictGenerateType } from "../utils/partition-key-template";

export interface KeyTemplate {
  template: string;
  variables: string[];
}

export interface EntityDefinition<T extends Record<string, unknown>> {
  name: string;
  schema: StandardSchemaV1;
  primaryKey: {
    partitionKey: (params: StrictGenerateType<readonly string[]>) => string;
    sortKey: (params: GenerateType<readonly string[]>) => string;
  };
  indexes?: {
    [key: string]: {
      gsi?: string;
      lsi?: string;
      partitionKey: ReturnType<typeof partitionKey>;
      sortKey: ReturnType<typeof sortKey>;
    };
  };
}

// Helper type to extract the parameter types from a key function
type KeyParams<T> = T extends (params: infer P) => string ? P : never;

// Helper type to get the combined parameters for an index
type IndexParams<T> = {
  // @ts-expect-error - Trust me bro
  [K in keyof T]: KeyParams<T[K]["partitionKey"]> & KeyParams<T[K]["sortKey"]>;
};

// Type for query methods that maps index names to their parameter types
export type QueryMethods<T extends Record<string, unknown>, I extends NonNullable<EntityDefinition<T>["indexes"]>> = {
  [K in keyof I]: (params: IndexParams<I>[K]) => Promise<T[]>;
};

export interface EntityRepository<
  T extends Record<string, unknown>,
  I extends NonNullable<EntityDefinition<T>["indexes"]>,
> {
  create: (data: T) => Promise<T>;
  update: (data: Partial<T>) => Promise<T>;
  delete: (key: { pk: string; sk: string }) => Promise<void>;
  get: (key: { pk: string; sk: string }) => Promise<T | null>;
  query: QueryMethods<T, I>;
}

export type EntityQueryBuilder<
  T extends Record<string, unknown>,
  I extends NonNullable<EntityDefinition<T>["indexes"]>,
> = QueryMethods<T, I>;
