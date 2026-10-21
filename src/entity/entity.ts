import type { BuilderContext } from "../builders/builder-types.js";
import type { GetBuilder, QueryBuilder, ScanBuilder, VectorSearchBuilder, VectorSearchInput } from "../builders.js";
import { eq, type PrimaryKey, type PrimaryKeyWithoutExpression } from "../conditions.js";
import type { StandardSchemaV1 } from "../standard-schema.js";
import type { Table } from "../table.js";
import type { DynamoItem, TableConfig, VectorIndexFor, VectorIndexNames } from "../types.js";
import { ConfigurationErrors, EntityErrors } from "../utils/error-factory.js";
import type { IndexDefinition, IndexKey } from "./create-index.js";
import {
  EntityDeleteBuilder,
  EntityGetBuilder,
  EntityPutBuilder,
  EntityUpdateBuilder,
} from "./entity-aware-builders.js";
import { type ItemPreparationConfig, prepareItemAsync, prepareItemSync } from "./item-preparation.js";

export {
  type BuiltIndexDefinition,
  type CreateIndexBuilder,
  createIndex,
  type IndexBuilder,
  type IndexDefinition,
  type IndexKey,
  type PartitionKeyIndexBuilder,
} from "./create-index.js";

// Define the QueryFunction type with a generic return type
export type QueryFunction<_T extends DynamoItem, I, R> = (input: I) => R;

/** @deprecated Use QueryFunction instead. */
export type QueryFunctionWithSchema<T extends DynamoItem, I, R> = QueryFunction<T, I, R>;

export type QueryRecord<T extends DynamoItem> = {
  // biome-ignore lint/suspicious/noExplicitAny: This is for flexibility
  [K: string]: QueryFunction<T, any, any>;
};

export type MappedQueries<T extends DynamoItem, Q extends QueryRecord<T>> = {
  [K in keyof Q]: Q[K] extends QueryFunction<T, infer I, infer R> ? (input: I) => R : never;
};

// Define a type for entity with only scan, get and query methods
export type QueryEntity<
  T extends DynamoItem,
  TConfig extends TableConfig = TableConfig,
  TEntityTypeAttribute extends string = "entityType",
> = {
  scan: () => ScanBuilder<T, TConfig>;
  get: (key: PrimaryKeyWithoutExpression) => EntityGetBuilder<T>;
  query: (keyCondition: PrimaryKey) => QueryBuilder<T, TConfig>;
  searchVectors: <TIndexName extends VectorIndexNames<TConfig>>(
    indexName: TIndexName,
    input: EntityVectorSearchInput<TConfig, TIndexName, TEntityTypeAttribute>,
  ) => VectorSearchBuilder<T, TConfig, TIndexName>;
};

export type EntityVectorSearchInput<
  TConfig extends TableConfig,
  TIndexName extends VectorIndexNames<TConfig>,
  TEntityTypeAttribute extends string,
> =
  VectorIndexFor<TConfig, TIndexName> extends { readonly partitionKey: TEntityTypeAttribute }
    ? Omit<VectorSearchInput<TConfig, TIndexName>, "partition"> & { partition?: never }
    : VectorSearchInput<TConfig, TIndexName>;

export type {
  EntityDeleteBuilder,
  EntityGetBuilder,
  EntityPutBuilder,
  EntityUpdateBuilder,
} from "./entity-aware-builders.js";

interface Settings<TEntityTypeAttribute extends string = string> {
  /**
   * Defaults to "entityType"
   */
  entityTypeAttributeName?: TEntityTypeAttribute;
  timestamps?: {
    createdAt?: {
      /**
       * ISO vs Unix trade-offs
       *
       * Both options support between, greater than and less than comparisons.
       *
       * ISO:
       * - Human readable, but requires more storage space
       * - Does not work with DynamoDBs TTL feature.
       *
       * UNIX:
       * - Less readable, but requires less storage space.
       * - Works with DynamoDBs TTL feature.
       */
      format: "ISO" | "UNIX";
      /**
       * Defaults to "createdAt"
       */
      attributeName?: string;
    };
    updatedAt?: {
      /**
       * ISO vs Unix trade-offs
       *
       * Both options support between, greater than and less than comparisons.
       *
       * ISO:
       * - Human readable, but requires more storage space
       * - Does not work with DynamoDBs TTL feature.
       *
       * UNIX:
       * - Less readable, but requires less storage space.
       * - Works with DynamoDBs TTL feature.
       */
      format: "ISO" | "UNIX";
      /**
       * Defaults to "updatedAt"
       */
      attributeName?: string;
    };
  };
}

