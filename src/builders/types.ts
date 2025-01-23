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

// Add new type utility for extracting paths
type PathImpl<T, K extends keyof T> = K extends string
  ? T[K] extends Record<string, unknown>
    ? `${K}.${PathImpl<T[K], keyof T[K]>}`
    : K
  : never;

export type Path<T> = PathImpl<T, keyof T>;

export type PathType<T, K extends keyof any> = K extends `${infer Key}.${infer Rest}`
  ? Key extends keyof T
    ? Rest extends keyof any
      ? PathType<T[Key], Rest>
      : never
    : never
  : K extends keyof T
    ? T[K]
    : never;
