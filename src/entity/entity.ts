import type { BeforeExecute, BuilderContext } from "../builders/builder-types.js";
import type {
  GetBuilder,
  Path,
  PathType,
  QueryBuilder,
  ScanBuilder,
  TransactionBuilder,
  UpdateBuilder,
  UpdateCommandParams,
  VectorSearchBuilder,
  VectorSearchInput,
} from "../builders.js";
import {
  type Condition,
  type ConditionOperator,
  eq,
  type PrimaryKey,
  type PrimaryKeyWithoutExpression,
} from "../conditions.js";
import type { StandardSchemaV1 } from "../standard-schema.js";
import type { Table } from "../table.js";
import type { DynamoItem, TableConfig, VectorIndexFor, VectorIndexNames } from "../types.js";
import { ConfigurationErrors, EntityErrors } from "../utils/error-factory.js";
import type { IndexDefinition } from "./create-index.js";
import {
  createEntityAwareUpdateBuilder,
  EntityAwareDeleteBuilder,
  EntityAwareGetBuilder,
  EntityAwarePutBuilder,
  type EntityDeleteBuilder,
  type EntityGetBuilder,
  type EntityPutBuilder,
} from "./entity-aware-builders.js";
import { type ItemPreparationConfig, prepareItemAsync, prepareItemSync } from "./item-preparation.js";

export {
  type BuiltIndexDefinition,
  type CreateIndexBuilder,
  createIndex,
  type IndexBuilder,
  type IndexDefinition,
  type PartitionKeyIndexBuilder,
} from "./create-index.js";

// Define the QueryFunction type with a generic return type
export type QueryFunction<_T extends DynamoItem, I, R> = (input: I) => R;

// Define a type for the query record that preserves the input type for each query function
export type QueryFunctionWithSchema<T extends DynamoItem, I, R> = QueryFunction<T, I, R> & {
  schema?: StandardSchemaV1<I>;
};

export type QueryRecord<T extends DynamoItem> = {
  // biome-ignore lint/suspicious/noExplicitAny: This is for flexibility
  [K: string]: QueryFunctionWithSchema<T, any, any>;
};

