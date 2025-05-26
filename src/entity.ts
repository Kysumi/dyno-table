import type { DeleteBuilder } from "./builders/delete-builder";
import type { GetBuilder } from "./builders/get-builder";
import type { PutBuilder } from "./builders/put-builder";
import type { ScanBuilder } from "./builders/scan-builder";
import type { UpdateBuilder } from "./builders/update-builder";
import type { StandardSchemaV1 } from "./standard-schema";
import type { Table } from "./table";
import type { DynamoItem, Index, TableConfig } from "./types";
import { eq, type PrimaryKey, type PrimaryKeyWithoutExpression } from "./conditions";
import type { QueryBuilder } from "./builders/query-builder";

// Define the QueryFunction type with a generic return type
export type QueryFunction<T extends DynamoItem, I, R> = (input: I) => R;

// Define a type for the query record that preserves the input type for each query function
export type QueryFunctionWithSchema<T extends DynamoItem, I, R> = QueryFunction<T, I, R> & {
  schema?: StandardSchemaV1<I>;
};

export type QueryRecord<T extends DynamoItem> = {
  // biome-ignore lint/suspicious/noExplicitAny: This is for flexibility
  [K: string]: QueryFunctionWithSchema<T, any, ScanBuilder<T> | QueryBuilder<T, TableConfig> | GetBuilder<T>>;
};

