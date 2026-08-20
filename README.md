# dyno-table

> Stop hand-writing `pk`/`sk` strings and raw `KeyConditionExpression` syntax. Use typed query and update builders with compile-time checks on your item shapes instead.

[![npm version](https://img.shields.io/npm/v/dyno-table.svg)](https://www.npmjs.com/package/dyno-table)
[![npm downloads](https://img.shields.io/npm/dm/dyno-table.svg)](https://www.npmjs.com/package/dyno-table)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.0%2B-blue?logo=typescript)](https://www.typescriptlang.org/)

## Why dyno-table?

Without dyno-table, querying a GSI means remembering which index holds what and hand-building the expression:

```ts
await client.send(new QueryCommand({
  TableName: "dinosaurs",
  IndexName: "gsi1",
  KeyConditionExpression: "gsi1pk = :pk",
  ExpressionAttributeValues: { ":pk": `DIET#${diet}` },
}));
```

With dyno-table, that index is a named method:

```ts
await dinoRepo.query.getDinosaursByDiet({ diet: "carnivore" }).execute();
```

- `getDinosaursByDiet()` replaces the `gsi1` / `KeyConditionExpression` you'd otherwise have to look up
- Zod, ArkType, Valibot, or any Standard Schema library validates every write before it hits DynamoDB
- Item shapes, keys, and query inputs get checked at compile time instead of failing at runtime

## Quick start

```bash
npm install dyno-table @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

```ts
import { z } from "zod";
import { createIndex, createQueries, defineCollection, defineEntity } from "dyno-table/entity";

// Define your dinosaur schema
const dinosaurSchema = z.object({
  id: z.string(),
  species: z.string(),
  period: z.enum(["triassic", "jurassic", "cretaceous"]),
  diet: z.enum(["herbivore", "carnivore", "omnivore"]),
  discoveryYear: z.number(),
  weight: z.number(),
});

const createQuery = createQueries<z.infer<typeof dinosaurSchema>>();

// Create your entity with indexes for efficient queries
const DinosaurEntity = defineEntity({
  name: "Dinosaur",
  schema: dinosaurSchema,
  primaryKey: createIndex()
    .input(z.object({ id: z.string() }))
    .partitionKey(({ id }) => `DINO#${id}`)
    .sortKey(() => "PROFILE"),
  indexes: {
    byDiet: createIndex()
      .input(dinosaurSchema)
      .partitionKey(({ diet }) => `DIET#${diet}`)
      .sortKey(({ species }) => species),
  },
  queries: {
    getDinosaursByDiet: createQuery
      .input(z.object({ diet: z.enum(["herbivore", "carnivore", "omnivore"]) }))
      .query(({ input, entity }) =>
        entity.query({ pk: `DIET#${input.diet}` }).useIndex("byDiet")
      ),
  },
});

// Create the repository
const dinoRepo = DinosaurEntity.createRepository(table);

// Create a T-Rex
const tRex = await dinoRepo.create({
  id: "t-rex-1",
  species: "Tyrannosaurus Rex",
  period: "cretaceous",
  diet: "carnivore",
  discoveryYear: 1905,
  weight: 8000,
}).execute();

// Find all carnivores (query via index)
const carnivores = await dinoRepo.query
  .getDinosaursByDiet({ diet: "carnivore" })
  .execute();
```

You now have a type-safe, validated database with semantic queries.

---

## Feature overview

### Entity pattern (recommended)
Use for most application code: schema validation, generated keys, and semantic query names instead of hand-written `pk`/`sk` strings. dyno-table validates every write against your schema before it hits DynamoDB.

```ts
// Get specific dinosaur
const { item: tRex } = await dinoRepo.get({ id: "t-rex-1" }).execute();

// Semantic queries
const cretaceousDinos = await dinoRepo.query
  .getDinosaursByPeriod({ period: "cretaceous" })
  .execute();
