export interface DynamoRecord {
  [key: string]: unknown;
}

export interface QueryPaginator<T> {
  hasNextPage: () => boolean;
  getPage: () => Promise<{
    items: T[];
    nextPageToken?: Record<string, unknown>;
  }>;
}