// Define a type for entity with only scan, get and query methods
export type QueryEntity<T extends DynamoItem> = {
  scan: () => ScanBuilder<T>;
  get: (key: PrimaryKeyWithoutExpression) => GetBuilder<T>;
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
  I extends DynamoItem = T,
  Q extends QueryRecord<T> = QueryRecord<T>,
> {
  name: string;
  schema: StandardSchemaV1<T>;
  primaryKey: IndexDefinition<I>;
  indexes?: Record<string, Index>;
  queries: Q;
  settings?: Settings;
}

export interface EntityRepository<
  /**
   * The Entity Type
   */
  T extends DynamoItem,
  /**
   * The Primary Index (Partition index) Type
   */
  I extends DynamoItem = T,
  /**
   * The Queries object
   */
  Q extends QueryRecord<T> = QueryRecord<T>,
> {
  create: (data: T) => PutBuilder<T>;
  upsert: (data: T & I) => PutBuilder<T>;
  get: (key: I) => GetBuilder<T>;
  update: (key: I, data: Partial<T>) => UpdateBuilder<T>;
  delete: (key: I) => DeleteBuilder;
  query: Q;
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
export function defineEntity<T extends DynamoItem, I extends DynamoItem = T, Q extends QueryRecord<T> = QueryRecord<T>>(
  config: EntityConfig<T, I, Q>,
) {
  const entityTypeAttributeName = config.settings?.entityTypeAttributeName ?? "entityType";

  /**
   * Generates an object containing timestamp attributes based on the given configuration settings.
   * The function determines the presence and format of "createdAt" and "updatedAt" timestamps dynamically.
   *
   * @param {Array<"createdAt" | "updatedAt">} [timestampTypes] - Optional array of timestamp types to generate. If not provided, all configured timestamps will be generated.
   * @returns {Record<string, string | number>} An object containing one or both of the "createdAt" and "updatedAt" timestamp attributes, depending on the configuration and requested types. Each timestamp can be formatted as either an ISO string or a UNIX timestamp.
   *
   * @throws Will not throw errors but depends on `config.settings?.timestamps` to be properly defined.
   * - If `createdAt` is configured, the function adds a timestamp using the attribute name specified in `config.settings.timestamps.createdAt.attributeName` or defaults to "createdAt".
   * - If `updatedAt` is configured, the function adds a timestamp using the attribute name specified in `config.settings.timestamps.updatedAt.attributeName` or defaults to "updatedAt".
   *
   * Configuration Details:
   *  - `config.settings.timestamps.createdAt.format`: Determines the format of the "createdAt" timestamp. Accepts "UNIX" or defaults to ISO string.
   *  - `config.settings.timestamps.updatedAt.format`: Determines the format of the "updatedAt" timestamp. Accepts "UNIX" or defaults to ISO string.
   *
   * The returned object keys and values depend on the provided configuration and requested timestamp types.
   */
  const generateTimestamps = (timestampTypes?: Array<"createdAt" | "updatedAt">): Record<string, string | number> => {
    if (!config.settings?.timestamps) return {};

    const timestamps: Record<string, string | number> = {};
    const now = new Date();
    const unixTime = Math.floor(Date.now() / 1000);

    const { createdAt, updatedAt } = config.settings.timestamps;

    // If no specific types are provided, generate all configured timestamps
    const typesToGenerate = timestampTypes || ["createdAt", "updatedAt"];

    if (createdAt && typesToGenerate.includes("createdAt")) {
      const name = createdAt.attributeName ?? "createdAt";
      timestamps[name] = createdAt.format === "UNIX" ? unixTime : now.toISOString();
    }

    if (updatedAt && typesToGenerate.includes("updatedAt")) {
      const name = updatedAt.attributeName ?? "updatedAt";
      timestamps[name] = updatedAt.format === "UNIX" ? unixTime : now.toISOString();
    }

    return timestamps;
  };

  return {
    name: config.name,
    createRepository: (table: Table): EntityRepository<T, I, Q> => {
      // Create a repository
      const repository = {
        create: (data: T) => {
          // Generate the primary key upfront for transaction compatibility
          // Note: We assume data is valid for key generation, validation happens during execution
          const primaryKey = config.primaryKey.generateKey(data as unknown as I);

          const indexes = Object.entries(config.indexes ?? {}).reduce(
            (acc, [indexName, index]) => {
              const key = (index as IndexDefinition<T>).generateKey(data);
              const gsiConfig = table.gsis[indexName];

              if (!gsiConfig) {
                throw new Error(`GSI configuration not found for index: ${indexName}`);
              }

              if (key.pk) {
                acc[gsiConfig.partitionKey] = key.pk;
              }
              if (key.sk && gsiConfig.sortKey) {
                acc[gsiConfig.sortKey] = key.sk;
              }
              return acc;
            },
            {} as Record<string, string>,
          );

          // Create the builder with all keys included upfront
          const builder = table.create<T>({
            ...data,
            [entityTypeAttributeName]: config.name,
            [table.partitionKey]: primaryKey.pk,
            ...(table.sortKey ? { [table.sortKey]: primaryKey.sk } : {}),
            ...indexes,
            ...generateTimestamps(["createdAt", "updatedAt"]),
          });

          // Wrap the builder's execute method to apply validation only
          const originalExecute = builder.execute;
          builder.execute = async () => {
            // Validate data against schema
            const validationResult = await config.schema["~standard"].validate(data);
            if ("issues" in validationResult && validationResult.issues) {
              throw new Error(`Validation failed: ${validationResult.issues.map((i) => i.message).join(", ")}`);
            }

            // Update the item in the builder with the validated data, entity type, and timestamps
            Object.assign(builder, {
              item: {
                ...validationResult.value,
                [entityTypeAttributeName]: config.name,
                [table.partitionKey]: primaryKey.pk,
                ...(table.sortKey ? { [table.sortKey]: primaryKey.sk } : {}),
                ...indexes,
                ...generateTimestamps(["createdAt", "updatedAt"]),
              },
            });

            // Execute the builder
            return await originalExecute.call(builder);
          };

          return builder;
        },

        upsert: (data: T & I) => {
          const primaryKey = config.primaryKey.generateKey(data);

          // We need to handle the async operations when the consumer calls execute
          const builder = table.put<T>({
            [table.partitionKey]: primaryKey.pk,
            ...(table.sortKey ? { [table.sortKey]: primaryKey.sk } : {}),
            ...data,
            [entityTypeAttributeName]: config.name,
            ...generateTimestamps(["createdAt", "updatedAt"]),
          });

          // Wrap the builder's execute method to apply validation only
          const originalExecute = builder.execute;
          builder.execute = async () => {
            // Validate data against schema
            const validationResult = await config.schema["~standard"].validate(data);
            if ("issues" in validationResult && validationResult.issues) {
              throw new Error(`Validation failed: ${validationResult.issues.map((i) => i.message).join(", ")}`);
            }

            // Update the item in the builder with the validated data, entity type, and timestamps
            Object.assign(builder, {
              item: {
                ...validationResult.value,
                [entityTypeAttributeName]: config.name,
                ...generateTimestamps(["createdAt", "updatedAt"]),
              },
            });

            // Execute the builder
            const result = await originalExecute.call(builder);
            if (!result) {
              throw new Error("Failed to upsert item");
            }

            return result;
          };

          return builder;
        },

        get: <K extends I>(key: K) => table.get<T>(config.primaryKey.generateKey(key)),

        update: <K extends I>(key: K, data: Partial<T>) => {
          const primaryKeyObj = config.primaryKey.generateKey(key);
          const builder = table.update<T>(primaryKeyObj);
          builder.condition(eq(entityTypeAttributeName, config.name));

          // Use only updatedAt timestamp for updates
          const timestamps = generateTimestamps(["updatedAt"]);

          builder.set({ ...data, ...timestamps });
          return builder;
        },

        delete: <K extends I>(key: K) => {
          const builder = table.delete(config.primaryKey.generateKey(key));
          builder.condition(eq(entityTypeAttributeName, config.name));
          return builder;
        },

        query: Object.entries(config.queries || {}).reduce((acc, [key, inputCallback]) => {
          // @ts-expect-error - We need to cast the queryFn to a function that takes an unknown input
          acc[key] = (input: unknown) => {
            // Create a QueryEntity object with only the necessary methods
            const queryEntity: QueryEntity<T> = {
              scan: repository.scan,
              get: (key: PrimaryKeyWithoutExpression) => table.get<T>(key),
              query: (keyCondition: PrimaryKey) => {
                return table.query<T>(keyCondition);
              },
            };

            // Execute the query function to get the builder - This type is incorrect and needs to be fixed
            const queryBuilderCallback = inputCallback(input);

            // Run the inner handler which allows the user to apply their desired contraints
            // to the query builder of their choice
            // @ts-expect-error - We need to cast the queryBuilderCallback to a function that takes a QueryEntity
            const builder = queryBuilderCallback(queryEntity);

            // Add entity type filter if the builder has filter method
            if (builder && typeof builder === "object" && "filter" in builder && typeof builder.filter === "function") {
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
        }, {} as Q),

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
      query: <
        Q extends QueryRecord<T> = QueryRecord<T>,
        R = ScanBuilder<T> | QueryBuilder<T, TableConfig> | GetBuilder<T>,
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

export interface IndexDefinition<T extends DynamoItem> extends Index {
  name: string;
  generateKey: (item: T) => { pk: string; sk?: string };
}

export function createIndex() {
  return {
    input: <T extends DynamoItem>(schema: StandardSchemaV1<T>) => ({
      partitionKey: <P extends (item: T) => string>(pkFn: P) => ({
        sortKey: <S extends (item: T) => string>(skFn: S) =>
          ({
            name: "custom",
            partitionKey: "pk",
            sortKey: "sk",
            generateKey: (item: T) => ({ pk: pkFn(item), sk: skFn(item) }),
          }) as IndexDefinition<T>,

        withoutSortKey: () =>
          ({
            name: "custom",
            partitionKey: "pk",
            generateKey: (item: T) => ({ pk: pkFn(item) }),
          }) as IndexDefinition<T>,
      }),
    }),
  };
}
