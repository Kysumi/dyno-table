import type { DeleteBuilder } from "./builders/delete-builder";
import type { GetBuilder } from "./builders/get-builder";
import type { PutBuilder } from "./builders/put-builder";
import type { ScanBuilder } from "./builders/scan-builder";
import type { UpdateBuilder } from "./builders/update-builder";
import type { StandardSchemaV1 } from "./standard-schema";
import type { Table } from "./table";
import type { DynamoItem, Index, TableConfig } from "./types";
import { eq, type PrimaryKeyWithoutExpression, type PrimaryKey } from "./conditions";
import type { QueryBuilder } from "./builders/query-builder";

// Define the QueryFunction type with a generic return type
export type QueryFunction<T extends DynamoItem, I, R> = (input: I) => R;

// Define a type for the query record that preserves the input type for each query function
export type QueryRecord<T extends DynamoItem> = {
  [K: string]: QueryFunction<T, unknown, ScanBuilder<T> | QueryBuilder<T, TableConfig> | GetBuilder<T>>;
};

// Define a type for entity with only scan, get and query methods
export type QueryEntity<T extends DynamoItem> = {
  scan: () => ScanBuilder<T>;
  get: (key: PrimaryKeyWithoutExpression) => GetBuilder<T>;
  query: (keyCondition: PrimaryKey | PrimaryKeyWithoutExpression) => QueryBuilder<T, TableConfig>;
};

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
}

export interface EntityRepository<
  T extends DynamoItem,
  I extends DynamoItem = T,
  Q extends QueryRecord<T> = QueryRecord<T>,
> {
  create: (data: T) => PutBuilder<T>;
  upsert: (data: T) => PutBuilder<T>;
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
  return {
    name: config.name,
    createRepository: (table: Table): EntityRepository<T, I, Q> => {
      // Create a repository
      const repository = {
        create: (data: T) => {
          // Create validated data with an entity type
          const itemWithType = {
            ...data,
            entityType: config.name,
          };

          // We need to handle the async operations when the consumer calls execute
          const builder = table.create<T>(itemWithType);

          // Wrap the builder's execute method to apply validation only
          const originalExecute = builder.execute;
          builder.execute = async () => {
            // Validate data against schema
            const validationResult = await config.schema["~standard"].validate(data);
            if ("issues" in validationResult && validationResult.issues) {
              throw new Error(`Validation failed: ${validationResult.issues.map((i) => i.message).join(", ")}`);
            }

            // Update the item in the builder with the validated data and entity type
            Object.assign(builder, {
              item: {
                ...validationResult.value,
                entityType: config.name,
              },
            });

            // Execute the builder
            const result = await originalExecute.call(builder);
            if (!result) {
              throw new Error("Failed to create item");
            }

            return result;
          };

          return builder;
        },

        upsert: (data: T) => {
          // Create validated data with an entity type
          const itemWithType = {
            ...data,
            entityType: config.name,
          };

          // We need to handle the async operations when the consumer calls execute
          const builder = table.put<T>(itemWithType);

          // Wrap the builder's execute method to apply validation only
          const originalExecute = builder.execute;
          builder.execute = async () => {
            // Validate data against schema
            const validationResult = await config.schema["~standard"].validate(data);
            if ("issues" in validationResult && validationResult.issues) {
              throw new Error(`Validation failed: ${validationResult.issues.map((i) => i.message).join(", ")}`);
            }

            // Update the item in the builder with the validated data and entity type
            Object.assign(builder, {
              item: {
                ...validationResult.value,
                entityType: config.name,
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

        get: <K extends I>(key: K) => {
          // Transform the input key into a PrimaryKeyWithoutExpression using the primary key definition
          const primaryKeyObj = config.primaryKey.generateKey(key);
          return table.get<T>(primaryKeyObj);
        },

        update: <K extends I>(key: K, data: Partial<T>) => {
          // Transform the input key into a PrimaryKeyWithoutExpression using the primary key definition
          const primaryKeyObj = config.primaryKey.generateKey(key);
          const builder = table.update<T>(primaryKeyObj);
          builder.condition(eq("entityType", config.name));
          builder.set(data);
          return builder;
        },

        delete: <K extends I>(key: K) => {
          // Transform the input key into a PrimaryKeyWithoutExpression using the primary key definition
          const primaryKeyObj = config.primaryKey.generateKey(key);
          const builder = table.delete(primaryKeyObj);
          builder.condition(eq("entityType", config.name));
          return builder;
        },

        query: Object.entries(config.queries || {}).reduce((acc, [key, queryFn]) => {
          // @ts-expect-error - We need to cast the queryFn to a function that takes an unknown input
          acc[key] = (input: unknown) => {
            const builder = queryFn.call(repository, input);
            if (builder && typeof builder === "object" && "filter" in builder && typeof builder.filter === "function") {
              builder.filter(eq("entityType", config.name));
            }
            return builder;
          };
          return acc;
        }, {} as Q),

        scan: () => {
          const scanBuilder = table.scan<T>();
          scanBuilder.filter(eq("entityType", config.name));

          return scanBuilder;
        },
      };

      // Query functions are now bound directly during repository creation

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
        const queryFn = async function (this: EntityRepository<T, Q>, input: I): Promise<R> {
          const validationResult = await schema["~standard"].validate(input);
          if ("issues" in validationResult && validationResult.issues) {
            throw new Error(`Validation failed: ${validationResult.issues.map((i) => i.message).join(", ")}`);
          }
          // Cast the repository to QueryEntity since we know it has these methods
          return handler({ input: validationResult.value, entity: this as unknown as QueryEntity<T> });
        };

        // Return the query function with the correct input type
        return queryFn as unknown as QueryFunction<T, unknown, R>;
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
            generateKey: (item: T) => ({
              pk: pkFn(item),
              sk: skFn(item),
            }),
          }) as IndexDefinition<T>,

        // Allow creating an index with only a partition key
        withoutSortKey: () =>
          ({
            name: "custom",
            partitionKey: "pk",
            generateKey: (item: T) => ({
              pk: pkFn(item),
            }),
          }) as IndexDefinition<T>,
      }),
    }),
  };
}
