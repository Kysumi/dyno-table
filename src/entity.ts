import type { Table } from "./table";
import type { StandardSchemaV1 } from "./standard-schema";
import type { PrimaryKeyWithoutExpression } from "./conditions";
import type { Index } from "./types";
import type { QueryBuilder } from "./builders/query-builder";
import type { Path, PathType } from "./builders/types";
import type { KeyConditionOperator } from "./conditions";
import type { ScanBuilder } from "./builders/scan-builder";
import type { DeleteBuilder } from "./builders/delete-builder";
import type { UpdateBuilder } from "./builders/update-builder";
import type { GetBuilder } from "./builders/get-builder";
import type { PutBuilder } from "./builders/put-builder";

export interface EntityHooks<T extends Record<string, unknown>> {
  beforeCreate?: (data: T) => Promise<T> | T;
  afterCreate?: (data: T) => Promise<T> | T;
  beforeUpdate?: (data: Partial<T>) => Promise<Partial<T>> | Partial<T>;
  afterUpdate?: (data: T) => Promise<T> | T;
  afterGet?: (data: T | undefined) => Promise<T | undefined> | T | undefined;
}

// Define a type for query functions
export type QueryFunction<T extends Record<string, unknown>, I, R = T[]> = (input: I) => Promise<R>;

// Define a type for the query record
export type QueryRecord<T extends Record<string, unknown>> = Record<string, QueryFunction<T, any, any>>;

// Define a type for the result of a query builder
export type QueryBuilderResult<T extends Record<string, unknown>> = {
  items: T[];
  lastEvaluatedKey?: Record<string, unknown>;
};

export interface EntityConfig<T extends Record<string, unknown>, Q extends QueryRecord<T> = {}> {
  name: string;
  schema: StandardSchemaV1<T>;
  primaryKey: Index;
  indexes?: Record<string, Index>;
  queries?: Q;
  hooks?: EntityHooks<T>;
}

export interface PaginationOptions {
  limit?: number;
  lastEvaluatedKey?: Record<string, any>;
}

export interface PaginatedResult<T> {
  items: T[];
  lastEvaluatedKey?: Record<string, any>;
  hasMore: boolean;
}

export interface EntityRepository<T extends Record<string, unknown>, Q extends QueryRecord<T> = {}> {
  _hooks?: EntityHooks<T>;
  create: (data: T) => PutBuilder<T>;
  upsert: (data: T) => PutBuilder<T>;
  get: (key: PrimaryKeyWithoutExpression) => GetBuilder<T>;
  update: (key: PrimaryKeyWithoutExpression, data: Partial<T>) => UpdateBuilder<T>;
  delete: (key: PrimaryKeyWithoutExpression) => DeleteBuilder;
  query: Q;
  // Add a method to create a query builder
  queryBuilder: (key: PrimaryKeyWithoutExpression) => QueryBuilder<T, any>;
  // Add a method to find entities by their attributes
  findBy: <K extends keyof T>(attribute: K, value: T[K], options?: PaginationOptions) => any; // Returns ScanBuilder<T>
  // Add a method to scan all entities
  scan: (options?: PaginationOptions) => ScanBuilder<T>;
}

