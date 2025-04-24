import type { Table } from "../table";
import type {
  EntityDefinition,
  EntityRepository,
  QueryMethods,
  IndexProjection,
  PrimaryKeyParams,
  IndexParams,
} from "./types";
import type { GenerateType, sortKey } from "../utils/sort-key-template";
import type { partitionKey, StrictGenerateType } from "../utils/partition-key-template";
import type { StandardSchemaV1 } from "../standard-schema";
import type { Condition } from "../conditions";
import type { TableConfig } from "../types";

export type LifecycleHook<T> = (data: T) => Promise<T> | T;

export interface EntityLifecycleHooks<T extends Record<string, unknown>, PKDef> {
  beforeCreate?: LifecycleHook<T>;
  afterCreate?: LifecycleHook<T>;
  beforeUpdate?: LifecycleHook<Partial<T>>;
  afterUpdate?: LifecycleHook<T>;
  beforeDelete?: LifecycleHook<PrimaryKeyParams<PKDef>>;
  afterDelete?: LifecycleHook<PrimaryKeyParams<PKDef>>;
  beforeGet?: LifecycleHook<PrimaryKeyParams<PKDef>>;
  afterGet?: LifecycleHook<T | null>;
}

export class Entity<
  T extends Record<string, unknown>,
  PKDef extends {
    partitionKey: (params: StrictGenerateType<readonly string[]>) => string;
    sortKey: (params: GenerateType<readonly string[]>) => string;
  },
  I extends Record<string, unknown> = Record<string, never>,
> {
  private definition: EntityDefinition<T, PKDef, I>;
  private readonly hooks: EntityLifecycleHooks<T, PKDef>;

  constructor(definition: EntityDefinition<T, PKDef, I>, hooks: EntityLifecycleHooks<T, PKDef> = {}) {
    this.definition = definition;
    this.hooks = hooks;
  }

  /**
   * Creates a repository for this entity with the given table
   */
  createRepository<TConfig extends TableConfig = TableConfig>(
    table: Table<TConfig>,
  ): EntityRepository<T, I, PKDef, TConfig> {
    const repository: EntityRepository<T, I, PKDef, TConfig> = {
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
          throw new Error("Cannot update without complete key information in the provided data");
        }

        const result = await table.update({ pk, sk }).set(preUpdateData).execute();

        const updatedItem = result as T;

        // Run afterUpdate hook if exists
        return this.hooks.afterUpdate ? await this.hooks.afterUpdate(updatedItem) : updatedItem;
      },

      delete: async (key: PrimaryKeyParams<PKDef>) => {
        // Run beforeDelete hook if exists
        const preDeleteKey = this.hooks.beforeDelete ? await this.hooks.beforeDelete(key) : key;

        // Generate pk/sk from the inferred key object
        const pk = this.definition.primaryKey.partitionKey(preDeleteKey as StrictGenerateType<readonly string[]>);
        const sk = this.definition.primaryKey.sortKey(preDeleteKey as GenerateType<readonly string[]>);

        await table.delete({ pk, sk }).execute();

        // Run afterDelete hook if exists
        if (this.hooks.afterDelete) {
          await this.hooks.afterDelete(preDeleteKey);
        }
      },

      get: async (key: PrimaryKeyParams<PKDef>) => {
        // Run beforeGet hook if exists
        const preGetKey = this.hooks.beforeGet ? await this.hooks.beforeGet(key) : key;

        // Generate pk/sk from the inferred key object
        const pk = this.definition.primaryKey.partitionKey(preGetKey as StrictGenerateType<readonly string[]>);
        const sk = this.definition.primaryKey.sortKey(preGetKey as GenerateType<readonly string[]>);

        const result = await table.get({ pk, sk }).execute();
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
          projection?: IndexProjection;
        };
        const queryMethod = ((params: IndexParams<I>[keyof I]) => {
          const pk = typedIndex.partitionKey(params as StrictGenerateType<readonly string[]>);
          const sk = typedIndex.sortKey(params as GenerateType<readonly string[]>);

          const keyCondition = {
            pk: pk,
            sk:
              sk === ""
                ? (op: { beginsWith: (value: string) => Condition }) => op.beginsWith("")
                : (op: { eq: (value: string) => Condition }) => op.eq(sk),
          };

          const queryBuilder = table.query<T>(keyCondition);

          if (typedIndex.gsi) {
            queryBuilder.useIndex(typedIndex.gsi);
          } else if (typedIndex.lsi) {
            // LSI doesn't need useIndex, it's implicitly used with the base table PK
          }

          if (typedIndex.projection?.projectionType === "INCLUDE") {
            queryBuilder.select(typedIndex.projection.nonKeyAttributes);
          } else if (typedIndex.projection?.projectionType === "KEYS_ONLY") {
            // For KEYS_ONLY, we might need to explicitly select the base table keys + index keys
            // This depends on the exact behavior desired and DynamoDB specifics.
            // queryBuilder.select([...baseTableKeys, ...indexKeys]);
            // For simplicity, we'll rely on DynamoDB's default KEYS_ONLY behavior for now.
          }

          return queryBuilder;
        }) as QueryMethods<T, I, TConfig>[keyof I];

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
  getHooks(): EntityLifecycleHooks<T, PKDef> {
    return this.hooks;
  }
}

/**
 * Factory function to create a new entity
 */
export function defineEntity<
  T extends Record<string, unknown>,
  PKDef extends {
    partitionKey: (params: StrictGenerateType<readonly string[]>) => string;
    sortKey: (params: GenerateType<readonly string[]>) => string;
  },
  I extends Record<string, unknown> = Record<string, never>,
>(definition: EntityDefinition<T, PKDef, I>, hooks?: EntityLifecycleHooks<T, PKDef>): Entity<T, PKDef, I> {
  return new Entity<T, PKDef, I>(definition, hooks);
}
