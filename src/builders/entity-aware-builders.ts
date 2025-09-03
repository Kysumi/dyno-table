import type { DynamoItem } from "../types";
import type { BatchBuilder } from "./batch-builder";
import type { PutBuilder } from "./put-builder";
import type { GetBuilder } from "./get-builder";
import type { DeleteBuilder } from "./delete-builder";
import type { UpdateBuilder } from "./update-builder";

/**
 * Creates an entity-aware wrapper that automatically provides entity names to batch operations
 * while transparently delegating all other method calls to the underlying builder.
 */
function createEntityAwareBuilder<T extends object>(
  builder: T,
  entityName: string,
): T & { readonly entityName: string } {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      // Expose the entity name as a readonly property
      if (prop === "entityName") {
        return entityName;
      }

      // Intercept withBatch method to provide automatic entity type inference
      if (prop === "withBatch" && typeof (target as Record<string, unknown>)[prop] === "function") {
        return <
          TEntities extends Record<string, DynamoItem> = Record<string, DynamoItem>,
          K extends keyof TEntities = keyof TEntities,
        >(
          batch: BatchBuilder<TEntities>,
          entityType?: K,
        ) => {
          // Use provided entityType or fall back to stored entityName
          const typeToUse = entityType ?? (entityName as K);
          const fn = (target as Record<string, unknown>)[prop] as (
            batch: BatchBuilder<TEntities>,
            entityType?: K,
          ) => unknown;
          // Call the function with the original target as 'this' context
          return fn.call(target, batch, typeToUse);
        };
      }

      // For all other properties/methods, delegate to the original builder
      return Reflect.get(target, prop, receiver);
    },
  }) as T & { readonly entityName: string };
}

/**
 * Entity-aware wrapper for PutBuilder that automatically provides entity name to batch operations
 */
export type EntityAwarePutBuilder<T extends DynamoItem> = PutBuilder<T> & {
  readonly entityName: string;
};

/**
 * Creates an entity-aware PutBuilder
 */
export function createEntityAwarePutBuilder<T extends DynamoItem>(
  builder: PutBuilder<T>,
  entityName: string,
): EntityAwarePutBuilder<T> {
  return createEntityAwareBuilder(builder, entityName);
}

/**
 * Entity-aware wrapper for GetBuilder that automatically provides entity name to batch operations
 */
export type EntityAwareGetBuilder<T extends DynamoItem> = GetBuilder<T> & {
  readonly entityName: string;
};

/**
 * Creates an entity-aware GetBuilder
 */
export function createEntityAwareGetBuilder<T extends DynamoItem>(
  builder: GetBuilder<T>,
  entityName: string,
): EntityAwareGetBuilder<T> {
  return createEntityAwareBuilder(builder, entityName);
}

/**
 * Entity-aware wrapper for DeleteBuilder that automatically provides entity name to batch operations
 */
export type EntityAwareDeleteBuilder = DeleteBuilder & {
  readonly entityName: string;
};

/**
 * Creates an entity-aware DeleteBuilder
 */
export function createEntityAwareDeleteBuilder(builder: DeleteBuilder, entityName: string): EntityAwareDeleteBuilder {
  return createEntityAwareBuilder(builder, entityName);
}

/**
 * Entity-aware wrapper for UpdateBuilder that adds forceIndexRebuild functionality
 * and automatically provides entity name to batch operations
 */
export type EntityAwareUpdateBuilder<T extends DynamoItem> = UpdateBuilder<T> & {
  readonly entityName: string;
  forceIndexRebuild(indexes: string | string[]): EntityAwareUpdateBuilder<T>;
  getForceRebuildIndexes(): string[];
};

/**
 * Creates an entity-aware UpdateBuilder with force index rebuild functionality
 */
export function createEntityAwareUpdateBuilder<T extends DynamoItem>(
  builder: UpdateBuilder<T>,
  entityName: string,
): EntityAwareUpdateBuilder<T> {
  // Track force rebuild indexes
  let forceRebuildIndexes: string[] = [];

  const proxy = new Proxy(builder, {
    get(target, prop, receiver) {
      // Expose the entity name as a readonly property
      if (prop === "entityName") {
        return entityName;
      }

      // Add forceIndexRebuild method
      if (prop === "forceIndexRebuild") {
        return (indexes: string | string[]) => {
          if (Array.isArray(indexes)) {
            forceRebuildIndexes = [...forceRebuildIndexes, ...indexes];
          } else {
            forceRebuildIndexes.push(indexes);
          }
          return proxy; // Return the proxy for chaining
        };
      }

      // Add getForceRebuildIndexes method
      if (prop === "getForceRebuildIndexes") {
        return () => [...forceRebuildIndexes];
      }

      // Intercept withBatch method to provide automatic entity type inference
      if (prop === "withBatch" && typeof (target as unknown as Record<string, unknown>)[prop] === "function") {
        return <
          TEntities extends Record<string, DynamoItem> = Record<string, DynamoItem>,
          K extends keyof TEntities = keyof TEntities,
        >(
          batch: BatchBuilder<TEntities>,
          entityType?: K,
        ) => {
          // Use provided entityType or fall back to stored entityName
          const typeToUse = entityType ?? (entityName as K);
          const fn = (target as unknown as Record<string, unknown>)[prop] as (
            batch: BatchBuilder<TEntities>,
            entityType?: K,
          ) => unknown;
          // Call the function with the original target as 'this' context
          return fn.call(target, batch, typeToUse);
        };
      }

      // For all other properties/methods, delegate to the original builder
      return Reflect.get(target, prop, receiver);
    },
  }) as EntityAwareUpdateBuilder<T>;

  return proxy;
}
