import type { Paginator } from "../builders/paginator.js";
import type { QueryBuilder } from "../builders/query-builder.js";
import type { ResultIterator } from "../builders/result-iterator.js";
import type { Path } from "../builders/types.js";
import type {
  VectorCapacity,
  VectorConditionOperator,
  VectorSearchBuilder,
} from "../builders/vector-search-builder.js";
import type { PrimaryKey } from "../conditions.js";
import type { Table } from "../table.js";
import type { DynamoItem, TableConfig, VectorIndexNames } from "../types.js";
import { ConfigurationErrors } from "../utils/error-factory.js";
import type { EntityDefinition, EntityVectorSearchInput } from "./entity.js";

const DEFAULT_PAGE_SIZE = 25;

// biome-ignore lint/suspicious/noExplicitAny: entity maps are heterogeneous by design
type AnyEntityDefinition = EntityDefinition<any, any, any, any, any>;
// biome-ignore lint/suspicious/noExplicitAny: only the inferred output type is relevant
type InferEntityItem<E> = E extends EntityDefinition<infer T, any, any, any, any> ? T : never;
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

export interface CollectionConfig<
  E extends Record<string, AnyEntityDefinition>,
  TEntityTypeAttribute extends string = "entityType",
> {
  entities: E;
  /** GSI name if the collection lives on a secondary index; omit for the base table. */
  indexName?: string;
  entityTypeAttributeName?: TEntityTypeAttribute;
}

export interface CollectionDefinition<
  E extends Record<string, AnyEntityDefinition>,
  TEntityTypeAttribute extends string = "entityType",
> {
  entities: E;
  createReader: <TConfig extends TableConfig>(
    table: Table<TConfig>,
  ) => CollectionReader<E, TConfig, TEntityTypeAttribute>;
}

export interface CollectionReader<
  E extends Record<string, AnyEntityDefinition>,
  TConfig extends TableConfig = TableConfig,
  TEntityTypeAttribute extends string = "entityType",
> {
  query: (keyCondition: PrimaryKey) => CollectionQueryBuilder<E>;
  searchVectors: <TIndexName extends VectorIndexNames<TConfig>>(
    indexName: TIndexName,
    input: EntityVectorSearchInput<TConfig, TIndexName, TEntityTypeAttribute>,
  ) => CollectionVectorSearchBuilder<E, TConfig, TIndexName, TEntityTypeAttribute>;
}

export type CollectionVectorSearchMatch<E extends Record<string, AnyEntityDefinition>> = {
  [K in keyof E]: { entity: K; item: InferEntityItem<E[K]>; score: number };
}[keyof E];

export interface CollectionVectorSearchResult<E extends Record<string, AnyEntityDefinition>> {
  matches: CollectionVectorSearchMatch<E>[];
  consumedCapacity?: VectorCapacity;
  requestCount: number;
}

export class CollectionVectorSearchBuilder<
  E extends Record<string, AnyEntityDefinition>,
  TConfig extends TableConfig,
  TIndexName extends VectorIndexNames<TConfig>,
  TEntityTypeAttribute extends string,
