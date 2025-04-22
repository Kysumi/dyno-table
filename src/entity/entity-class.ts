import type { Table } from "../table";
import type { EntityDefinition, EntityRepository, QueryMethods } from "./types";
import type { GenerateType } from "../utils/sort-key-template";
import type { StrictGenerateType } from "../utils/partition-key-template";
import type { StandardSchemaV1 } from "../standard-schema";
import type { Condition } from "../conditions";
import type { partitionKey, sortKey } from "../entity/templates";

export type LifecycleHook<T> = (data: T) => Promise<T> | T;

export interface EntityLifecycleHooks<T extends Record<string, unknown>> {
  beforeCreate?: LifecycleHook<T>;
  afterCreate?: LifecycleHook<T>;
  beforeUpdate?: LifecycleHook<Partial<T>>;
  afterUpdate?: LifecycleHook<T>;
  beforeDelete?: LifecycleHook<{ pk: string; sk: string }>;
  afterDelete?: LifecycleHook<{ pk: string; sk: string }>;
  beforeGet?: LifecycleHook<{ pk: string; sk: string }>;
  afterGet?: LifecycleHook<T | null>;
}

export class Entity<T extends Record<string, unknown>, I extends Record<string, unknown> = Record<string, never>> {
  private definition: EntityDefinition<T, I>;
  private hooks: EntityLifecycleHooks<T>;

  constructor(definition: EntityDefinition<T, I>, hooks: EntityLifecycleHooks<T> = {}) {
    this.definition = definition;
    this.hooks = hooks;
  }

  /**
   * Creates a repository for this entity with the given table
   */
  createRepository(table: Table): EntityRepository<T, I> {
    const repository: EntityRepository<T, I> = {
      create: async (data: T) => {
        // Run beforeCreate hook if exists
        const preCreateData = this.hooks.beforeCreate ? await this.hooks.beforeCreate(data) : data;

        // Generate keys
        const pk = this.definition.primaryKey.partitionKey(preCreateData as StrictGenerateType<readonly string[]>);
        const sk = this.definition.primaryKey.sortKey(preCreateData as GenerateType<readonly string[]>);

        // Create item with keys
        const item = {
          ...preCreateData,
          pk,
          sk,
          entityType: this.definition.name,
        };

        await table.put(item).execute();

        // Run afterCreate hook if exists
        return this.hooks.afterCreate ? await this.hooks.afterCreate(item) : item;
      },

      update: async (data: Partial<T>) => {
        // Run beforeUpdate hook if exists
        const preUpdateData = this.hooks.beforeUpdate ? await this.hooks.beforeUpdate(data) : data;

        // Generate keys from partial data
        const pk = this.definition.primaryKey.partitionKey(preUpdateData as StrictGenerateType<readonly string[]>);
        const sk = this.definition.primaryKey.sortKey(preUpdateData as GenerateType<readonly string[]>);

        if (!pk || !sk) {
          throw new Error("Cannot update without complete key information");
        }

        const result = await table.update({ pk, sk }).set(preUpdateData).execute();

        const updatedItem = result as T;

        // Run afterUpdate hook if exists
        return this.hooks.afterUpdate ? await this.hooks.afterUpdate(updatedItem) : updatedItem;
      },

      delete: async (key: { pk: string; sk: string }) => {
        // Run beforeDelete hook if exists
        const preDeleteKey = this.hooks.beforeDelete ? await this.hooks.beforeDelete(key) : key;

        await table.delete(preDeleteKey).execute();

        // Run afterDelete hook if exists
        if (this.hooks.afterDelete) {
          await this.hooks.afterDelete(preDeleteKey);
        }
      },

      get: async (key: { pk: string; sk: string }) => {
        // Run beforeGet hook if exists
        const preGetKey = this.hooks.beforeGet ? await this.hooks.beforeGet(key) : key;

        const result = await table.get(preGetKey).execute();
        const item = result?.item as T | null;

        // Run afterGet hook if exists
        return this.hooks.afterGet ? await this.hooks.afterGet(item) : item;
      },

      query: {} as QueryMethods<T, I>,
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
        };
        const queryMethod = (async (params) => {
          const pk = typedIndex.partitionKey(params as StrictGenerateType<readonly string[]>);
          const sk = typedIndex.sortKey(params as GenerateType<readonly string[]>);

          // If sort key is empty (no sort key parameters provided), use beginsWith with empty string
          const skCondition =
            sk === ""
              ? (op: { beginsWith: (value: string) => Condition }) => op.beginsWith("")
              : (op: { eq: (value: string) => Condition }) => op.eq(sk);

          const queryBuilder = table.query({ pk, sk: skCondition });

          if (typedIndex.gsi) {
            queryBuilder.useIndex(typedIndex.gsi);
          }

          const result = await queryBuilder.execute();
          return result.items as T[];
        }) as QueryMethods<T, I>[keyof I];

        repository.query[typedIndexName] = queryMethod;
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
  getSchema(): StandardSchemaV1 {
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
  getHooks(): EntityLifecycleHooks<T> {
    return this.hooks;
  }
}

/**
 * Factory function to create a new entity
 */
export function defineEntity<
  T extends Record<string, unknown>,
  I extends Record<string, unknown> = Record<string, never>,
>(definition: EntityDefinition<T, I>, hooks?: EntityLifecycleHooks<T>): Entity<T, I> {
  return new Entity<T, I>(definition, hooks);
}