```
**[Complete Entity Guide →](docs/entities.md)**

### Entity collections
Use when several entity types share the same GSI and you want to query it in one shot (e.g. "everything at this location"). Results come back grouped by entity type, so downstream code reads `page.Dinosaur` / `page.Warehouse` rather than one mixed array.

```ts
const pages = defineCollection({
  entities: { Dinosaur: DinosaurEntity, Warehouse: WarehouseEntity },
  indexName: "GSI1",
})
  .createReader(table)
  .query({ pk: "LOCATION#WELLINGTON" })
  .paginate();

for await (const page of pages) {
  console.log(page.Dinosaur, page.Warehouse);
}
```

`paginate()` streams grouped pages. `execute()` streams individual configured items; its `toArray()` returns one grouped result.

**[Collection Guide →](docs/collections.md)**

### Direct table operations
Use when you need raw `pk`/`sk` control or something the entity layer doesn't model. You own key construction yourself and skip schema validation.

```ts
// Direct DynamoDB access with query
const carnivoresInCretaceous = await table
  .query({ pk: "PERIOD#cretaceous" })
  .filter(op => op.eq("diet", "carnivore"))
  .execute();
```
**[Table Operations Guide →](docs/table-query-builder.md)**

### Advanced querying & filtering
Use `.filter()` for business logic DynamoDB's key conditions can't express. It's applied after the read, so it narrows what's *returned*, not what's read. It doesn't reduce RCU cost the way a tighter key condition or index would.

```ts
// Find large herbivores from Jurassic period using query + filter
const conditions = await dinoRepo.query
  .getDinosaursByDiet({ diet: "herbivore" })
  .filter(op => op.and(
    op.eq("period", "jurassic"),
    op.gt("weight", 3000)
  ))
  .execute();
```
**[Advanced Queries Guide →](docs/query-builder.md)**

### Batch operations
Use when you're reading or writing many known keys at once (up to 100 reads / 25 writes per batch). Batches don't support conditions and aren't atomic. Reach for `.transaction()` instead when operations must all succeed or all fail together.

```ts
const batch = table.batchBuilder();

// Queue reads
[{ id: "t-rex-1" }, { id: "triceratops-1" }, { id: "stegosaurus-1" }]
  .forEach(key => dinoRepo.get(key).withBatch(batch));

// Queue writes; reads and writes can share one batch
carnivores.forEach(dino => dinoRepo.create(dino).withBatch(batch));

const { reads } = await batch.execute();
const dinos = reads.itemsByType.Dinosaur;
```
**[Batch Operations Guide →](docs/batch-operations.md)**

### Transactions
Use when multiple writes must succeed or fail together (ACID). dyno-table caps transactions at 25 operations. For bulk work that doesn't need atomicity, batch operations are cheaper.

```ts
// Atomic dinosaur discovery
await table.transaction(async (tx) => {
  dinoRepo.create(newDinosaur).withTransaction(tx);
  researchRepo.update({ id: "paleontologist-1" }, {})
    .add("discoveriesCount", 1)
    .withTransaction(tx);
});
```
**[Transactions Guide →](docs/transactions.md)**

### Pagination & memory management
Stream (`for await`) when you just need to process results one at a time and want flat memory usage. Use `.paginate(pageSize)` when you control page boundaries yourself, e.g. returning one page per API response. Only call `.toArray()` when you already know the result set is small.

```ts
// Stream large datasets (memory efficient)
const allCarnivores = await dinoRepo.query
  .getDinosaursByDiet({ diet: "carnivore" })
  .execute();
for await (const dino of allCarnivores) {
  await processDiscovery(dino); // Process one at a time
}

// Paginated results
const paginator = dinoRepo.query
  .getDinosaursByDiet({ diet: "herbivore" })
  .paginate(50);
while (paginator.hasNextPage()) {
  const page = await paginator.getNextPage();
  console.log(`Processing ${page.items.length} herbivores...`);
}
```
**[Pagination Guide →](docs/pagination.md)**

### Schema validation
Use whichever validation library your project already has. dyno-table works with anything implementing the Standard Schema interface, not just Zod.

```ts
// Zod (included)
const dinoSchema = z.object({
  species: z.string().min(3),
  weight: z.number().positive(),
});

// ArkType
const dinoSchema = type({
  species: "string>2",
  weight: "number>0",
});

