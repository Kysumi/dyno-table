import type { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";

export type DynamoItem = { [key: string]: unknown };

export interface Index<T extends DynamoItem = DynamoItem> {
  partitionKey: string;
  sortKey?: string;
  /** Function to generate the index key from an item */
  generateKey?: (item: T, safeParse?: boolean) => { pk: string; sk?: string };
  /** Whether the index is read-only */
  isReadOnly?: boolean;
}

export interface IndexConfig {
  partitionKey: string;
  sortKey?: string;

  gsis?: Record<string, Index>;
}

export interface TableConfig {
  client: DynamoDBDocument;
  tableName: string;
  indexes: IndexConfig;
}

export type GSINames<T extends TableConfig> = keyof NonNullable<T["indexes"]["gsis"]>;