export type MappedQueries<T extends DynamoItem, Q extends QueryRecord<T>> = {
  [K in keyof Q]: Q[K] extends QueryFunctionWithSchema<T, infer I, infer R> ? (input: I) => R : never;
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

type SetElementType<T> = T extends Set<infer U> ? U : T extends Array<infer U> ? U : never;
type PathSetElementType<T, K extends Path<T>> = SetElementType<PathType<T, K>>;

export type { EntityDeleteBuilder, EntityGetBuilder, EntityPutBuilder } from "./entity-aware-builders.js";

export type EntityUpdateBuilder<T extends DynamoItem> = {
  readonly entityName: string;
  set(values: Partial<T>): EntityUpdateBuilder<T>;
  set<K extends Path<T>>(path: K, value: PathType<T, K>): EntityUpdateBuilder<T>;
  remove<K extends Path<T>>(path: K): EntityUpdateBuilder<T>;
  add<K extends Path<T>>(path: K, value: PathType<T, K>): EntityUpdateBuilder<T>;
  deleteElementsFromSet<K extends Path<T>>(
    path: K,
    value: PathSetElementType<T, K>[] | Set<PathSetElementType<T, K>>,
  ): EntityUpdateBuilder<T>;
  condition(condition: Condition | ((op: ConditionOperator<T>) => Condition)): EntityUpdateBuilder<T>;
  returnValues(returnValues: "ALL_NEW" | "UPDATED_NEW" | "ALL_OLD" | "UPDATED_OLD" | "NONE"): EntityUpdateBuilder<T>;
  returnConsumedCapacity(value: "INDEXES" | "TOTAL" | "NONE"): EntityUpdateBuilder<T>;
  toDynamoCommand(): UpdateCommandParams;
  withTransaction(transaction: TransactionBuilder): void;
  debug(): ReturnType<UpdateBuilder<T>["debug"]>;
  execute(): Promise<{ item?: T }>;
  executeWithMetadata(): ReturnType<UpdateBuilder<T>["executeWithMetadata"]>;
  forceIndexRebuild(indexes: string | string[]): EntityUpdateBuilder<T>;
  getForceRebuildIndexes(): string[];
};

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
> {
  name: string;
  schema: StandardSchemaV1<TInput, T>;
  primaryKey: IndexDefinition<I>;
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
  create: (data: TInput) => EntityPutBuilder<T>;
  upsert: (data: TInput & I) => EntityPutBuilder<T>;
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
> {
  name: string;
  entityTypeAttributeName: TEntityTypeAttribute;
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
    get: (key) => track(new EntityAwareGetBuilder(table.get<T>(key, context), entityName)),
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

function createQueryInputValidator(
  schema: StandardSchemaV1<unknown> | undefined,
  entityName: string,
  queryName: string,
  input: unknown,
): BeforeExecute {
  return async () => {
    if (!schema) return;
    const validationResult = await schema["~standard"].validate(input);
    if (validationResult.issues) {
      throw EntityErrors.queryInputValidationFailed(entityName, queryName, validationResult.issues, input);
    }
  };
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
>(
  config: EntityConfig<T, TInput, I, Q, TEntityTypeAttribute>,
): EntityDefinition<T, TInput, I, Q, TEntityTypeAttribute> {
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
    if (createdAt && timestampsToGenerate.includes("createdAt") && !data.createdAt) {
      const name = createdAt.attributeName ?? "createdAt";
      timestamps[name] = createdAt.format === "UNIX" ? unixTime : now.toISOString();
    }

    /**
     * If the data object already has an updatedAt value, skip generating it.
     */
    if (updatedAt && timestampsToGenerate.includes("updatedAt") && !data.updatedAt) {
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
    createRepository: <TConfig extends TableConfig>(
      table: Table<TConfig>,
    ): EntityRepository<T, TInput, I, Q, TConfig, TEntityTypeAttribute> => {
      return {
        create: (data: TInput) => {
          const builder = table.create<T>({} as T, { entityName: config.name });
          return new EntityAwarePutBuilder(
            builder,
            config.name,
            () => prepareItemSync(itemPreparationConfig, table, "create", data),
            () => prepareItemAsync(itemPreparationConfig, table, "create", data),
          );
        },

        upsert: (data: TInput & I) => {
          const builder = table.put<T>({} as T, { entityName: config.name });
          return new EntityAwarePutBuilder(
            builder,
            config.name,
            () => prepareItemSync(itemPreparationConfig, table, "upsert", data),
            () => prepareItemAsync(itemPreparationConfig, table, "upsert", data),
            (item) => item,
          );
        },

        get: <K extends I>(key: K) => {
          return new EntityAwareGetBuilder(
            table.get<T>(config.primaryKey.generateKey(key), { entityName: config.name }),
            config.name,
          );
        },

        update: <K extends I>(key: K, data: Partial<T>) => {
          const primaryKeyObj = config.primaryKey.generateKey(key);
          const builder = table.update<T>(primaryKeyObj, { entityName: config.name });

          builder.condition(eq(entityTypeAttributeName, config.name));

          return createEntityAwareUpdateBuilder(builder, config.name, {
            data,
            key: key as unknown as T,
            table,
            indexes: config.indexes,
            generateTimestamps: () => generateTimestamps(["updatedAt"], data),
          });
        },

        delete: <K extends I>(key: K) => {
          const builder = new EntityAwareDeleteBuilder(
            table.delete(config.primaryKey.generateKey(key), { entityName: config.name }),
            config.name,
          );
          builder.condition(eq(entityTypeAttributeName, config.name));
          return builder;
        },

        query: Object.fromEntries(
          Object.entries(config.queries || {}).map(([key, inputCallback]) => [
            key,
            (input: unknown) => {
              const beforeExecute = createQueryInputValidator(inputCallback.schema, config.name, key, input);
              // Only builders created through the scoped entity carry its filter and input-validation guard.
              const scopedBuilders = new WeakSet<object>();
              const builder = inputCallback(input)(
                createScopedQueryEntity(
                  table,
                  entityTypeAttributeName,
                  config.name,
                  { beforeExecute, entityName: config.name },
                  scopedBuilders,
                ),
              );
              const clonedFromScopedBuilder =
                typeof builder === "object" &&
                builder !== null &&
                (builder as unknown as { context?: BuilderContext }).context?.beforeExecute === beforeExecute;
              if (!scopedBuilders.has(builder) && !clonedFromScopedBuilder) {
                throw EntityErrors.invalidQueryBuilder(config.name, key);
              }
              return builder;
            },
          ]),
        ) as MappedQueries<T, Q>,

        scan: () => {
          const builder = table.scan<T>({ entityName: config.name });
          builder.filter(eq(entityTypeAttributeName, config.name));
          return builder;
        },

        searchVectors: (indexName, input) =>
          scopedVectorSearch(table, indexName, input, entityTypeAttributeName, config.name, {
            entityName: config.name,
          }),
      };
    },
  };
}

export function createQueries<T extends DynamoItem>() {
  return {
    input: <I>(schema: StandardSchemaV1<I>) => ({
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
        queryFn.schema = schema;
        return queryFn as unknown as QueryFunctionWithSchema<T, I, R>;
      },
    }),
  };
}
