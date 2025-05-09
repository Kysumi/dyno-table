import type { DynamoItem } from "./types";

export interface IndexDefinition<
  T extends DynamoItem,
  P extends (item: T) => string,
  S extends ((item: T) => string) | undefined = undefined,
> {
  name: string;
  partitionKey: P;
  sortKey?: S;
  generateKey: (item: T) => { pk: string; sk?: string };
}
