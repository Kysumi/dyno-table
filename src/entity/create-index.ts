import type { StandardSchemaV1 } from "../standard-schema.js";
import type { DynamoItem, Index } from "../types.js";
import { ValidationErrors } from "../utils/error-factory.js";

/** Defines a DynamoDB index configuration. */
export interface IndexDefinition<T extends DynamoItem> extends Index<T> {
  name: string;
  isReadOnly: boolean;
  generateKey: (item: T) => { pk: string; sk?: string };
}

export interface BuiltIndexDefinition<T extends DynamoItem> extends IndexDefinition<T> {
  readOnly: (value?: boolean) => IndexDefinition<T>;
}

export interface PartitionKeyIndexBuilder<T extends DynamoItem> {
  sortKey: <S extends (item: T) => string>(skFn: S) => BuiltIndexDefinition<T>;
  withoutSortKey: () => BuiltIndexDefinition<T>;
}

export interface IndexBuilder<T extends DynamoItem> {
  partitionKey: <P extends (item: T) => string>(pkFn: P) => PartitionKeyIndexBuilder<T>;
  readOnly: (value?: boolean) => IndexBuilder<T>;
}

export interface CreateIndexBuilder {
  input: <T extends DynamoItem>(schema: StandardSchemaV1<T>) => IndexBuilder<T>;
}

export function createIndex(): CreateIndexBuilder {
  return {
    input: <T extends DynamoItem>(schema: StandardSchemaV1<T>) => {
      const makeIndex = (
        isReadOnly: boolean,
        pkFn: (item: T) => string,
        skFn?: (item: T) => string,
      ): BuiltIndexDefinition<T> => {
        const index: IndexDefinition<T> = {
          name: "custom",
          partitionKey: "pk",
          ...(skFn && { sortKey: "sk" }),
          isReadOnly,
          generateKey: (item) => {
            const data = schema["~standard"].validate(item) as StandardSchemaV1.Result<T>;
            if ("issues" in data && data.issues) {
              throw ValidationErrors.indexSchemaValidationFailed(data.issues, skFn ? "both" : "partition");
            }
            const validData = "value" in data ? data.value : item;
            return { pk: pkFn(validData), ...(skFn && { sk: skFn(validData) }) };
          },
        };

        return Object.assign(index, {
          readOnly: (value = !skFn): IndexDefinition<T> => ({ ...index, isReadOnly: value }),
        });
      };

      const createIndexBuilder = (isReadOnly = false): IndexBuilder<T> => ({
        partitionKey: (pkFn) => ({
          sortKey: (skFn) => makeIndex(isReadOnly, pkFn, skFn),
          withoutSortKey: () => makeIndex(isReadOnly, pkFn),
        }),
        readOnly: (value = true) => createIndexBuilder(value),
      });

      return createIndexBuilder();
    },
  };
}
