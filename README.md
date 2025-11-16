# dyno-table

> A powerful, type-safe DynamoDB library for TypeScript that simplifies working with DynamoDB through intuitive APIs and comprehensive type safety.

[![npm version](https://img.shields.io/npm/v/dyno-table.svg)](https://www.npmjs.com/package/dyno-table)
[![npm downloads](https://img.shields.io/npm/dm/dyno-table.svg)](https://www.npmjs.com/package/dyno-table)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.0%2B-blue?logo=typescript)](https://www.typescriptlang.org/)

## Why dyno-table?

- **Type Safety First** - Full TypeScript support with compile-time error checking
- **Schema Validation** - Built-in support for Zod, ArkType, Valibot, and other validation libraries
- **Semantic Queries** - Write meaningful method names like `getDinosaurBySpecies()` instead of cryptic `gsi1` references
- **Single-Table Design** - Optimized for modern DynamoDB best practices
- **Repository Pattern** - Clean, maintainable code architecture

## Quick Start

```bash
npm install dyno-table @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

```ts
import { z } from "zod";
import { defineEntity, createIndex, createQueries } from "dyno-table/entity";

const createQuery = createQueries<typeof dinosaurSchema._type>();

// 🦕 Define your dinosaur schema
const dinosaurSchema = z.object({
  id: z.string(),
  species: z.string(),
  period: z.enum(["triassic", "jurassic", "cretaceous"]),
  diet: z.enum(["herbivore", "carnivore", "omnivore"]),
  discoveryYear: z.number(),
  weight: z.number(),
});

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

// Start using it!
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

// Find all carnivores (efficient query using index!)
const carnivores = await dinoRepo.query
  .getDinosaursByDiet({ diet: "carnivore" })
  .execute();
```

**That's it!** You now have a fully type-safe, validated database with semantic queries.

---

## Feature Overview

### Entity Pattern (Recommended)
*Schema-validated, semantic queries with business logic*

```ts
// Get specific dinosaur
const tRex = await dinoRepo.get({ id: "t-rex-1" });

// Semantic queries
const cretaceousDinos = await dinoRepo.query
  .getDinosaursByPeriod({ period: "cretaceous" })
  .execute();
```
**[Complete Entity Guide →](docs/entities.md)**

### Direct Table Operations
*Low-level control for advanced use cases*

```ts
// Direct DynamoDB access with query
const carnivoresInCretaceous = await table
  .query({ pk: "PERIOD#cretaceous" })
  .filter(op => op.eq("diet", "carnivore"))
  .execute();
```
**[Table Operations Guide →](docs/table-query-builder.md)**

### Advanced Querying & Filtering
*Complex business logic with AND/OR operations*

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

### Batch Operations
*Efficient bulk operations*

```ts
// Get multiple dinosaurs at once
const dinos = await dinoRepo.batchGet([
  { id: "t-rex-1" },
  { id: "triceratops-1" },
  { id: "stegosaurus-1" }
]).execute();

// Bulk create carnivores
const batch = table.batchBuilder();

carnivores.forEach(dino =>
  dinoRepo.create(dino).withBatch(batch)
);

await batch.execute();
```
**[Batch Operations Guide →](docs/batch-operations.md)**

### Transactions
*ACID transactions for data consistency*

```ts
// Atomic dinosaur discovery
await table.transaction(tx => [
  dinoRepo.create(newDinosaur).withTransaction(tx),
  researchRepo.update(
    { id: "paleontologist-1" },
    { discoveriesCount: val => val.add(1) }
  ).withTransaction(tx),
]);
```
**[Transactions Guide →](docs/transactions.md)**

### Pagination & Memory Management
*Handle large datasets efficiently*

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

### Schema Validation
*Works with any Standard Schema library*

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
**[Schema Validation Guide →](docs/schema-validation.md)**

### Performance Optimization
*Built for scale*

```ts
// Use indexes for fast lookups
const jurassicCarnivores = await dinoRepo.query
  .getDinosaursByPeriodAndDiet({
    period: "jurassic",
    diet: "carnivore"
  })
  .useIndex("period-diet-index")
  .execute();

// Efficient filtering with batchGet for known species
const largeDinos = await dinoRepo.batchGet([
  { id: "t-rex-1" },
  { id: "triceratops-1" },
  { id: "brontosaurus-1" }
]).execute();
```
**[Performance Guide →](docs/performance.md)**

---

## Documentation

### Getting Started
- **[Quick Start Tutorial →](docs/quick-start.md)** - Get up and running quickly
- **[Installation Guide →](docs/installation.md)** - Setup and configuration
- **[Your First Entity →](docs/first-entity.md)** - Create your first entity

### Core Concepts
- **[Entity vs Table →](docs/entity-vs-table.md)** - Choose your approach
- **[Single Table Design →](docs/single-table.md)** - DynamoDB best practices
- **[Key Design Patterns →](docs/key-patterns.md)** - Partition and sort keys

### Features
- **[Query Building →](docs/query-builder.md)** - Complex queries and filtering
- **[Schema Validation →](docs/schema-validation.md)** - Type safety and validation
- **[Transactions →](docs/transactions.md)** - ACID operations
- **[Batch Operations →](docs/batch-operations.md)** - Bulk operations
- **[Pagination →](docs/pagination.md)** - Handle large datasets
- **[Type Safety →](docs/type-safety.md)** - TypeScript integration

### Advanced Topics
- **[Performance →](docs/performance.md)** - Optimization strategies
- **[Error Handling →](docs/error-handling.md)** - Robust error management
- **[Migration →](docs/migration.md)** - Evolving your schema

### Examples
- **[E-commerce Store →](examples/ecommerce)** - Product catalog and orders
- **[User Management →](examples/users)** - Authentication and profiles
- **[Content Management →](examples/cms)** - Blog posts and comments
- **[Analytics →](examples/analytics)** - Event tracking and reporting

---

## Links

- **[Documentation](docs/)** - Complete guides and references
- **[Issues](https://github.com/Kysumi/dyno-table/issues)** - Report bugs or request features
- **[Discussions](https://github.com/Kysumi/dyno-table/discussions)** - Ask questions and share ideas
- **[NPM](https://www.npmjs.com/package/dyno-table)** - Package information
