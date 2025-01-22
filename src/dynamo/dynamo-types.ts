type DynamoKey = Record<string, unknown>;

export interface DynamoExpression {
  expression?: string;
  names?: Record<string, string>;
  values?: Record<string, unknown>;
}

export interface DynamoGetOptions {
  key: DynamoKey;
  indexName?: string;
}

export interface DynamoQueryOptions {
  indexName?: string;
  filter?: DynamoExpression;
  keyCondition?: DynamoExpression;
  limit?: number;
  autoPaginate?: boolean;
  consistentRead?: boolean;
  sortDirection?: "asc" | "desc";
  exclusiveStartKey?: Record<string, unknown>;
}

export interface DynamoPutOptions {
  item: Record<string, unknown>;
  condition?: DynamoExpression;
  // Only option that does anything according to docs
  // https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_PutItem.html#API_PutItem_ResponseElements
  returnValues?: "ALL_OLD";
}

export interface DynamoUpdateOptions {
  key: DynamoKey;
  update: DynamoExpression;
  condition?: DynamoExpression;
  returnValues?: "ALL_NEW" | "ALL_OLD" | "UPDATED_NEW" | "UPDATED_OLD";
}

export interface DynamoDeleteOptions {
  key: DynamoKey;
  condition?: DynamoExpression;
}

export interface DynamoScanOptions {
  filter?: DynamoExpression;
  limit?: number;
  indexName?: string;
  exclusiveStartKey?: Record<string, unknown>;
  consistentRead?: boolean;
}

export interface DynamoBatchWriteItem {
  put?: Record<string, unknown>;
  delete?: DynamoKey;
}

export interface DynamoTransactItem {
  put?: {
    item: Record<string, unknown>;
    condition?: DynamoExpression;
  };
  delete?: {
    key: DynamoKey;
    condition?: DynamoExpression;
  };
  update?: {
    key: DynamoKey;
    update: DynamoExpression;
    condition?: DynamoExpression;
  };
}

export type PrimaryKeyWithoutExpression = {
  pk: string;
  sk?: string;
};

export type BatchWriteOperation =
  | { type: "put"; item: Record<string, unknown> }
  | { type: "delete"; key: PrimaryKeyWithoutExpression };

export type DynamoOperation =
  | DynamoPutOptions
  | DynamoUpdateOptions
  | DynamoDeleteOptions
  | DynamoQueryOptions
  | DynamoScanOptions;
