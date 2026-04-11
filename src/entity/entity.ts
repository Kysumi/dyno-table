import type {
  DeleteBuilder,
  GetBuilder,
  Path,
  PathType,
  PutBuilder,
  QueryBuilder,
  ScanBuilder,
} from "../builders";
import { UpdateBuilder } from "../builders";
import {
  EntityAwareDeleteBuilder,
  EntityAwareGetBuilder,
  EntityAwarePutBuilder,
} from "../builders/entity-aware-builders";
import {
  type Condition,
  type ConditionOperator,
  eq,
  type PrimaryKey,
  type PrimaryKeyWithoutExpression,
} from "../conditions";
import { DynoTableError } from "../errors";
import type { StandardSchemaV1, StandardSchemaV1 as StandardSchemaV1Namespace } from "../standard-schema";
import type { Table } from "../table";
import type { DynamoItem, Index, TableConfig } from "../types";
import { EntityErrors, ValidationErrors } from "../utils/error-factory";
import { extractRequiredAttributes } from "../utils/error-utils";
import { buildIndexes as buildEntityIndexes, buildIndexUpdates } from "./index-utils";

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
export type QueryEntity<T extends DynamoItem> = {
  scan: () => ScanBuilder<T>;
  get: (key: PrimaryKeyWithoutExpression) => EntityAwareGetBuilder<T>;
  query: (keyCondition: PrimaryKey) => QueryBuilder<T, TableConfig>;
};

type EntityWriteMode = "create" | "upsert";

interface PreparedEntityWrite<TItem> {
  item: TItem;
}

type SetElementType<T> = T extends Set<infer U> ? U : T extends Array<infer U> ? U : never;
type PathSetElementType<T, K extends Path<T>> = SetElementType<PathType<T, K>>;

export type EntityPutBuilder<T extends DynamoItem> = EntityAwarePutBuilder<T>;
export type EntityGetBuilder<T extends DynamoItem> = EntityAwareGetBuilder<T>;
export type EntityDeleteBuilder = EntityAwareDeleteBuilder;
export type EntityUpdateBuilder<T extends DynamoItem> = UpdateBuilder<T>;
export type EntityScanBuilder<T extends DynamoItem> = ScanBuilder<T>;
export type EntityQueryBuilder<T extends DynamoItem, TConfig extends TableConfig = TableConfig> = QueryBuilder<
  T,
  TConfig
>;

