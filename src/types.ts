import type { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";

export interface Index {
  partitionKey: string;
  sortKey: string;
}

interface IndexConfig {
  partitionKey: string;
  sortKey: string;

  gsis?: Record<string, Index>;
}

export interface TableConfig {
  client: DynamoDBDocument;
  tableName: string;
  indexes: IndexConfig;
}

export interface EntityConfig<T> {
  name: string;
  partitionKeyPrefix?: string;
  sortKeyPrefix?: string;
  timestamps?: boolean;
  discriminator?: string; // To identify entity type in the table
}
