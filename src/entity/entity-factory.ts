import type { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import type { Table } from "../table";
import type { EntityDefinition, EntityRepository, QueryMethods } from "./types";
import type { PrimaryKey, PrimaryKeyWithoutExpression } from "../conditions";
import type { GenerateType } from "../utils/sort-key-template";
import type { StrictGenerateType } from "../utils/partition-key-template";

export function defineEntity<T extends Record<string, unknown>>(definition: EntityDefinition<T>): EntityDefinition<T> {
  return definition;
}

export function createRepository<T extends Record<string, unknown>>(
  definition: EntityDefinition<T>,
  table: Table,
): EntityRepository<T> {
  const repository: EntityRepository<T> = {
    create: async (data: T) => {
      // Generate keys
      const pk = definition.primaryKey.partitionKey(data as StrictGenerateType<readonly string[]>);
      const sk = definition.primaryKey.sortKey(data as GenerateType<readonly string[]>);

      // Create item with keys
      const item = {
        ...data,
        pk,
        sk,
        entityType: definition.name,
      };

      await table.put(item).execute();
      return item;
    },

    update: async (data: Partial<T>) => {
      // Generate keys from partial data
      const pk = definition.primaryKey.partitionKey(data as StrictGenerateType<readonly string[]>);
      const sk = definition.primaryKey.sortKey(data as GenerateType<readonly string[]>);

      if (!pk || !sk) {
        throw new Error("Cannot update without complete key information");
      }

      const result = await table.update({ pk, sk }).set(data).execute();

      return result as T;
    },

    delete: async (key: { pk: string; sk: string }) => {
      await table.delete(key).execute();
    },

    get: async (key: { pk: string; sk: string }) => {
      const result = await table.get(key).execute();
      return result?.item as T | null;
    },

    query: {} as QueryMethods<T>,
  };

  // Add query methods for each index
  if (definition.indexes) {
    for (const [indexName, index] of Object.entries(definition.indexes)) {
      const typedIndexName = indexName as keyof QueryMethods<T>;
      repository.query[typedIndexName] = async (params) => {
        const pk = index.partitionKey(params as StrictGenerateType<readonly string[]>);
        const sk = index.sortKey(params as GenerateType<readonly string[]>);

        const queryBuilder = table.query({ pk, sk: (op) => op.eq(sk) });

        if (index.gsi) {
          queryBuilder.useIndex(index.gsi);
        }

        const result = await queryBuilder.execute();
        return result.items as T[];
      };
    }
  }

  return repository;
}

function generateKey(template: { template: string; variables: string[] }, data: Record<string, unknown>): string {
  return template.variables.reduce((acc, variable) => {
    const value = data[variable];
    if (value === undefined) {
      throw new Error(`Missing required value for key variable: ${variable}`);
    }
    return acc.replace(`\${${variable}}`, String(value));
  }, template.template);
}
