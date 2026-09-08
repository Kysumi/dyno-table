import type { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import type { TablePlugin } from "./plugins.js";

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
  vectorIndexes?: Record<string, VectorIndexConfig>;
}

export interface TableConfig {
  client: DynamoDBDocument;
  tableName: string;
  indexes: IndexConfig;
  /** Plugins observing every physical DynamoDB request. */
  plugins?: readonly TablePlugin[];
}

export type GSINames<T extends TableConfig> = keyof NonNullable<T["indexes"]["gsis"]>;

export type VectorDistanceFunction = "COSINE" | "DOT_PRODUCT" | "EUCLIDEAN";

export type VectorProjection =
  | { type: "ALL" }
  | { type: "KEYS_ONLY" }
  | { type: "INCLUDE"; attributes: readonly string[] };

export interface VectorIndexConfig {
  vectorAttribute: string;
  dimensions: number;
  distanceFunction: VectorDistanceFunction;
  partitionKey?: string;
  inlineFilters?: readonly string[];
  projection: VectorProjection;
}

export type VectorIndexNames<T extends TableConfig> = T["indexes"] extends {
  vectorIndexes: infer TVectorIndexes extends Record<string, VectorIndexConfig>;
}
  ? Extract<keyof TVectorIndexes, string>
  : string;

export type VectorIndexFor<
  TConfig extends TableConfig,
  TIndexName extends VectorIndexNames<TConfig>,
> = TConfig["indexes"] extends {
  vectorIndexes: infer TVectorIndexes extends Record<string, VectorIndexConfig>;
}
  ? TIndexName extends keyof TVectorIndexes
    ? TVectorIndexes[TIndexName]
    : VectorIndexConfig
  : VectorIndexConfig;