export interface EntityConfig<
  T extends DynamoItem,
  TInput extends DynamoItem = T,
  I extends DynamoItem = T,
  Q extends QueryRecord<T> = QueryRecord<T>,
  TEntityTypeAttribute extends string = "entityType",
  TKey extends IndexKey = IndexKey,
> {
  name: string;
  schema: StandardSchemaV1<TInput, T>;
  primaryKey: IndexDefinition<I, TKey>;
  indexes?: Record<string, IndexDefinition<T>>;
  queries: Q;
  settings?: Settings<TEntityTypeAttribute>;
}

export interface EntityRepository<
  /**
   * The Entity Type (output type)
   */
  T extends DynamoItem,
  /**
   * The Input Type (for create operations)
   */
  TInput extends DynamoItem = T,
  /**
   * The Primary Index (Partition index) Type
   */
  I extends DynamoItem = T,
  /**
   * The Queries object
   */
  Q extends QueryRecord<T> = QueryRecord<T>,
  TConfig extends TableConfig = TableConfig,
  TEntityTypeAttribute extends string = "entityType",
> {
  create: (data: TInput) => EntityPutBuilder<T, TInput, true>;
  upsert: (data: TInput) => EntityPutBuilder<T, TInput>;
  get: (key: I) => EntityGetBuilder<T>;
  update: (key: I, data: Partial<T>) => EntityUpdateBuilder<T>;
  delete: (key: I) => EntityDeleteBuilder;
  query: MappedQueries<T, Q>;
  scan: () => ScanBuilder<T, TConfig>;
  searchVectors: <TIndexName extends VectorIndexNames<TConfig>>(
    indexName: TIndexName,
    input: EntityVectorSearchInput<TConfig, TIndexName, TEntityTypeAttribute>,
  ) => VectorSearchBuilder<T, TConfig, TIndexName>;
}

export interface EntityDefinition<
  T extends DynamoItem,
  TInput extends DynamoItem = T,
  I extends DynamoItem = T,
  Q extends QueryRecord<T> = QueryRecord<T>,
  TEntityTypeAttribute extends string = "entityType",
  TKey extends IndexKey = IndexKey,
> {
  name: string;
  entityTypeAttributeName: TEntityTypeAttribute;
  /**
   * Generates the primary key (`pk`, plus `sk` when the primary index has a sort key) without a table.
   * Takes the same key input as `get`, `update`, and `delete`, validated against the primary key schema.
   *
   * @example
   * ```typescript
   * const { pk, sk } = UserEntity.getKey({ id: "123" });
   * ```
   */
  getKey: (key: I) => TKey;
  createRepository: <TConfig extends TableConfig>(
    table: Table<TConfig>,
  ) => EntityRepository<T, TInput, I, Q, TConfig, TEntityTypeAttribute>;
}

function createScopedQueryEntity<
  T extends DynamoItem,
  TConfig extends TableConfig,
  TEntityTypeAttribute extends string,
>(
  table: Table<TConfig>,
  entityTypeAttributeName: TEntityTypeAttribute,
  entityName: string,
  context: BuilderContext,
  scopedBuilders: WeakSet<object>,
): QueryEntity<T, TConfig, TEntityTypeAttribute> {
  const track = <R extends object>(builder: R): R => {
    scopedBuilders.add(builder);
    return builder;
  };

  return {
    scan: () => track(table.scan<T>(context).filter(eq(entityTypeAttributeName, entityName))),
    get: (key) => track(new EntityGetBuilder(table.get<T>(key, context), entityName)),
    query: (keyCondition) =>
      track(table.query<T>(keyCondition, context).filter(eq(entityTypeAttributeName, entityName))),
    searchVectors: (indexName, input) =>
      track(scopedVectorSearch(table, indexName, input, entityTypeAttributeName, entityName, context)),
  };
}

function scopedVectorSearch<
  T extends DynamoItem,
  TConfig extends TableConfig,
  TIndexName extends VectorIndexNames<TConfig>,
  TEntityTypeAttribute extends string,