// Valibot
const dinoSchema = v.object({
  species: v.pipe(v.string(), v.minLength(3)),
  weight: v.pipe(v.number(), v.minValue(1)),
});
```
**[Standard Schema Support →](docs/entities.md#standard-schema-support)**

### Migrations
Use for backfills or data-movement scripts that run against a live table. Every run is a dry run until you pass `{ apply: true }`, and an applied run resumes from its last completed page instead of restarting.

```ts
import { MigrationManager } from "dyno-table/migration";

const manager = new MigrationManager({
  repos: { orders: orderRepo },
  migrationRepo: migrationCheckpointRepo,
});

manager.createMigration("backfill-order-totals", async ({ repos, cursor }) => {
  for await (const order of cursor(repos.orders.scan(), { pageSize: 100 })) {
    await repos.orders.update({ id: order.id }, { total: computeTotal(order) }).execute();
  }
});

// Dry run by default, no writes happen until you opt in
await manager.run("backfill-order-totals");
await manager.run("backfill-order-totals", { apply: true });

// Run all pending migrations
await manager.runAll({ apply: true })
```
Choose a page size that bounds how much work an interrupted page may repeat.

**[Migrations Guide →](docs/migration.md)**

### Performance optimization
Reach for an index whenever you know the access pattern in advance. It's always cheaper than a scan. Reach for `.segments(n)` only when `.query()` isn't an option (no known partition key) and a sequential scan is the actual bottleneck. It parallelizes the scan across a table, but each segment issues its own concurrent request, so a high segment count can throttle a provisioned table.

```ts
// Use indexes for fast lookups
const jurassicCarnivores = await dinoRepo.query
  .getDinosaursByPeriodAndDiet({
    period: "jurassic",
    diet: "carnivore"
  })
  .useIndex("period-diet-index")
  .execute();

// Split a full-table scan across parallel segments
const allDinos = await table.scan().segments(4).toArray();
```
**[Table Operations Guide →](docs/table-query-builder.md)**

---

## Documentation

### Getting started
- **[Quick Start Tutorial →](docs/quick-start.md)** - Install, define an entity, run your first query
- **[Installation Guide →](docs/installation.md)** - Setup and configuration
- **[Your First Entity →](docs/first-entity.md)** - Define fields, keys, and indexes step by step

### Core concepts
- **[Entity vs Table →](docs/entity-vs-table.md)** - When to use the entity layer vs. raw table operations
- **[Key Design Patterns →](docs/key-patterns.md)** - Partition and sort keys, single-table design

### Features
- **[Query Building →](docs/query-builder.md)** - Complex queries and filtering
- **[Standard Schema Support →](docs/entities.md#standard-schema-support)** - Zod, ArkType, Valibot validation
- **[Transactions →](docs/transactions.md)** - ACID operations
- **[Batch Operations →](docs/batch-operations.md)** - Read or write up to 100/25 items per call
- **[Pagination →](docs/pagination.md)** - Streaming, page-based, and cursor-based result handling
- **[Entity Collections →](docs/collections.md)** - Group shared-index query pages by entity type
- **[Table Operations →](docs/table-query-builder.md)** - Direct table access, scans, parallel scan segments

### Advanced topics
- **[Error Handling →](docs/error-handling.md)** - Error classes, type guards, and AWS error unwrapping
- **[Migrations →](docs/migration.md)** - Backfill scripts with dry-run safety and resumability

### Examples
- **[Entity Example App →](examples/entity-example)** - Full runnable project with entities and repositories
- **[Entity Collections →](examples/collection-example.ts)** - Grouping shared-index query results by entity type
- **[Single-Table GSI Design →](examples/gsi-example.ts)** - Multiple entity types on shared indexes
- **[Multiple GSIs →](examples/multi-example.ts)** - Working with more than one global secondary index

---

## Links

- **[Documentation](docs/)** - Complete guides and references
- **[Issues](https://github.com/Kysumi/dyno-table/issues)** - Report bugs or request features
- **[Discussions](https://github.com/Kysumi/dyno-table/discussions)** - Ask questions and share ideas
- **[NPM](https://www.npmjs.com/package/dyno-table)** - Package information
