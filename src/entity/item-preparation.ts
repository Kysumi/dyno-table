import { DynoTableError } from "../errors.js";
import type { StandardSchemaV1 } from "../standard-schema.js";
import type { Table } from "../table.js";
import type { DynamoItem } from "../types.js";
import { EntityErrors } from "../utils/error-factory.js";
import { extractRequiredAttributes } from "../utils/error-utils.js";
import type { IndexDefinition } from "./create-index.js";
import { GsiKeyBuilder } from "./ddb-indexing.js";

type ItemOperation = "create" | "upsert";

export interface ItemPreparationConfig<T extends DynamoItem, TInput extends DynamoItem, I extends DynamoItem> {
  name: string;
  schema: StandardSchemaV1<TInput, T>;
  primaryKey: IndexDefinition<I>;
  indexes?: Record<string, IndexDefinition<T>>;
  entityTypeAttributeName: string;
  generateTimestamps: (data: Partial<T>) => Record<string, string | number>;
}

function finishPreparingItem<T extends DynamoItem, TInput extends DynamoItem, I extends DynamoItem>(
  config: ItemPreparationConfig<T, TInput, I>,
  table: Table,
  operation: ItemOperation,
  validatedData: T,
): T {
  const dataForKeyGeneration = { ...validatedData, ...config.generateTimestamps(validatedData) } as T;

  let primaryKey: { pk: string; sk?: string };
  try {
    primaryKey = config.primaryKey.generateKey(dataForKeyGeneration as unknown as I);
    if (
      primaryKey.pk === undefined ||
      primaryKey.pk === null ||
      (table.sortKey !== undefined && (primaryKey.sk === undefined || primaryKey.sk === null))
    ) {
      throw EntityErrors.keyInvalidFormat(config.name, operation, dataForKeyGeneration, primaryKey);
    }
  } catch (error) {
    if (error instanceof DynoTableError) {
      throw error;
    }
    throw EntityErrors.keyGenerationFailed(
      config.name,
      operation,
      dataForKeyGeneration,
      extractRequiredAttributes(error),
      error instanceof Error ? error : undefined,
    );
  }

  return {
    ...dataForKeyGeneration,
    [config.entityTypeAttributeName]: config.name,
    [table.partitionKey]: primaryKey.pk,
    ...(table.sortKey ? { [table.sortKey]: primaryKey.sk } : {}),
    ...new GsiKeyBuilder(table, config.indexes).buildForCreate(dataForKeyGeneration),
  } as T;
}

export async function prepareItemAsync<T extends DynamoItem, TInput extends DynamoItem, I extends DynamoItem>(
  config: ItemPreparationConfig<T, TInput, I>,
  table: Table,
  operation: ItemOperation,
  data: TInput,
): Promise<T> {
  const result = await config.schema["~standard"].validate(data);
  if ("issues" in result && result.issues) {
    throw EntityErrors.validationFailed(config.name, operation, result.issues, data);
  }
  return finishPreparingItem(config, table, operation, result.value);
}

export function prepareItemSync<T extends DynamoItem, TInput extends DynamoItem, I extends DynamoItem>(
  config: ItemPreparationConfig<T, TInput, I>,
  table: Table,
  operation: ItemOperation,
  data: TInput,
): T {
  const result = config.schema["~standard"].validate(data);
  if (result instanceof Promise) throw EntityErrors.asyncValidationNotSupported(config.name, operation);
  if ("issues" in result && result.issues) {
    throw EntityErrors.validationFailed(config.name, operation, result.issues, data);
  }
  return finishPreparingItem(config, table, operation, result.value);
}