>(
  table: Table<TConfig>,
  indexName: TIndexName,
  input: EntityVectorSearchInput<TConfig, TIndexName, TEntityTypeAttribute>,
  entityTypeAttributeName: TEntityTypeAttribute,
  entityName: string,
  context: BuilderContext = {},
): VectorSearchBuilder<T, TConfig, TIndexName> {
  const index = table.vectorIndexes[String(indexName)];
  if (!index) {
    throw ConfigurationErrors.vectorIndexNotFound(String(indexName), table.tableName, Object.keys(table.vectorIndexes));
  }
  if (index.partitionKey === entityTypeAttributeName) {
    return table.searchVectors<T, TIndexName>(
      indexName,
      { ...input, partition: entityName } as unknown as VectorSearchInput<TConfig, TIndexName>,
      context,
    );
  }
  if (!(index.inlineFilters ?? []).includes(entityTypeAttributeName)) {
    throw ConfigurationErrors.vectorEntityScopeInvalid(entityName, entityTypeAttributeName, String(indexName));
  }
  const builder = table.searchVectors<T, TIndexName>(
    indexName,
    input as VectorSearchInput<TConfig, TIndexName>,
    context,
  );
  builder.filter((operator) => operator.eq(entityTypeAttributeName as never, entityName as never));
  return builder;
}

/**
 * Creates an entity definition with type-safe operations
 *
 * @example
 * ```typescript
 * interface User {
 *   id: string;
 *   name: string;
 * }
 *
 * const UserEntity = defineEntity<User>({
 *   name: "User",
 *   schema: userSchema,
 *   primaryKey: primaryKey,
 * });
 * ```
 */
export function defineEntity<
  T extends DynamoItem,
  TInput extends DynamoItem = T,
  I extends DynamoItem = T,
  Q extends QueryRecord<T> = QueryRecord<T>,
  const TEntityTypeAttribute extends string = "entityType",
  TKey extends IndexKey = IndexKey,
