import type {
  EntityAwareDeleteBuilder,
  EntityAwareGetBuilder,
  EntityAwarePutBuilder,
  EntityAwareUpdateBuilder,
} from "../builders/entity-aware-builders";
import {
  createEntityAwareDeleteBuilder,
  createEntityAwareGetBuilder,
  createEntityAwarePutBuilder,
  createEntityAwareUpdateBuilder,
} from "../builders/entity-aware-builders";
import type { GetBuilder } from "../builders/get-builder";
import type { PutBuilder } from "../builders/put-builder";
import type { QueryBuilder } from "../builders/query-builder";
import type { ScanBuilder } from "../builders/scan-builder";
import { eq, type PrimaryKey, type PrimaryKeyWithoutExpression } from "../conditions";
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
  create: (data: TInput) => EntityAwarePutBuilder<T>;
  upsert: (data: TInput & I) => EntityAwarePutBuilder<T>;
  get: (key: I) => EntityAwareGetBuilder<T>;
  update: (key: I, data: Partial<T>) => EntityAwareUpdateBuilder<T>;
  delete: (key: I) => EntityAwareDeleteBuilder;
  query: MappedQueries<T, Q>;
  scan: () => ScanBuilder<T>;
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
>(config: EntityConfig<T, TInput, I, Q>) {
  const entityTypeAttributeName = config.settings?.entityTypeAttributeName ?? "entityType";

  /**
   * Builds secondary indexes for an item based on the configured indexes
   *
   * @param dataForKeyGeneration The validated data to generate keys from
   * @param table The DynamoDB table instance containing GSI configurations
   * @returns Record of GSI attribute names to their values
   */
  const buildIndexes = <TData extends T>(
    dataForKeyGeneration: TData,
    table: Table,
    excludeReadOnly = false,
  ): Record<string, string> => {
    return buildEntityIndexes(dataForKeyGeneration, table, config.indexes, excludeReadOnly);
  };

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

  const prepareEntityWriteSync = (mode: EntityWriteMode, table: Table, data: TInput): PreparedEntityWrite<T> => {
    const validationResult = config.schema["~standard"].validate(data);

    if (validationResult instanceof Promise) {
      throw EntityErrors.asyncValidationNotSupported(config.name, mode);
    }

    if ("issues" in validationResult && validationResult.issues) {
      throw EntityErrors.validationFailed(config.name, mode, validationResult.issues, data);
    }

    return prepareValidatedEntityItem(mode, table, validationResult.value);
  };

  const prepareEntityWriteAsync = async (
    mode: EntityWriteMode,
    table: Table,
    data: TInput,
  ): Promise<PreparedEntityWrite<T>> => {
    const validationResult = await config.schema["~standard"].validate(data);

    if ("issues" in validationResult && validationResult.issues) {
      throw EntityErrors.validationFailed(config.name, mode, validationResult.issues, data);
    }

    return prepareValidatedEntityItem(mode, table, validationResult.value);
  };

  const createEntityPutBuilder = (mode: EntityWriteMode, table: Table, data: TInput): EntityAwarePutBuilder<T> => {
    const builder =
      mode === "create" ? table.create<T>({} as T) : table.put<T>({} as T).returnValues("INPUT");

    builder.prepareItem({
      prepareForExecute: async () => (await prepareEntityWriteAsync(mode, table, data)).item,
      prepareForCompose: () => prepareEntityWriteSync(mode, table, data).item,
    });

    return createEntityAwarePutBuilder(builder as PutBuilder<T>, config.name);
  };

  return {
    name: config.name,
    createRepository: (table: Table): EntityRepository<T, TInput, I, Q> => {
      // Create a repository
      const repository = {
        create: (data: TInput) => createEntityPutBuilder("create", table, data),

        upsert: (data: TInput & I) => createEntityPutBuilder("upsert", table, data),

        get: <K extends I>(key: K) => {
          const builder = table.get<T>(config.primaryKey.generateKey(key));
          return createEntityAwareGetBuilder(builder, config.name);
        },

        update: <K extends I>(key: K, data: Partial<T>) => {
          const primaryKeyObj = config.primaryKey.generateKey(key);
          const builder = table.update<T>(primaryKeyObj);
          const forceRebuildIndexes: string[] = [];
          let updateDataApplied = false;

          builder.condition(eq(entityTypeAttributeName, config.name));

          const prepareUpdateData = () => {
            if (updateDataApplied) {
              return;
            }

            const timestamps = generateTimestamps(["updatedAt"], data);
            const updatedItem = { ...(key as unknown as T), ...data, ...timestamps } as T;
            const indexUpdates = buildIndexUpdates(
              key as unknown as T,
              updatedItem,
              table,
              config.indexes,
              forceRebuildIndexes,
            );

            builder.set({ ...data, ...timestamps, ...indexUpdates });
            updateDataApplied = true;
          };

          builder.prepare({
            prepare: prepareUpdateData,
            resetForExecute: () => {
              updateDataApplied = false;
            },
          });

          return createEntityAwareUpdateBuilder(builder, config.name, forceRebuildIndexes);
        },

        delete: <K extends I>(key: K) => {
          const builder = table.delete(config.primaryKey.generateKey(key));
          builder.condition(eq(entityTypeAttributeName, config.name));
          return createEntityAwareDeleteBuilder(builder, config.name);
        },

        query: Object.entries(config.queries || {}).reduce(
          (acc, [key, inputCallback]) => {
            (acc as any)[key] = (input: unknown) => {
              // Create a QueryEntity object with only the necessary methods
              const queryEntity: QueryEntity<T> = {
                scan: repository.scan,
                get: (key: PrimaryKeyWithoutExpression) => createEntityAwareGetBuilder(table.get<T>(key), config.name),
                query: (keyCondition: PrimaryKey) => {
                  return table.query<T>(keyCondition);
                },
              };

              // Execute the query function to get the builder
              const queryBuilderCallback = inputCallback(input);

              // Run the inner handler which allows the user to apply their desired contraints
              // to the query builder of their choice
              const builder = queryBuilderCallback(queryEntity);

              // Add entity type filter if the builder has filter method
              if (
                builder &&
                typeof builder === "object" &&
                "filter" in builder &&
                typeof builder.filter === "function"
              ) {
                builder.filter(eq(entityTypeAttributeName, config.name));
              }

              if (builder && typeof builder === "object" && "execute" in builder && typeof builder.execute === "function") {
                return new Proxy(builder, {
                  get(target, prop, receiver) {
                    if (prop === "execute") {
                      return async () => {
                        const queryFn = (
                          config.queries as unknown as Record<string, QueryFunctionWithSchema<T, I, unknown>>
                        )[key];
                        const schema = queryFn?.schema;

                        if (schema?.["~standard"]?.validate && typeof schema["~standard"].validate === "function") {
                          const validationResult = schema["~standard"].validate(input);
                          if ("issues" in validationResult && validationResult.issues) {
                            throw EntityErrors.queryInputValidationFailed(
                              config.name,
                              key,
                              validationResult.issues,
                              input,
                            );
                          }
                        }

                        return target.execute.call(target);
                      };
                    }

                    return Reflect.get(target, prop, receiver);
                  },
                });
              }

              return builder;
            };
            return acc;
          },
          {} as MappedQueries<T, Q>,
        ),

        scan: () => {
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
