# Entity Collections

Collections query a base-table partition or GSI shared by multiple entity types and group each paginator page by entity.

## Define a Collection

```ts
import { defineCollection } from "dyno-table/entity";

const locationInventory = defineCollection({
  entities: { Dinosaur: DinosaurEntity, Warehouse: WarehouseEntity },
  indexName: "GSI1",
});

const reader = locationInventory.createReader(table);
```

Entity definition names must be unique within a collection. Omit `indexName` to query the base table.

## Query Pages

`reader.query()` returns the same `QueryBuilder` as `table.query()`. Configure it with the usual methods, then call `paginate()` to get grouped pages:

```ts
const pages = reader
  .query({ pk: `LOCATION#${country}#${region}` })
  .filter((op) => op.eq("status", "ACTIVE"))
  .sortDescending()
  .paginate();

for await (const page of pages) {
  // page.Dinosaur: Dinosaur[]
  // page.Warehouse: Warehouse[]
}
```

Collection pagination defaults to 25 items per `Paginator` page, so large partitions are processed in bounded groups. Pass a different size to `paginate(n)` when needed. Calling other terminal methods such as `execute()` retains the normal, flat `QueryBuilder` behavior.

Items whose entity type is not configured in the collection are omitted. Empty pages still include every configured key with an empty array.

## Get All Results

For a small or bounded partition, `getAllPages()` exhausts the paginator and merges its pages:

```ts
const all = await reader
  .query({ pk: `LOCATION#${country}#${region}` })
  .paginate()
  .getAllPages();

// all.Dinosaur: Dinosaur[]
// all.Warehouse: Warehouse[]
```

## Custom Entity Type Attribute

Entities that use a custom discriminator need the same attribute configured on the collection:

```ts
const collection = defineCollection({
  entities: { Dinosaur: DinosaurEntity, Warehouse: WarehouseEntity },
  entityTypeAttributeName: "type",
});
```

See [Entity index configuration](entities.md#index-configuration), [overloaded indexes](key-patterns.md#overloaded-indexes), and [pagination](pagination.md).
