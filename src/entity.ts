import type { DeleteBuilder } from "./builders/delete-builder";
import type { GetBuilder } from "./builders/get-builder";
import type { PutBuilder } from "./builders/put-builder";
import type { ScanBuilder } from "./builders/scan-builder";
import type { UpdateBuilder } from "./builders/update-builder";
import type { StandardSchemaV1 } from "./standard-schema";
import type { Table } from "./table";
import type { Index, TableConfig } from "./types";
import { eq, type PrimaryKeyWithoutExpression, type PrimaryKey } from "./conditions";
import type { QueryBuilder } from "./builders/query-builder";

/**
 * Type helper to ensure T is an object type and can be safely converted to Record<string, unknown>
 */
export type EntityType<T> = T extends Record<string, unknown> ? T : never;

// Define the QueryFunction type with a generic return type
export type QueryFunction<T extends Record<string, unknown>, I, R> = (
  input: I,
) => R;

// Define a type for the query record that preserves the input type for each query function
export type QueryRecord<T extends Record<string, unknown>> = {
  [K: string]: QueryFunction<T, unknown, ScanBuilder<T> | QueryBuilder<T, TableConfig> | GetBuilder<T>>;
};

// Define a type for entity with only scan, get and query methods
export type QueryEntity<T extends Record<string, unknown>> = {
  scan: () => ScanBuilder<T>;
  get: (key: PrimaryKeyWithoutExpression) => GetBuilder<T>;
  query: (keyCondition: PrimaryKey | PrimaryKeyWithoutExpression) => QueryBuilder<T, TableConfig>;
};

// Define a type for entity with entityType field
export type EntityWithType<T extends Record<string, unknown>> = T & { entityType: string };

// Define a type for the result of a query builder
export type QueryBuilderResult<T extends Record<string, unknown>> = {
  items: T[];
  lastEvaluatedKey?: Record<string, unknown>;
};

export interface EntityConfig<T extends Record<string, unknown>, Q extends QueryRecord<T> = QueryRecord<T>> {
  name: string;
  schema: StandardSchemaV1<T>;
  primaryKey: Index;
  indexes?: Record<string, Index>;
  queries?: Q;
}

export interface PaginatedResult<T extends Record<string, unknown>> {
  items: T[];
  lastEvaluatedKey?: Record<string, unknown>;
  hasMore: boolean;
}

export interface EntityRepository<T extends Record<string, unknown>, Q extends QueryRecord<T> = QueryRecord<T>> {
  create: (data: T) => PutBuilder<Record<string, unknown>>;
  upsert: (data: T) => PutBuilder<Record<string, unknown>>;
  get: (key: PrimaryKeyWithoutExpression) => GetBuilder<Record<string, unknown>>;
  update: (key: PrimaryKeyWithoutExpression, data: Partial<T>) => UpdateBuilder<Record<string, unknown>>;
  delete: (key: PrimaryKeyWithoutExpression) => DeleteBuilder;
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
export function defineEntity<T extends Record<string, unknown>, Q extends QueryRecord<T> = QueryRecord<T>>(
  config: EntityConfig<T, Q>,
) {
  return {
    name: config.name,
    createRepository: (table: Table): EntityRepository<T, Q> => {
      // Create a repository
      const repository = {
        create: (data: T) => {
          // We need to handle the async operations when the consumer calls execute
          const builder = table.create({
            ...data,
            entityType: config.name, // Add entity type for filtering
          } as EntityWithType<T>);

          // Wrap the builder's execute method to apply validation only
          const originalExecute = builder.execute;
          builder.execute = async () => {
            // Validate data against schema
            const validationResult = await config.schema["~standard"].validate(data);
            if ("issues" in validationResult && validationResult.issues) {
              throw new Error(`Validation failed: ${validationResult.issues.map((i) => i.message).join(", ")}`);
            }

            // Update the item in the builder with the validated data
            Object.assign(builder, { item: validationResult.value });

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
          // We need to handle the async operations when the consumer calls execute
          const builder = table.put({
            ...data,
            entityType: config.name, // Add entity type for filtering
          } as EntityWithType<T>);

          // Wrap the builder's execute method to apply validation only
          const originalExecute = builder.execute;
          builder.execute = async () => {
            // Validate data against schema
            const validationResult = await config.schema["~standard"].validate(data);
            if ("issues" in validationResult && validationResult.issues) {
              throw new Error(`Validation failed: ${validationResult.issues.map((i) => i.message).join(", ")}`);
            }

            // Update the item in the builder with the validated data
            Object.assign(builder, { item: validationResult.value });

            // Execute the builder
            const result = await originalExecute.call(builder);
            if (!result) {
              throw new Error("Failed to upsert item");
            }

            return result;
          };

          return builder;
        },

        get: (key: PrimaryKeyWithoutExpression) => {
          return table.get(key);
        },

        update: (key: PrimaryKeyWithoutExpression, data: Partial<T>) => {
          const builder = table.update(key);
          builder.condition(eq("entityType", config.name));
          builder.set(data);
          return builder;
        },

        delete: (key: PrimaryKeyWithoutExpression) => {
          const builder = table.delete(key);
          builder.condition(eq("entityType", config.name));
          return builder;
        },

        query: Object.entries(config.queries || {}).reduce((acc, [key, queryFn]) => {
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
          const scanBuilder = table.scan();
          scanBuilder.filter(eq("entityType", config.name));

          return scanBuilder;
        },
      };

      // Query functions are now bound directly during repository creation

      return repository;
    },
  };
}

export function createQueries<T extends Record<string, unknown>>() {
  return {
    input: <I>(schema: StandardSchemaV1<I>) => ({
      query: <Q extends QueryRecord<T> = QueryRecord<T>, R = ScanBuilder<T> | QueryBuilder<T, TableConfig> | GetBuilder<T>>(
        handler: (params: { input: I; entity: QueryEntity<T> }) => R,
      ) => {
        const queryFn = async function (
          this: EntityRepository<T, Q>,
          input: I,
        ): Promise<R> {
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

export interface IndexDefinition<T extends Record<string, unknown>> extends Index {
  name: string;
  generateKey: (item: T) => { pk: string; sk?: string };
}

export function createIndex<T extends Record<string, unknown>>() {
  return {
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
  };
}