interface Settings {
  /**
   * Defaults to "entityType"
   */
  entityTypeAttributeName?: string;
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
> {
  name: string;
  schema: StandardSchemaV1<TInput, T>;
  primaryKey: IndexDefinition<I>;
  indexes?: Record<string, IndexDefinition<T>>;
  queries: Q;
  settings?: Settings;
}

export interface UpdateOptions {
  /** Index names whose keys should be forcibly regenerated even if the source attributes haven't changed */
  forceRebuildIndexes?: string[];
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
> {
  create: (data: TInput) => EntityPutBuilder<T>;
  upsert: (data: TInput & I) => EntityPutBuilder<T>;
  get: (key: I) => EntityGetBuilder<T>;
  update: (key: I, data: Partial<T>, options?: UpdateOptions) => UpdateBuilder<T>;
  delete: (key: I) => EntityDeleteBuilder;
  query: MappedQueries<T, Q>;
  scan: () => ScanBuilder<T>;
}

export interface EntityDefinition<
  T extends DynamoItem,
  TInput extends DynamoItem = T,
  I extends DynamoItem = T,
  Q extends QueryRecord<T> = QueryRecord<T>,
> {
  name: string;
  createRepository: (table: Table) => EntityRepository<T, TInput, I, Q>;
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
>(config: EntityConfig<T, TInput, I, Q>): EntityDefinition<T, TInput, I, Q> {
  const entityTypeAttributeName = config.settings?.entityTypeAttributeName ?? "entityType";

  /**
   * Builds secondary indexes for an item based on the configured indexes
   */
  const buildIndexes = <TData extends T>(
    dataForKeyGeneration: TData,
    table: Table,
    excludeReadOnly = false,
  ): Record<string, string> => {
    return buildEntityIndexes(dataForKeyGeneration, table, config.indexes, excludeReadOnly);
  };

  /**
   * Generates timestamp attributes based on configuration.
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

    if (createdAt && timestampsToGenerate.includes("createdAt") && !data.createdAt) {
      const name = createdAt.attributeName ?? "createdAt";
      timestamps[name] = createdAt.format === "UNIX" ? unixTime : now.toISOString();
    }

    if (updatedAt && timestampsToGenerate.includes("updatedAt") && !data.updatedAt) {
      const name = updatedAt.attributeName ?? "updatedAt";
      timestamps[name] = updatedAt.format === "UNIX" ? unixTime : now.toISOString();
    }

    return timestamps;
  };

  const prepareValidatedEntityItem = (
    mode: EntityWriteMode,
    table: Table,
    validatedData: T,
  ): PreparedEntityWrite<T> => {
    const dataForKeyGeneration = {
      ...validatedData,
      ...generateTimestamps(["createdAt", "updatedAt"], validatedData),
    };

    let primaryKey: { pk: string; sk?: string };
    try {
      primaryKey = config.primaryKey.generateKey(dataForKeyGeneration as unknown as I);

      if (primaryKey.pk === undefined || primaryKey.pk === null) {
        throw EntityErrors.keyInvalidFormat(config.name, mode, dataForKeyGeneration, primaryKey);
      }
    } catch (error) {
      if (error instanceof DynoTableError) throw error;

      throw EntityErrors.keyGenerationFailed(
        config.name,
        mode,
        dataForKeyGeneration,
        extractRequiredAttributes(error),
        error instanceof Error ? error : undefined,
      );
    }

    return {
      item: {
        ...(dataForKeyGeneration as unknown as T),
        [entityTypeAttributeName]: config.name,
        [table.partitionKey]: primaryKey.pk,
        ...(table.sortKey ? { [table.sortKey]: primaryKey.sk } : {}),
        ...buildIndexes(dataForKeyGeneration as unknown as T, table, false),
      },
    };
  };

  const prepareEntityWrite = (mode: EntityWriteMode, table: Table, data: TInput): PreparedEntityWrite<T> => {
    const validationResult = config.schema["~standard"].validate(data);

    if (validationResult instanceof Promise) {
      throw EntityErrors.asyncValidationNotSupported(config.name, mode);
    }

    if ("issues" in validationResult && validationResult.issues) {
      throw EntityErrors.validationFailed(config.name, mode, validationResult.issues, data);
    }

    return prepareValidatedEntityItem(mode, table, validationResult.value);
  };

  return {
    name: config.name,
    createRepository: (table: Table): EntityRepository<T, TInput, I, Q> => {
      const repository = {
        create: (data: TInput): EntityAwarePutBuilder<T> => {
          const { item } = prepareEntityWrite("create", table, data);
          const builder = new EntityAwarePutBuilder<T>(
            table.getPutExecutor<T>(),
            item,
            table.tableName,
            config.name,
          );
          builder.condition((op: ConditionOperator<T>) => op.attributeNotExists(table.partitionKey as Path<T>));
          builder.returnValues("INPUT");
          return builder;
        },

        upsert: (data: TInput & I): EntityAwarePutBuilder<T> => {
          const { item } = prepareEntityWrite("upsert", table, data);
          const builder = new EntityAwarePutBuilder<T>(
            table.getPutExecutor<T>(),
            item,
            table.tableName,
            config.name,
          );
          builder.returnValues("INPUT");
          return builder;
        },

        get: <K extends I>(key: K): EntityAwareGetBuilder<T> => {
          const primaryKeyObj = config.primaryKey.generateKey(key);
          return new EntityAwareGetBuilder<T>(
            table.getGetExecutor<T>(primaryKeyObj),
            primaryKeyObj,
            table.tableName,
            table.getIndexAttributeNames(),
            config.name,
          );
        },

        update: <K extends I>(key: K, data: Partial<T>, options?: UpdateOptions): UpdateBuilder<T> => {
          const primaryKeyObj = config.primaryKey.generateKey(key);
          const timestamps = generateTimestamps(["updatedAt"], data);
          const updatedItem = { ...(key as unknown as T), ...data, ...timestamps } as T;
          const indexUpdates = buildIndexUpdates(
            key as unknown as T,
            updatedItem,
            table,
            config.indexes,
            options?.forceRebuildIndexes ?? [],
          );

          const builder = new UpdateBuilder<T>(
            table.getUpdateExecutor<T>(primaryKeyObj),
            table.tableName,
            primaryKeyObj,
          );
          builder.condition(eq(entityTypeAttributeName, config.name));
          builder.set({ ...data, ...timestamps, ...indexUpdates } as Partial<T>);
          return builder;
        },

        delete: <K extends I>(key: K): EntityAwareDeleteBuilder => {
          const primaryKeyObj = config.primaryKey.generateKey(key);
          const builder = new EntityAwareDeleteBuilder(
            table.getDeleteExecutor(primaryKeyObj),
            table.tableName,
            primaryKeyObj,
            config.name,
          );
          builder.condition(eq(entityTypeAttributeName, config.name));
          return builder;
        },

        query: Object.entries(config.queries || {}).reduce(
          (acc, [queryKey, inputCallback]) => {
            (acc as any)[queryKey] = (input: unknown) => {
              const queryFn = (config.queries as unknown as Record<string, QueryFunctionWithSchema<T, I, unknown>>)[
                queryKey
              ];
              const schema = queryFn?.schema;

              // Validate input early if synchronous
              if (schema?.["~standard"]?.validate) {
                const validationResult = schema["~standard"].validate(input);
                if (!(validationResult instanceof Promise) && "issues" in validationResult && validationResult.issues) {
                  throw EntityErrors.queryInputValidationFailed(config.name, queryKey, validationResult.issues, input);
                }
              }

              // Create a QueryEntity object with only the necessary methods
              const queryEntity: QueryEntity<T> = {
                scan: repository.scan,
                get: (key: PrimaryKeyWithoutExpression): EntityAwareGetBuilder<T> => {
                  return new EntityAwareGetBuilder<T>(
                    table.getGetExecutor<T>(key),
                    key,
                    table.tableName,
                    table.getIndexAttributeNames(),
                    config.name,
                  );
                },
                query: (keyCondition: PrimaryKey): QueryBuilder<T, TableConfig> => {
                  const builder = table.query<T>(keyCondition);
                  builder.filter(eq(entityTypeAttributeName, config.name));
                  return builder;
                },
              };

              // Execute the query function to get the builder
              const queryBuilderCallback = inputCallback(input);

              // Run the inner handler which allows the user to apply their desired constraints
              const builder = queryBuilderCallback(queryEntity);

              // If validation is async, attach a prepare hook to the returned builder
              if (
                schema?.["~standard"]?.validate &&
                builder &&
                typeof builder === "object" &&
                "prepare" in builder &&
                typeof (builder as any).prepare === "function"
              ) {
                const validationPromiseOrResult = schema["~standard"].validate(input);
                if (validationPromiseOrResult instanceof Promise) {
                  (builder as any).prepare({
                    prepare: async () => {
                      const validationResult = await validationPromiseOrResult;
                      if ("issues" in validationResult && validationResult.issues) {
                        throw EntityErrors.queryInputValidationFailed(
                          config.name,
                          queryKey,
                          validationResult.issues,
                          input,
                        );
                      }
                    },
                  });
                }
              }

              return builder;
            };
            return acc;
          },
          {} as MappedQueries<T, Q>,
        ),

        scan: (): ScanBuilder<T> => {
          const builder = table.scan<T>();
          builder.filter(eq(entityTypeAttributeName, config.name));
          return builder;
        },
      };

      return repository;
    },
  };
}

export function createQueries<T extends DynamoItem>() {
  return {
    input: <I>(schema: StandardSchemaV1<I>) => ({
      query: <R extends ScanBuilder<T> | QueryBuilder<T, TableConfig> | GetBuilder<T>>(
        handler: (params: { input: I; entity: QueryEntity<T> }) => R,
      ) => {
        const queryFn = (input: I) => (entity: QueryEntity<T>) => handler({ input, entity });
        queryFn.schema = schema;
        return queryFn as unknown as QueryFunctionWithSchema<T, I, R>;
      },
    }),
  };
}
/**
 * Defines a DynamoDB index configuration
 */
export interface IndexDefinition<T extends DynamoItem> extends Index<T> {
  /** The name of the index */
  name: string;
  /** Whether the index is read-only */
  isReadOnly: boolean;
  /** Function to generate the index key from an item */
  generateKey: (item: T) => { pk: string; sk?: string };
}

type Result<T> = StandardSchemaV1Namespace.Result<T>;

export function createIndex() {
  return {
    input: <T extends DynamoItem>(schema: StandardSchemaV1<T>) => {
      const createIndexBuilder = (isReadOnly = false) => ({
        partitionKey: <P extends (item: T) => string>(pkFn: P) => ({
          sortKey: <S extends (item: T) => string>(skFn: S) => {
            const index = {
              name: "custom",
              partitionKey: "pk",
              sortKey: "sk",
              isReadOnly: isReadOnly,
              generateKey: (item: T) => {
                const data = schema["~standard"].validate(item) as Result<T>;
                if ("issues" in data && data.issues) {
                  throw ValidationErrors.indexSchemaValidationFailed(data.issues, "both");
                }
                const validData = "value" in data ? data.value : item;
                return { pk: pkFn(validData), sk: skFn(validData) };
              },
            } as IndexDefinition<T>;

            return Object.assign(index, {
              readOnly: (value = false) =>
                ({
                  ...index,
                  isReadOnly: value,
                }) as IndexDefinition<T>,
            });
          },

          withoutSortKey: () => {
            const index = {
              name: "custom",
              partitionKey: "pk",
              isReadOnly: isReadOnly,
              generateKey: (item: T) => {
                const data = schema["~standard"].validate(item) as Result<T>;
                if ("issues" in data && data.issues) {
                  throw ValidationErrors.indexSchemaValidationFailed(data.issues, "partition");
                }
                const validData = "value" in data ? data.value : item;
                return { pk: pkFn(validData) };
              },
            } as IndexDefinition<T>;

            return Object.assign(index, {
              readOnly: (value = true) =>
                ({
                  ...index,
                  isReadOnly: value,
                }) as IndexDefinition<T>,
            });
          },
        }),

        readOnly: (value = true) => createIndexBuilder(value),
      });

      return createIndexBuilder(false);
    },
  };
}
