import type { Table } from "../table";
import type {
  EntityDefinition,
  EntityRepository,
  QueryMethods,
  IndexProjection,
  PrimaryKeyParams,
  PartitionKeyParams,
  IndexParams,
  QueryParams,
  QueryDefinition,
  SchemaTypes,
} from "./types";
import type { GenerateType, sortKey } from "../utils/sort-key-template";
import type { partitionKey, StrictGenerateType } from "../utils/partition-key-template";
import type { StandardSchemaV1 } from "../standard-schema";
import type { Condition, KeyConditionOperator } from "../conditions";
import type { TableConfig } from "../types";

export type LifecycleHook<T> = (data: T) => Promise<T> | T;

export interface EntityLifecycleHooks<
  TSchema extends StandardSchemaV1<Record<string, unknown>, Record<string, unknown>>,
  PKDef,
> {
  beforeCreate?: LifecycleHook<SchemaTypes<TSchema>["input"]>;
  afterCreate?: LifecycleHook<SchemaTypes<TSchema>["output"]>;
  beforeUpdate?: LifecycleHook<Partial<SchemaTypes<TSchema>["input"]>>;
  afterUpdate?: LifecycleHook<SchemaTypes<TSchema>["output"]>;
  beforeDelete?: LifecycleHook<PrimaryKeyParams<PKDef>>;
  afterDelete?: LifecycleHook<PrimaryKeyParams<PKDef>>;
  beforeGet?: LifecycleHook<PrimaryKeyParams<PKDef>>;
  afterGet?: LifecycleHook<SchemaTypes<TSchema>["output"] | null>;
}

// Helper function to suppress type errors when we know the correct keys are present
function applyPartitionKey<T extends Record<string, unknown>, K extends readonly string[]>(
  keyFn: (params: StrictGenerateType<K>) => string,
  data: T,
): string {
  return keyFn(data as unknown as StrictGenerateType<K>);
}

// Helper function to suppress type errors when we know the correct keys are present
function applySortKey<T extends Record<string, unknown>, K extends readonly string[]>(
  keyFn: (params: GenerateType<K>) => string,
  data: T,
): string {
  return keyFn(data as unknown as GenerateType<K>);
}

export class Entity<
  TSchema extends StandardSchemaV1<Record<string, unknown>, Record<string, unknown>>,
  PKDef extends {
    partitionKey: (params: StrictGenerateType<readonly string[]>) => string;
    sortKey: (params: GenerateType<readonly string[]>) => string;
  },
  I extends Record<string, unknown> = Record<string, never>,
  Q extends Record<string, QueryDefinition<TSchema>> = Record<string, never>,
