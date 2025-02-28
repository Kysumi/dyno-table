export interface IndexDefinition {
  name: string;
  keySchema: { pk: string; sk: string };
  projection?: {
    type: "ALL" | "KEYS_ONLY" | "INCLUDE";
    nonKeyAttributes?: string[];
  };
}

export interface TableConfig {
  name: string;
  partitionKey: string;
  sortKey?: string;
  gsis?: IndexDefinition[];
  lsis?: IndexDefinition[];
}

export interface EntityConfig<T> {
  name: string;
  partitionKeyPrefix?: string;
  sortKeyPrefix?: string;
  timestamps?: boolean;
  discriminator?: string; // To identify entity type in the table
}
