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
import type { QueryBuilder } from "../builders/query-builder";
import type { ScanBuilder } from "../builders/scan-builder";
import { eq, type PrimaryKey, type PrimaryKeyWithoutExpression } from "../conditions";
import type { StandardSchemaV1, StandardSchemaV1 as StandardSchemaV1Namespace } from "../standard-schema";
import type { Table } from "../table";
import type { DynamoItem, Index, TableConfig } from "../types";
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
   * Utility function to wrap a method with preparation logic while preserving all properties
   * for mock compatibility. This reduces boilerplate for withTransaction and withBatch wrappers.
   */
  // biome-ignore lint/suspicious/noExplicitAny: Required for flexible method wrapping
  const wrapMethodWithPreparation = <TMethod extends (...args: any[]) => any>(
    originalMethod: TMethod,
    prepareFn: () => void,
    // biome-ignore lint/suspicious/noExplicitAny: Required for flexible context binding
    context: any,
  ): TMethod => {
    // biome-ignore lint/suspicious/noExplicitAny: Required for flexible argument handling
    const wrappedMethod = (...args: any[]) => {
      prepareFn();
      return originalMethod.call(context, ...args);
    };

    // Copy all properties from the original function to preserve mock functionality
    Object.setPrototypeOf(wrappedMethod, originalMethod);
    const propertyNames = Object.getOwnPropertyNames(originalMethod);
    for (let i = 0; i < propertyNames.length; i++) {
      const prop = propertyNames[i] as string;
      if (prop !== "length" && prop !== "name" && prop !== "prototype") {
        // Check if the property is writable before attempting to assign it
        const descriptor = Object.getOwnPropertyDescriptor(originalMethod, prop);
        if (descriptor && descriptor.writable !== false && !descriptor.get) {
          // biome-ignore lint/suspicious/noExplicitAny: meh
          (wrappedMethod as any)[prop] = (originalMethod as any)[prop];
        }
      }
    }

    return wrappedMethod as TMethod;
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

  return {
    name: config.name,
    createRepository: (table: Table): EntityRepository<T, TInput, I, Q> => {
      // Create a repository
      const repository = {
        create: (data: TInput) => {
          // Create a minimal builder without validation or key generation
          // We'll defer all processing until execute() or withTransaction() is called
          const builder = table.create<T>({} as T);

          // Core function that handles validation, key generation, and item preparation (async version)
          const prepareValidatedItemAsync = async () => {
            // Validate data to ensure defaults are applied before key generation
            const validatedData = await config.schema["~standard"].validate(data);

            if ("issues" in validatedData && validatedData.issues) {
              throw new Error(`Validation failed: ${validatedData.issues.map((i) => i.message).join(", ")}`);
            }

            const dataForKeyGeneration = {
              ...validatedData.value,
              ...generateTimestamps(["createdAt", "updatedAt"], validatedData.value),
            };

            // Generate the primary key using validated data (with defaults applied)
            const primaryKey = config.primaryKey.generateKey(dataForKeyGeneration as unknown as I);

            const indexes = buildEntityIndexes(dataForKeyGeneration, table, config.indexes, false);

            const validatedItem = {
              ...(dataForKeyGeneration as unknown as T),
              [entityTypeAttributeName]: config.name,
              [table.partitionKey]: primaryKey.pk,
              ...(table.sortKey ? { [table.sortKey]: primaryKey.sk } : {}),
              ...indexes,
            };

            Object.assign(builder, { item: validatedItem });
            return validatedItem;
          };

          // Core function that handles validation, key generation, and item preparation (sync version)
          const prepareValidatedItemSync = () => {
            const validationResult = config.schema["~standard"].validate(data);

            // Handle Promise case - this shouldn't happen for most schemas, but we need to handle it
            if (validationResult instanceof Promise) {
              throw new Error(
                "Async validation is not supported in withBatch or withTransaction. The schema must support synchronous validation for compatibility.",
              );
            }

            if ("issues" in validationResult && validationResult.issues) {
              throw new Error(`Validation failed: ${validationResult.issues.map((i) => i.message).join(", ")}`);
            }

            const dataForKeyGeneration = {
              ...validationResult.value,
              ...generateTimestamps(["createdAt", "updatedAt"], validationResult.value),
            };

            // Generate the primary key using validated data (with defaults applied)
            const primaryKey = config.primaryKey.generateKey(dataForKeyGeneration as unknown as I);

            const indexes = buildEntityIndexes(dataForKeyGeneration, table, config.indexes, false);

            const validatedItem = {
              ...(dataForKeyGeneration as unknown as T),
              [entityTypeAttributeName]: config.name,
              [table.partitionKey]: primaryKey.pk,
              ...(table.sortKey ? { [table.sortKey]: primaryKey.sk } : {}),
              ...indexes,
            };

            Object.assign(builder, { item: validatedItem });
            return validatedItem;
          };

          // Wrap the builder's execute method
          const originalExecute = builder.execute;
          builder.execute = async () => {
            await prepareValidatedItemAsync();
            return await originalExecute.call(builder);
          };

          // Wrap the builder's withTransaction method
          const originalWithTransaction = builder.withTransaction;
          if (originalWithTransaction) {
            builder.withTransaction = wrapMethodWithPreparation(
              originalWithTransaction,
              prepareValidatedItemSync,
              builder,
            );
          }

          // Wrap the builder's withBatch method
          const originalWithBatch = builder.withBatch;
          if (originalWithBatch) {
            builder.withBatch = wrapMethodWithPreparation(originalWithBatch, prepareValidatedItemSync, builder);
          }

          return createEntityAwarePutBuilder(builder, config.name);
        },

        upsert: (data: TInput & I) => {
          // Create a minimal builder without validation or key generation
          // We'll defer all processing until execute() or withTransaction() is called
          const builder = table.put<T>({} as T);

          // Core function that handles validation, key generation, and item preparation (async version)
          const prepareValidatedItemAsync = async () => {
            const validatedData = await config.schema["~standard"].validate(data);

            if ("issues" in validatedData && validatedData.issues) {
              throw new Error(`Validation failed: ${validatedData.issues.map((i) => i.message).join(", ")}`);
            }

            const dataForKeyGeneration = {
              ...validatedData.value,
              ...generateTimestamps(["createdAt", "updatedAt"], validatedData.value),
            };

            // Generate the primary key using validated data (with defaults applied)
            const primaryKey = config.primaryKey.generateKey(dataForKeyGeneration as unknown as TInput & I);

            const indexes = buildIndexes(dataForKeyGeneration, table, false);

            const validatedItem = {
              [table.partitionKey]: primaryKey.pk,
              ...(table.sortKey ? { [table.sortKey]: primaryKey.sk } : {}),
              ...dataForKeyGeneration,
              [entityTypeAttributeName]: config.name,
              ...indexes,
            };

            Object.assign(builder, { item: validatedItem });
            return validatedItem;
          };

          // Core function that handles validation, key generation, and item preparation (sync version)
          const prepareValidatedItemSync = () => {
            const validationResult = config.schema["~standard"].validate(data);

            // Handle Promise case - this shouldn't happen in withTransaction but we need to handle it for type safety
            if (validationResult instanceof Promise) {
              throw new Error(
                "Async validation is not supported in withTransaction or withBatch. Use execute() instead.",
              );
            }

            if ("issues" in validationResult && validationResult.issues) {
              throw new Error(`Validation failed: ${validationResult.issues.map((i) => i.message).join(", ")}`);
            }

            const dataForKeyGeneration = {
              ...validationResult.value,
              ...generateTimestamps(["createdAt", "updatedAt"], validationResult.value),
            };

            // Generate the primary key using validated data (with defaults applied)
            const primaryKey = config.primaryKey.generateKey(dataForKeyGeneration as unknown as TInput & I);

            const indexes = buildEntityIndexes(dataForKeyGeneration, table, config.indexes, false);

            const validatedItem = {
              [table.partitionKey]: primaryKey.pk,
              ...(table.sortKey ? { [table.sortKey]: primaryKey.sk } : {}),
              ...dataForKeyGeneration,
              [entityTypeAttributeName]: config.name,
              ...indexes,
            };

            Object.assign(builder, { item: validatedItem });
            return validatedItem;
          };

          // Wrap the builder's execute method
          const originalExecute = builder.execute;
          builder.execute = async () => {
            await prepareValidatedItemAsync();
            const result = await originalExecute.call(builder);
            if (!result) {
              throw new Error("Failed to upsert item");
            }
            return result;
          };

          // Wrap the builder's withTransaction method
          const originalWithTransaction = builder.withTransaction;
          if (originalWithTransaction) {
            builder.withTransaction = wrapMethodWithPreparation(
              originalWithTransaction,
              prepareValidatedItemSync,
              builder,
            );
          }

          // Wrap the builder's withBatch method
          const originalWithBatch = builder.withBatch;
          if (originalWithBatch) {
            builder.withBatch = wrapMethodWithPreparation(originalWithBatch, prepareValidatedItemSync, builder);
          }

          return createEntityAwarePutBuilder(builder, config.name);
        },

        get: <K extends I>(key: K) => {
          return createEntityAwareGetBuilder(table.get<T>(config.primaryKey.generateKey(key)), config.name);
        },

        update: <K extends I>(key: K, data: Partial<T>) => {
          const primaryKeyObj = config.primaryKey.generateKey(key);
          const builder = table.update<T>(primaryKeyObj);

          builder.condition(eq(entityTypeAttributeName, config.name));

          // Create entity-aware builder with entity-specific functionality
          const entityAwareBuilder = createEntityAwareUpdateBuilder(builder, config.name);

          // Configure the entity-aware builder with entity-specific logic
          entityAwareBuilder.configureEntityLogic({
            data,
            key: key as unknown as T,
            table,
            indexes: config.indexes,
            generateTimestamps: () => generateTimestamps(["updatedAt"], data),
            buildIndexUpdates,
          });

          return entityAwareBuilder;
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

              // Wrap the builder's execute method if it exists
              if (builder && typeof builder === "object" && "execute" in builder) {
                const originalExecute = builder.execute;
                builder.execute = async () => {
                  // Validate the input before executing the query
                  const queryFn = (
                    config.queries as unknown as Record<string, QueryFunctionWithSchema<T, I, typeof builder>>
                  )[key];

                  if (queryFn && typeof queryFn === "function") {
                    // Get the schema from the query function
                    const schema = queryFn.schema;
                    if (schema?.["~standard"]?.validate && typeof schema["~standard"].validate === "function") {
                      const validationResult = schema["~standard"].validate(input);
                      if ("issues" in validationResult && validationResult.issues) {
                        throw new Error(
                          `Validation failed: ${validationResult.issues.map((issue) => issue.message).join(", ")}`,
                        );
                      }
                    }
                  }

                  // Execute the original builder
                  const result = await originalExecute.call(builder);
                  if (!result) {
                    throw new Error("Failed to execute query");
                  }
                  return result;
                };
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
                  throw new Error(`Index validation failed: ${data.issues.map((i) => i.message).join(", ")}`);
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
                  throw new Error(`Index validation failed: ${data.issues.map((i) => i.message).join(", ")}`);
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
