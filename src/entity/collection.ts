import type { Paginator } from "../builders/paginator.js";
import type { QueryBuilder } from "../builders/query-builder.js";
import type { ResultIterator } from "../builders/result-iterator.js";
import type { PrimaryKey } from "../conditions.js";
import type { Table } from "../table.js";
import type { DynamoItem, TableConfig } from "../types.js";
import type { EntityDefinition } from "./entity.js";

const DEFAULT_PAGE_SIZE = 25;

// biome-ignore lint/suspicious/noExplicitAny: entity maps are heterogeneous by design
type AnyEntityDefinition = EntityDefinition<any, any, any, any>;
// biome-ignore lint/suspicious/noExplicitAny: only the inferred output type is relevant
type InferEntityItem<E> = E extends EntityDefinition<infer T, any, any, any> ? T : never;
type GroupedResult<E extends Record<string, AnyEntityDefinition>> = {
  [K in keyof E]: InferEntityItem<E[K]>[];
};
/** Union of every entity's item type in the collection — sound only where items are filtered to configured entities. */
type CollectionItem<E extends Record<string, AnyEntityDefinition>> = InferEntityItem<E[keyof E]>;

type GroupCollectionBuilderMethod<E extends Record<string, AnyEntityDefinition>, M> = M extends (
  ...args: infer A
) => infer R
  ? R extends QueryBuilder<DynamoItem, TableConfig>
    ? (...args: A) => CollectionQueryBuilder<E>
    : M
  : M;

/** Buckets items by the configured entity definitions. Unmatched items are omitted. */
export function groupByEntityType<E extends Record<string, AnyEntityDefinition>>(
  items: DynamoItem[],
  entities: E,
  entityTypeAttributeName = "entityType",
): GroupedResult<E> {
  assertNoDuplicateEntityNames(entities);
  const nameToKey = new Map(Object.entries(entities).map(([key, entity]) => [entity.name, key]));
  const result = emptyGroupedResult(entities);

  for (const item of items) {
    const key = nameToKey.get(item[entityTypeAttributeName] as string);
    if (key !== undefined) (result[key] as DynamoItem[]).push(item);
  }

  return result;
}

export interface CollectionConfig<E extends Record<string, AnyEntityDefinition>> {
  entities: E;
  /** GSI name if the collection lives on a secondary index; omit for the base table. */
  indexName?: string;
  entityTypeAttributeName?: string;
}

export interface CollectionDefinition<E extends Record<string, AnyEntityDefinition>> {
  entities: E;
  createReader: (table: Table) => CollectionReader<E>;
}

export interface CollectionReader<E extends Record<string, AnyEntityDefinition>> {
  query: (keyCondition: PrimaryKey) => CollectionQueryBuilder<E>;
}

/** A QueryBuilder whose chainable methods retain a grouped paginator. */
export type CollectionQueryBuilder<E extends Record<string, AnyEntityDefinition>> = {
  [K in keyof QueryBuilder<DynamoItem, TableConfig>]: K extends "paginate"
    ? (pageSize?: number) => CollectionPageIterator<E>
    : K extends "execute"
      ? () => Promise<CollectionResultIterator<E>>
      : K extends "clone"
        ? QueryBuilder<DynamoItem, TableConfig>[K]
        : GroupCollectionBuilderMethod<E, QueryBuilder<DynamoItem, TableConfig>[K]>;
};

export class CollectionPageIterator<E extends Record<string, AnyEntityDefinition>> {
  constructor(
    private readonly paginator: Paginator<DynamoItem>,
    private readonly entities: E,
    private readonly entityTypeAttributeName: string,
  ) {}

  async *[Symbol.asyncIterator](): AsyncIterableIterator<GroupedResult<E>> {
    while (this.paginator.hasNextPage()) {
      const { items } = await this.paginator.getNextPage();
      yield groupByEntityType(items, this.entities, this.entityTypeAttributeName);
    }
  }

  getCurrentPage(): number {
    return this.paginator.getCurrentPage();
  }

  async getAllPages(): Promise<GroupedResult<E>> {
    const merged = emptyGroupedResult(this.entities);

    for await (const page of this) {
      for (const key of Object.keys(this.entities)) {
        (merged[key] as DynamoItem[]).push(...(page[key] as DynamoItem[]));
      }
    }

    return merged;
  }
}

/**
 * Same shape as ResultIterator (async-iterable + toArray()) for devs who want immediate,
 * unpaginated data. Streams individual items (filtered to configured entities, typed as
 * their union) via for-await; toArray() groups everything by entity type — same shape as
 * CollectionPageIterator.getAllPages(), just reached via execute() instead of paginate().
 */
export class CollectionResultIterator<E extends Record<string, AnyEntityDefinition>> {
  private readonly entityNames: Set<string>;

  constructor(
    private readonly source: ResultIterator<DynamoItem, TableConfig>,
    private readonly entities: E,
    private readonly entityTypeAttributeName: string,
  ) {
    this.entityNames = new Set(Object.values(entities).map((entity) => entity.name));
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<CollectionItem<E>> {
    for await (const item of this.source) {
      if (this.entityNames.has(item[this.entityTypeAttributeName] as string)) {
        yield item as CollectionItem<E>;
      }
    }
  }

  async toArray(): Promise<GroupedResult<E>> {
    const items: DynamoItem[] = [];
    for await (const item of this.source) {
      items.push(item);
    }
    return groupByEntityType(items, this.entities, this.entityTypeAttributeName);
  }
}

export function defineCollection<E extends Record<string, AnyEntityDefinition>>(
  config: CollectionConfig<E>,
): CollectionDefinition<E> {
  assertNoDuplicateEntityNames(config.entities);
  const entityTypeAttributeName = config.entityTypeAttributeName ?? "entityType";

  return {
    entities: config.entities,
    createReader: (table) => ({
      query: (keyCondition) => {
        let builder = table.query<DynamoItem>(keyCondition);
        if (config.indexName !== undefined) builder = builder.useIndex(config.indexName as never);

        const paginate = builder.paginate.bind(builder);
        const execute = builder.execute.bind(builder);
        return Object.assign(builder, {
          paginate: (pageSize?: number) =>
            new CollectionPageIterator(
              paginate(pageSize ?? DEFAULT_PAGE_SIZE),
              config.entities,
              entityTypeAttributeName,
            ),
          execute: async () =>
            new CollectionResultIterator(await execute(), config.entities, entityTypeAttributeName),
        }) as CollectionQueryBuilder<E>;
      },
    }),
  };
}

function assertNoDuplicateEntityNames(entities: Record<string, AnyEntityDefinition>): void {
  const seen = new Set<string>();
  for (const entity of Object.values(entities)) {
    if (seen.has(entity.name)) {
      throw new Error(
        `defineCollection: duplicate entity name "${entity.name}" — entity names must be unique within a collection.`,
      );
    }
    seen.add(entity.name);
  }
}

function emptyGroupedResult<E extends Record<string, AnyEntityDefinition>>(entities: E): GroupedResult<E> {
  return Object.fromEntries(Object.keys(entities).map((key) => [key, []])) as unknown as GroupedResult<E>;
}