> {
  private definition: EntityDefinition<TSchema, PKDef, I, Q>;
  private readonly hooks: EntityLifecycleHooks<TSchema, PKDef>;

  constructor(definition: EntityDefinition<TSchema, PKDef, I, Q>, hooks: EntityLifecycleHooks<TSchema, PKDef> = {}) {
    this.definition = definition;
    this.hooks = hooks;
  }

  /**
   * Creates a repository for this entity with the given table
   */
  createRepository<TConfig extends TableConfig = TableConfig>(
    table: Table<TConfig>,
  ): EntityRepository<TSchema, I, PKDef, Q, TConfig> {
    const repository: EntityRepository<TSchema, I, PKDef, Q, TConfig> = {
      create: async (data: SchemaTypes<TSchema>["input"]) => {
        // Run beforeCreate hook if exists
        const preCreateData = this.hooks.beforeCreate ? await this.hooks.beforeCreate(data) : data;

        // Generate keys
        const pk = applyPartitionKey(this.definition.primaryKey.partitionKey, preCreateData as Record<string, unknown>);
        const sk = applySortKey(this.definition.primaryKey.sortKey, preCreateData as Record<string, unknown>);

        // Create item with keys
        const item = {
          ...preCreateData,
          pk,
          sk,
          entityType: this.definition.name,
        } as Record<string, unknown>;

        await table.put(item).execute();

        // Run afterCreate hook if exists
        return this.hooks.afterCreate
          ? await this.hooks.afterCreate(item as SchemaTypes<TSchema>["output"])
          : (item as SchemaTypes<TSchema>["output"]);
      },

      update: async (data: Partial<SchemaTypes<TSchema>["input"]> & PrimaryKeyParams<PKDef>) => {
        // Run beforeUpdate hook if exists
        const preUpdateData = this.hooks.beforeUpdate ? await this.hooks.beforeUpdate(data) : data;

        // Generate keys
        const pk = applyPartitionKey(this.definition.primaryKey.partitionKey, preUpdateData as Record<string, unknown>);
        const sk = applySortKey(this.definition.primaryKey.sortKey, preUpdateData as Record<string, unknown>);

        const result = await table
          .update({ pk, sk })
          .set(preUpdateData as Record<string, unknown>)
          .execute();

        const updatedItem = result as SchemaTypes<TSchema>["output"];

        // Run afterUpdate hook if exists
        return this.hooks.afterUpdate ? await this.hooks.afterUpdate(updatedItem) : updatedItem;
      },

      delete: async (key: PrimaryKeyParams<PKDef>) => {
        // Run beforeDelete hook if exists
        const preDeleteKey = this.hooks.beforeDelete ? await this.hooks.beforeDelete(key) : key;

        // Generate keys
        const pk = applyPartitionKey(this.definition.primaryKey.partitionKey, preDeleteKey);
        const sk = applySortKey(this.definition.primaryKey.sortKey, preDeleteKey);

        await table.delete({ pk, sk }).execute();

        // Run afterDelete hook if exists
        if (this.hooks.afterDelete) {
          await this.hooks.afterDelete(preDeleteKey);
        }
      },

      get: async (key: PrimaryKeyParams<PKDef>) => {
        // Run beforeGet hook if exists
        const preGetKey = this.hooks.beforeGet ? await this.hooks.beforeGet(key) : key;

        // Generate keys
        const pk = applyPartitionKey(this.definition.primaryKey.partitionKey, preGetKey);
        const sk = applySortKey(this.definition.primaryKey.sortKey, preGetKey);

        const result = await table.get({ pk, sk }).execute();
        const item = result?.item as SchemaTypes<TSchema>["output"] | null;

        // Run afterGet hook if exists
        return this.hooks.afterGet ? await this.hooks.afterGet(item) : item;
      },

      query: {} as QueryMethods<TSchema, I, Q, TConfig>,
    };

    // Add query methods for each index
    if (this.definition.indexes) {
      for (const [indexName, index] of Object.entries(this.definition.indexes)) {
        const typedIndexName = indexName as keyof I;
        const typedIndex = index as {
          gsi?: string;
          lsi?: string;
          partitionKey: ReturnType<typeof partitionKey>;
          sortKey: ReturnType<typeof sortKey>;
          projection?: IndexProjection;
        };
        const queryMethod = ((params: IndexParams<I>[typeof typedIndexName]) => {
          const pk = applyPartitionKey(typedIndex.partitionKey, params);
          const sk = applySortKey(typedIndex.sortKey, params);

          const keyCondition = {
            pk: pk,
            sk: sk === "" ? (op: KeyConditionOperator) => op.beginsWith("") : (op: KeyConditionOperator) => op.eq(sk),
          };

          const queryBuilder =
            table.query<Extract<SchemaTypes<TSchema>["output"], Record<string, unknown>>>(keyCondition);

          if (typedIndex.gsi) {
            queryBuilder.useIndex(typedIndex.gsi);
          } else if (typedIndex.lsi) {
            // LSI doesn't need useIndex, it's implicitly used with the base table PK
          }

          if (typedIndex.projection?.projectionType === "INCLUDE") {
            queryBuilder.select(typedIndex.projection.nonKeyAttributes);
          } else if (typedIndex.projection?.projectionType === "KEYS_ONLY") {
            // For KEYS_ONLY projection, we'll rely on DynamoDB's default behavior
          }

          return queryBuilder;
        }) as QueryMethods<TSchema, I, Q, TConfig>[keyof I];

        repository.query[typedIndexName] = queryMethod;
      }
    }

    // Add custom query methods
    if (this.definition.query) {
      for (const [queryName, queryDef] of Object.entries(this.definition.query)) {
        const typedQueryName = queryName as keyof Q;
        const typedQueryDef = queryDef as QueryDefinition<TSchema>;

        const queryMethod = ((params: QueryParams<Q>[typeof typedQueryName]) => {
          const pk = applyPartitionKey(typedQueryDef.partitionKey, params);
          const sk = applySortKey(typedQueryDef.sortKey.value, params);

          const keyCondition = {
            pk: pk,
            sk: (op: KeyConditionOperator) => {
              const condition = typedQueryDef.sortKey.condition;
              if (condition === "beginsWith") {
                return op.beginsWith(sk);
              }
              if (condition === "eq") {
                return op.eq(sk);
              }
              throw new Error(`Unsupported condition: ${condition}`);
            },
          };

          const queryBuilder =
            table.query<Extract<SchemaTypes<TSchema>["output"], Record<string, unknown>>>(keyCondition);

          if (typedQueryDef.index !== "primary") {
            queryBuilder.useIndex(typedQueryDef.index);
          }

          return queryBuilder;
        }) as QueryMethods<TSchema, I, Q, TConfig>[keyof Q];

        repository.query[typedQueryName] = queryMethod;
      }
    }

    return repository;
  }

  /**
   * Validates data against the entity's schema
   */
  validate(data: unknown): { valid: boolean; errors?: string[] } {
    const validation = this.definition.schema["~standard"].validate(data);
    if ("issues" in validation && validation.issues) {
      return {
        valid: false,
        errors: validation.issues.map((issue) => issue.message),
      };
    }
    return { valid: true };
  }

  /**
   * Gets the entity's name
   */
  getName(): string {
    return this.definition.name;
  }

  /**
   * Gets the entity's schema
   */
  getSchema(): TSchema {
    return this.definition.schema;
  }

  /**
   * Gets the entity's primary key configuration
   */
  getPrimaryKey() {
    return this.definition.primaryKey;
  }

  /**
   * Gets the entity's indexes
   */
  getIndexes() {
    return this.definition.indexes;
  }

  /**
   * Gets the entity's lifecycle hooks
   */
  getHooks(): EntityLifecycleHooks<TSchema, PKDef> {
    return this.hooks;
  }
}

/**
 * Factory function to create a new entity
 */
export function defineEntity<
  TSchema extends StandardSchemaV1<Record<string, unknown>, Record<string, unknown>>,
  PKDef extends {
    partitionKey: (params: StrictGenerateType<readonly string[]>) => string;
    sortKey: (params: GenerateType<readonly string[]>) => string;
  },
  I extends Record<string, unknown> = Record<string, never>,
  Q extends Record<string, QueryDefinition<TSchema>> = Record<string, never>,
>(
  definition: EntityDefinition<TSchema, PKDef, I, Q>,
  hooks?: EntityLifecycleHooks<TSchema, PKDef>,
): Entity<TSchema, PKDef, I, Q> {
  return new Entity<TSchema, PKDef, I, Q>(definition, hooks);
}