>(
  config: EntityConfig<T, TInput, I, Q, TEntityTypeAttribute, TKey>,
): EntityDefinition<T, TInput, I, Q, TEntityTypeAttribute, TKey> {
  const entityTypeAttributeName = (config.settings?.entityTypeAttributeName ?? "entityType") as TEntityTypeAttribute;

  /**
   * Generates an object containing timestamp attributes based on the given configuration settings.
   * The function determines the presence and format of "createdAt" and "updatedAt" timestamps dynamically.
   *
   * @param {Array<"createdAt" | "updatedAt">} timestampsToGenerate - Array of timestamp types to generate.
   * @param {Partial<T>} data - Data object to check for existing timestamps.
   * @returns {Record<string, string | number>} An object containing one or both of the "createdAt" and "updatedAt" timestamp attributes, depending on the configuration and requested types. Each timestamp can be formatted as either an ISO string or a UNIX timestamp.
   */
  const generateTimestamps = (
    timestampsToGenerate: Array<"createdAt" | "updatedAt">,
    data: Partial<T>,
  ): Record<string, string | number> => {
    if (!config.settings?.timestamps) return {};

    const timestamps: Record<string, string | number> = {};
    const now = new Date();
    const unixTime = Math.floor(Date.now() / 1000);

    const { createdAt, updatedAt } = config.settings.timestamps;

    /**
     * If the data object already has a createdAt value, skip generating it.
     */
    if (
      createdAt &&
      timestampsToGenerate.includes("createdAt") &&
      data[createdAt.attributeName ?? "createdAt"] === undefined
    ) {
      const name = createdAt.attributeName ?? "createdAt";
      timestamps[name] = createdAt.format === "UNIX" ? unixTime : now.toISOString();
    }

    /**
     * If the data object already has an updatedAt value, skip generating it.
     */
    if (
      updatedAt &&
      timestampsToGenerate.includes("updatedAt") &&
      data[updatedAt.attributeName ?? "updatedAt"] === undefined
    ) {
      const name = updatedAt.attributeName ?? "updatedAt";
      timestamps[name] = updatedAt.format === "UNIX" ? unixTime : now.toISOString();
    }

    return timestamps;
  };

  const itemPreparationConfig: ItemPreparationConfig<T, TInput, I> = {
    name: config.name,
    schema: config.schema,
    primaryKey: config.primaryKey,
    indexes: config.indexes,
    entityTypeAttributeName,
    generateTimestamps: (data: Partial<T>) => generateTimestamps(["createdAt", "updatedAt"], data),
  };

  return {
    name: config.name,
    entityTypeAttributeName,
    getKey: (key) => config.primaryKey.generateKey(key),
    createRepository: <TConfig extends TableConfig>(
      table: Table<TConfig>,
    ): EntityRepository<T, TInput, I, Q, TConfig, TEntityTypeAttribute> => {
      return {
        create: (data: TInput) => {
          const builder = table.create<T>({} as T, { entityNames: [config.name] });
          return new EntityPutBuilder(
            builder,
            config.name,
            data,
            (candidate) => prepareItemSync(itemPreparationConfig, table, "create", candidate),
            (candidate) => prepareItemAsync(itemPreparationConfig, table, "create", candidate),
          );
        },

        upsert: (data: TInput) => {
          const builder = table.put<T>({} as T, { entityNames: [config.name] });
          return new EntityPutBuilder(
            builder,
            config.name,
            data,
            (candidate) => prepareItemSync(itemPreparationConfig, table, "upsert", candidate),
            (candidate) => prepareItemAsync(itemPreparationConfig, table, "upsert", candidate),
          );
        },

        get: <K extends I>(key: K) => {
          return new EntityGetBuilder(
            table.get<T>(config.primaryKey.generateKey(key), { entityNames: [config.name] }),
            config.name,
          );
        },

        update: <K extends I>(key: K, data: Partial<T>) => {
          const primaryKeyObj = config.primaryKey.generateKey(key);
          const builder = table.update<T>(primaryKeyObj, { entityNames: [config.name] });

          builder.condition(eq(entityTypeAttributeName, config.name));

          return new EntityUpdateBuilder(builder, config.name, {
            data,
            key: key as unknown as T,
            table,
            indexes: config.indexes,
            generateTimestamps: (updates) => generateTimestamps(["updatedAt"], updates),
          });
        },

        delete: <K extends I>(key: K) => {
          const builder = new EntityDeleteBuilder(
            table.delete(config.primaryKey.generateKey(key), { entityNames: [config.name] }),
            config.name,
          );
          builder.condition(eq(entityTypeAttributeName, config.name));
          return builder;
        },

        query: Object.fromEntries(
          Object.entries(config.queries || {}).map(([key, inputCallback]) => [
            key,
            (input: unknown) => {
              // Only builders created through the scoped entity carry its entity filter.
              const scopedContext: BuilderContext = { entityNames: [config.name] };
              const scopedBuilders = new WeakSet<object>();
              const builder = inputCallback(input)(
                createScopedQueryEntity(table, entityTypeAttributeName, config.name, scopedContext, scopedBuilders),
              );
              const clonedFromScopedBuilder =
                typeof builder === "object" &&
                builder !== null &&
                (builder as unknown as { context?: BuilderContext }).context === scopedContext;
              if (!scopedBuilders.has(builder) && !clonedFromScopedBuilder) {
                throw EntityErrors.invalidQueryBuilder(config.name, key);
              }
              return builder;
            },
          ]),
        ) as MappedQueries<T, Q>,

        scan: () => {
          const builder = table.scan<T>({ entityNames: [config.name] });
          builder.filter(eq(entityTypeAttributeName, config.name));
          return builder;
        },

        searchVectors: (indexName, input) =>
          scopedVectorSearch(table, indexName, input, entityTypeAttributeName, config.name, {
            entityNames: [config.name],
          }),
      };
    },
  };
}

/**
 * Creates type-safe custom entity queries.
 *
 * Query input declarations are compile-time only and do not perform runtime validation.
 */
export function createQueries<T extends DynamoItem>() {
  return {
    input: <I = void>() => ({
      query: <
        R extends
          | ScanBuilder<T>
          | QueryBuilder<T, TableConfig>
          | GetBuilder<T>
          | EntityGetBuilder<T>
          | VectorSearchBuilder<T>,
      >(
        handler: (params: { input: I; entity: QueryEntity<T> }) => R,
      ) => {
        const queryFn = (input: I) => (entity: QueryEntity<T>) => handler({ input, entity });
        return queryFn as unknown as QueryFunction<T, I, R>;
      },
    }),
  };
}
