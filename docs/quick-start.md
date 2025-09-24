# Quick Start Guide

Get up and running with dyno-table quickly using a practical example database.

## What We'll Build

A type-safe dinosaur database that can:
- Store dinosaur information with validation
- Query dinosaurs by diet efficiently
- Handle relationships between paleontologists and discoveries

## Step 1: Installation

```bash
npm install dyno-table @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb zod
```

## Step 2: Setup DynamoDB Client

```ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Table } from "dyno-table/table";

const client = new DynamoDBClient({
  region: "us-west-2",
  // For local development:
  // endpoint: "http://localhost:8000"
});

const docClient = DynamoDBDocument.from(client);

const table = new Table({
  client: docClient,
  tableName: "DinosaurDiscoveries",
  indexes: {
    partitionKey: "pk",
    sortKey: "sk",
    gsis: {
      "diet-index": {
        partitionKey: "dietPK",
        sortKey: "species",
      },
    },
  },
});
```

## Step 3: Define Your First Entity

```ts
import { z } from "zod";
import { defineEntity, createIndex, createQueries } from "dyno-table/entity";

// Schema with validation
const dinosaurSchema = z.object({
  id: z.string(),
  species: z.string().min(3),
  period: z.enum(["triassic", "jurassic", "cretaceous"]),
  diet: z.enum(["herbivore", "carnivore", "omnivore"]),
  discoveryYear: z.number().min(1800).max(2024),
  weight: z.number().positive(),
  length: z.number().positive(),
  discoveredBy: z.string(),
  fossilLocation: z.string(),
});

type Dinosaur = z.infer<typeof dinosaurSchema>;

const createQuery = createQueries<Dinosaur>();

// Create entity with indexes
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

    getDiscoveriesAfterYear: createQuery
      .input(z.object({ year: z.number() }))
      .query(({ input, entity }) =>
        entity.query
          .getDinosaursByDiet({ diet: "carnivore" })
          .filter(op => op.gte("discoveryYear", input.year))
      ),
  },
});

const dinoRepo = DinosaurEntity.createRepository(table);
```

## Step 4: Start Using Your Database

### Create Some Dinosaurs

```ts
// Create a fearsome T-Rex
const tRex = await dinoRepo.create({
  id: "t-rex-001",
  species: "Tyrannosaurus Rex",
  period: "cretaceous",
  diet: "carnivore",
  discoveryYear: 1905,
  weight: 8000,
  length: 12.3,
  discoveredBy: "Barnum Brown",
  fossilLocation: "Montana, USA",
}).execute();

// Create a gentle giant
const brontosaurus = await dinoRepo.create({
  id: "bronto-001",
  species: "Brontosaurus",
  period: "jurassic",
  diet: "herbivore",
  discoveryYear: 1879,
  weight: 22000,
  length: 22,
  discoveredBy: "Othniel Charles Marsh",
  fossilLocation: "Wyoming, USA",
}).execute();

// Create an armored defender
const triceratops = await dinoRepo.create({
  id: "trike-001",
  species: "Triceratops",
  period: "cretaceous",
  diet: "herbivore",
  discoveryYear: 1889,
  weight: 12000,
  length: 9,
  discoveredBy: "Othniel Charles Marsh",
  fossilLocation: "Colorado, USA",
}).execute();
```

### Query Your Data

```ts
// Get a specific dinosaur
const myTRex = await dinoRepo.get({ id: "t-rex-001" });
console.log(`Found ${myTRex.species} weighing ${myTRex.weight}kg!`);

// Find all carnivores (efficient query!)
const carnivores = await dinoRepo.query
  .getDinosaursByDiet({ diet: "carnivore" })
  .execute();

console.log("Carnivorous dinosaurs:");
for await (const dino of carnivores) {
  console.log(`- ${dino.species} (${dino.period} period)`);
}

// Find recent discoveries
const modernDiscoveries = await dinoRepo.query
  .getDiscoveriesAfterYear({ year: 1950 })
  .execute();

// Get multiple dinosaurs at once
const myCollection = await dinoRepo.batchGet([
  { id: "t-rex-001" },
  { id: "bronto-001" },
  { id: "trike-001" }
]).execute();
```

### Update and Delete

```ts
// Update a dinosaur's information
await dinoRepo.update(
  { id: "t-rex-001" },
  {
    weight: 8500, // New research shows it was heavier!
    fossilLocation: "Montana, USA (Hell Creek Formation)"
  }
).execute();

// Conditionally update (only if still a carnivore)
await dinoRepo.update(
  { id: "t-rex-001" },
  { discoveredBy: "Barnum Brown (American Museum)" }
)
.condition(op => op.eq("diet", "carnivore"))
.execute();

// Delete a dinosaur (maybe it was reclassified)
await dinoRepo.delete({ id: "old-classification-001" })
  .condition(op => op.attributeExists("reclassified"))
  .execute();
```

## You're All Set!

You've now created a fully functional, type-safe database with:

- ✅ **Schema validation** - Invalid data gets caught automatically
- ✅ **Efficient queries** - Using proper DynamoDB indexes
- ✅ **Type safety** - TypeScript catches errors at compile time
- ✅ **Semantic methods** - `getDinosaursByDiet()` instead of cryptic queries
- ✅ **Batch operations** - Get multiple items efficiently
- ✅ **Conditional updates** - Safe data modifications

## What's Next?

Ready to learn more? Check out these guides:

- **[Entity Pattern Guide →](entities.md)** - Master the entity approach
- **[Advanced Queries →](query-builder.md)** - Complex filtering and joins
- **[Performance Tips →](performance.md)** - Scale your dinosaur database
- **[Schema Validation →](schema-validation.md)** - Advanced validation patterns
- **[Error Handling →](error-handling.md)** - Robust error management

## Troubleshooting

### Common Issues

**"Table doesn't exist" error?**
Make sure your DynamoDB table is created with the correct indexes:
```ts
// Your table needs these indexes in DynamoDB:
// Primary: pk (partition), sk (sort)
// GSI: diet-index with dietPK (partition), species (sort)
```

**Schema validation errors?**
Check that your data matches the schema:
```ts
// ❌ This will fail
const badDino = {
  id: "rex",
  species: "T", // Too short (min 3 chars)
  weight: -100,  // Must be positive
  period: "future" // Invalid enum value
};

// ✅ This will work
const goodDino = {
  id: "rex-001",
  species: "Tyrannosaurus Rex",
  weight: 8000,
  period: "cretaceous"
};
```

**Need help?** Check out our [Error Handling Guide →](error-handling.md)

---

*Ready to build robust, type-safe DynamoDB applications? Start exploring the advanced features!*
