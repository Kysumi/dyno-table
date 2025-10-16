# Your First Entity

Create your first dyno-table entity step-by-step! We'll build a complete data management system that showcases the power of the entity pattern with schema validation, indexes, and semantic queries.

## What You'll Build

By the end of this tutorial, you'll have:
- A fully typed Dinosaur entity with Zod validation
- Multiple indexes for efficient querying
- Semantic query methods for business logic

## Step 1: Install Dependencies

```bash
npm install dyno-table zod
# or
pnpm add dyno-table zod
# or
yarn add dyno-table zod
```

## Step 2: Define Your Schema

Start with a comprehensive schema for your data:

```typescript
// schemas/dinosaur.ts
import { z } from "zod";

export const dinosaurSchema = z.object({
  // Core identification
  id: z.string().uuid(),
  species: z.string().min(2).max(100),
  commonName: z.string().max(100).optional(),

  // Classification
  diet: z.enum(["herbivore", "carnivore", "omnivore"]),
  period: z.enum(["triassic", "jurassic", "cretaceous"]),
  family: z.string(),

  // Physical characteristics
  estimatedWeight: z.number().positive().max(100000), // kg
  estimatedLength: z.number().positive().max(50), // meters

  // Discovery information
  discoveredAt: z.date(),
  discoveredBy: z.string(),
  expeditionId: z.string(),
  location: z.object({
    country: z.string(),
    region: z.string(),
    coordinates: z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180)
    }).optional()
  }),

  // Research data
  status: z.enum(["discovered", "cataloged", "researched", "published"]),
  confidence: z.enum(["low", "medium", "high"]),
  notes: z.string().max(2000).default(""),
  tags: z.array(z.string()).default([]),

  // Metadata
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date())
});

export type Dinosaur = z.infer<typeof dinosaurSchema>;
```

## Step 3: Create Your Entity

Define your entity with indexes and queries:

```typescript
// entities/dinosaur.ts
import { defineEntity, createIndex, createQuery } from "dyno-table/entity";
import { dinosaurSchema, type Dinosaur } from "../schemas/dinosaur.js";

export const DinosaurEntity = defineEntity({
  name: "Dinosaur",
  schema: dinosaurSchema,

  // Primary key: Individual dinosaur lookup
  primaryKey: createIndex()
    .input(z.object({ id: z.string() }))
    .partitionKey(({ id }) => `DINO#${id}`)
    .sortKey(() => "PROFILE"),

  // Secondary indexes for different access patterns
  indexes: {
    // Query dinosaurs by expedition
    byExpedition: createIndex()
      .input(dinosaurSchema)
      .partitionKey(({ expeditionId }) => `EXP#${expeditionId}`)
      .sortKey(({ discoveredAt }) => discoveredAt.toISOString()),

    // Query dinosaurs by species
    bySpecies: createIndex()
      .input(dinosaurSchema)
      .partitionKey(({ species }) => `SPECIES#${species}`)
      .sortKey(({ discoveredAt }) => discoveredAt.toISOString()),

    // Query dinosaurs by diet and period
    byDietPeriod: createIndex()
      .input(dinosaurSchema)
      .partitionKey(({ diet }) => `DIET#${diet}`)
      .sortKey(({ period, species }) => `${period}#${species}`),

    // Query dinosaurs by location
    byLocation: createIndex()
      .input(dinosaurSchema)
      .partitionKey(({ location }) => `LOC#${location.country}`)
      .sortKey(({ location, species }) => `${location.region}#${species}`)
  },

  // Semantic query methods for business logic
  queries: {
    // Get all dinosaurs from an expedition
    getExpeditionDinosaurs: createQuery
      .input(z.object({ expeditionId: z.string() }))
      .query(({ input, entity }) =>
        entity.query({ expeditionId: input.expeditionId }).useIndex("gsi1")
      ),

    // Find dinosaurs by species
    getBySpecies: createQuery
      .input(z.object({ species: z.string() }))
      .query(({ input, entity }) =>
        entity.query({ species: input.species }).useIndex("gsi2")
      ),

    // Get large carnivores from a specific period
    getLargeCarnivores: createQuery
      .input(z.object({
        period: z.enum(["triassic", "jurassic", "cretaceous"]),
        minWeight: z.number().default(1000)
      }))
      .query(({ input, entity }) =>
        entity.query({ diet: "carnivore" })
          .useIndex("gsi3")
          .filter(op =>
            op.and(
              op.eq("period", input.period),
              op.gte("estimatedWeight", input.minWeight)
            )
          )
      ),

    // Find dinosaurs discovered in a specific country
    getByCountry: createQuery
      .input(z.object({ country: z.string() }))
      .query(({ input, entity }) =>
        entity.query({ location: { country: input.country } })
          .useIndex("gsi4")
      ),

    // Get recent discoveries (last 30 days)
    getRecentDiscoveries: createQuery
      .input(z.object({}))
      .query(({ entity }) => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        return entity.scan()
          .filter(op => op.gte("discoveredAt", thirtyDaysAgo));
      })
  }
});
```

## Step 4: Initialize Your Setup

Create your table and repository:

```typescript
// index.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { Table } from "dyno-table/table";
import { DinosaurRepository } from "./repositories/dinosaur-repository.js";

// Configure DynamoDB client
const client = new DynamoDBClient({
  region: "us-east-1", // or your preferred region
  // For local development:
  // endpoint: "http://localhost:8000"
});

// Create table instance
const table = new Table({
  client,
  tableName: "dinosaur-research",
  partitionKey: "pk",
  sortKey: "sk",
  /**
   * The indexes are intentionally numbered to allow each model
   * have its own representation of what that index represents.
   *
   * The queries attribute on the entity is to allow use to hide this complexity from the user.
   */
  indexes: {
    gsi1: {
      partitionKey: "gsi1pk",
      sortKey: "gsi1sk"
    },
    gsi2: {
      partitionKey: "gsi2pk",
      sortKey: "gsi2sk"
    },
    gsi3: {
      partitionKey: "gsi3pk",
      sortKey: "gsi3sk"
    },
    gsi4: {
      partitionKey: "gsi4pk",
      sortKey: "gsi4sk"
    }
  }
});

// Create repository
export const dinosaurRepo = new DinosaurRepository(table);
```

## Next Steps

Now that you have your first entity working, explore these advanced topics:

- **[Schema Validation](./schema-validation.md)** - Deep dive into validation patterns
- **[Single Table Design](./single-table.md)** - Advanced multi-entity patterns
- **[Performance](./performance.md)** - Optimize your queries and indexes
- **[Testing](./testing.md)** - Test your entities effectively
- **[Transactions](./transactions.md)** - ACID operations across entities
