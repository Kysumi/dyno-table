export interface ErrorContext {
  operation: string;
  tableName: string;
  commandInput: Record<string, unknown>;
}

export interface TranslatedQuery {
  TableName: string;
  KeyConditionExpression?: string;
  FilterExpression?: string;
  IndexName?: string;
  ConsistentRead?: boolean;
  ScanIndexForward?: boolean;
  Limit?: number;
  UpdateExpression?: string;
}