export function defineEntity<T extends Record<string, unknown>, Q extends QueryRecord<T> = {}>(
  config: EntityConfig<T, Q>,
) {
  return {
    createRepository: (table: Table): EntityRepository<T, Q> => {
      // Create a repository with hooks attached
      const repository = {
        _hooks: config.hooks,
        create: (data: T) => {
          // We need to handle the async operations when the consumer calls execute
          const builder = table.create(data);

          // Wrap the builder's execute method to apply validation only (no hooks)
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
          const builder = table.put(data);

          // Wrap the builder's execute method to apply validation only (no hooks)
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
          const builder = table.get<T>(key);

          // Wrap the builder's execute method to apply afterGet hook
          const originalExecute = builder.execute;

          builder.execute = async () => {
            const result = await originalExecute.call(builder);
            const item = result?.item;

            // Apply afterGet hook if exists
            return {
              item: config.hooks?.afterGet ? await config.hooks.afterGet(item as T) : item,
            };
          };

          return builder;
        },

        update: (key: PrimaryKeyWithoutExpression, data: Partial<T>) => {
          // Create a builder without hooks
          const builder = table.update<T>(key);

          // Wrap the builder's execute method to handle errors
          const originalExecute = builder.execute;
          builder.execute = async () => {
            const result = await originalExecute.call(builder);
            if (!result?.item) {
              throw new Error("Failed to update item");
            }

            // Return the item without applying hooks
            return result.item as T;
          };

          return builder;
        },

        delete: (key: PrimaryKeyWithoutExpression) => {
          return table.delete(key);
        },

        query: {} as Q,

        // Add a method to create a query builder
        queryBuilder: (key: PrimaryKeyWithoutExpression) => {
          // Convert PrimaryKeyWithoutExpression to PrimaryKey
          const primaryKey = {
            pk: key.pk,
            ...(key.sk ? { sk: (op: KeyConditionOperator) => op.eq(key.sk as string) } : {}),
          };
          return table.query<T>(primaryKey);
        },

        // Implement findBy method to find entities by their attributes
        findBy: <K extends keyof T>(attribute: K, value: T[K], options?: PaginationOptions) => {
          // Use scan with a filter to find entities by attribute
          const scanBuilder = table.scan<T>().filter((op) => op.eq(attribute as string as Path<T>, value as any));

          // Apply pagination options if provided
          if (options?.limit) {
            scanBuilder.limit(options.limit);
          }

          if (options?.lastEvaluatedKey) {
            scanBuilder.startFrom(options.lastEvaluatedKey);
          }

          // Return the builder without applying hooks
          return scanBuilder;
        },

        // Implement scan method to scan all entities
        scan: (options?: PaginationOptions) => {
          // Create a scan builder
          const scanBuilder = table.scan<T>();

          // Apply pagination options if provided
          if (options?.limit) {
            scanBuilder.limit(options.limit);
          }

          if (options?.lastEvaluatedKey) {
            scanBuilder.startFrom(options.lastEvaluatedKey);
          }

          // Return the builder without applying hooks
          return scanBuilder;
        },
      };

      // Bind query functions to the repository after it's fully defined
      if (config.queries) {
        for (const [key, queryFn] of Object.entries(config.queries)) {
          // biome-ignore lint/suspicious/noExplicitAny: Let the magic happen
          (repository.query as any)[key] = queryFn.bind(repository);
        }
      }

      return repository;
    },
  };
}

export function createQueries<T extends Record<string, unknown>>() {
  return {
    input: <I, R = QueryBuilderResult<T>>(schema: StandardSchemaV1<I>) => ({
      // biome-ignore lint/complexity/noBannedTypes: <explanation>
      query: <Q extends QueryRecord<T> = {}>(
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        handler: (params: { input: I; entity: EntityRepository<T, Q> }) => QueryBuilder<T, any>,
      ): QueryFunction<T, I, R> => {
        // Return a function that will be bound to the repository when it's created
        const queryFn = async function (this: EntityRepository<T, Q>, input: I): Promise<R> {
          // Validate input against schema
          const validationResult = await schema["~standard"].validate(input);
          if ("issues" in validationResult && validationResult.issues) {
            throw new Error(`Validation failed: ${validationResult.issues.map((i) => i.message).join(", ")}`);
          }

          // Use 'this' as the entity repository (will be bound when the repository is created)
          const queryBuilder = handler({ input: validationResult.value, entity: this });

          // Execute the query
          const result = await queryBuilder.execute();

          // Apply afterGet hook to each item if exists
          let items = result.items;
          if (this._hooks?.afterGet) {
            const processedItems = await Promise.all(
              // biome-ignore lint/style/noNonNullAssertion:
              items.map(async (item) => await this._hooks!.afterGet!(item as T)),
            );
            items = processedItems.filter((item): item is NonNullable<typeof item> => item !== null) as T[];
          }

          // Return the full result with processed items
          return {
            items,
            lastEvaluatedKey: result.lastEvaluatedKey,
          } as unknown as R;
        };

        return queryFn as unknown as QueryFunction<T, I, R>;
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