> {
  private readonly members: Array<{ entity: keyof E; builder: VectorSearchBuilder<DynamoItem, TConfig, TIndexName> }>;

  constructor(
    private readonly table: Table<TConfig>,
    private readonly indexName: TIndexName,
    private readonly input: EntityVectorSearchInput<TConfig, TIndexName, TEntityTypeAttribute>,
    private readonly entities: E,
    private readonly entityTypeAttributeName: TEntityTypeAttribute,
    members?: Array<{ entity: keyof E; builder: VectorSearchBuilder<DynamoItem, TConfig, TIndexName> }>,
  ) {
    this.members =
      members ??
      Object.entries(entities).map(([entity, definition]) => ({
        entity,
        builder: definition.createRepository(table).searchVectors(indexName, input) as VectorSearchBuilder<
          DynamoItem,
          TConfig,
          TIndexName
        >,
      }));
  }

  filter(
    callback: (operator: VectorConditionOperator<CollectionItem<E>, string>) => import("../conditions.js").Condition,
  ): this {
    for (const { builder } of this.members) builder.filter(callback as never);
    return this;
  }

  select<K extends Path<CollectionItem<E>>>(fields: K | readonly K[]): this {
    for (const { builder } of this.members) builder.select(fields as never);
    return this;
  }

  includeIndexes(): this {
    for (const { builder } of this.members) builder.includeIndexes();
    return this;
  }

  returnConsumedCapacity(value: "NONE" | "TOTAL" | "INDEXES"): this {
    for (const { builder } of this.members) builder.returnConsumedCapacity(value);
    return this;
  }

  clone(): CollectionVectorSearchBuilder<E, TConfig, TIndexName, TEntityTypeAttribute> {
    return new CollectionVectorSearchBuilder(
      this.table,
      this.indexName,
      this.input,
      this.entities,
      this.entityTypeAttributeName,
      this.members.map(({ entity, builder }) => ({ entity, builder: builder.clone() })),
    );
  }

  debug() {
    return this.members.map(({ entity, builder }) => ({ entity, ...builder.debug() }));
  }

  async execute(): Promise<CollectionVectorSearchResult<E>> {
    const results = await Promise.all(this.members.map(({ builder }) => builder.execute()));
    const ranked = results.flatMap((result, memberIndex) =>
      result.matches.map((match, matchIndex) => ({
        entity: this.members[memberIndex]?.entity as keyof E,
        ...match,
        order: memberIndex * 100 + matchIndex,
      })),
    );
    const descending = this.table.vectorIndexes[String(this.indexName)]?.distanceFunction === "DOT_PRODUCT";
    ranked.sort(
      (left, right) => (descending ? right.score - left.score : left.score - right.score) || left.order - right.order,
    );

    let consumedCapacity: VectorCapacity | undefined;
    for (const result of results) {
      if (!result.consumedCapacity) continue;
      consumedCapacity ??= {};
      const searchBytes = result.consumedCapacity.VectorSearchRequestBytes;
      const writeBytes = result.consumedCapacity.VectorWriteRequestBytes;
      if (searchBytes !== undefined) {
        consumedCapacity.VectorSearchRequestBytes = (consumedCapacity.VectorSearchRequestBytes ?? 0) + searchBytes;
      }
      if (writeBytes !== undefined) {
        consumedCapacity.VectorWriteRequestBytes = (consumedCapacity.VectorWriteRequestBytes ?? 0) + writeBytes;
      }
    }

    return {
      matches: ranked
        .slice(0, this.input.topK)
        .map(({ order: _order, ...match }) => match) as CollectionVectorSearchMatch<E>[],
      consumedCapacity,
      requestCount: this.members.length,
    };
  }
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

export function defineCollection<
  E extends Record<string, AnyEntityDefinition>,
  const TEntityTypeAttribute extends string = "entityType",
>(config: CollectionConfig<E, TEntityTypeAttribute>): CollectionDefinition<E, TEntityTypeAttribute> {
  assertNoDuplicateEntityNames(config.entities);
  const entityTypeAttributeName = (config.entityTypeAttributeName ?? "entityType") as TEntityTypeAttribute;
  const conflicts = Object.values(config.entities)
    .filter(
      (entity) =>
        entity.entityTypeAttributeName !== undefined && entity.entityTypeAttributeName !== entityTypeAttributeName,
    )
    .map((entity) => entity.name);
  if (conflicts.length > 0) throw ConfigurationErrors.collectionEntityTypeMismatch(entityTypeAttributeName, conflicts);

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
          execute: async () => new CollectionResultIterator(await execute(), config.entities, entityTypeAttributeName),
        }) as CollectionQueryBuilder<E>;
      },
      searchVectors: (indexName, input) =>
        new CollectionVectorSearchBuilder(table, indexName, input, config.entities, entityTypeAttributeName),
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
