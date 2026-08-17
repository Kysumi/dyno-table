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
import { z } from "zod";
import { defineEntity, createIndex, createQueries } from "dyno-table/entity";
import { dinosaurSchema, type Dinosaur } from "../schemas/dinosaur.js";

const createQuery = createQueries<Dinosaur>();

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
        entity.query({ pk: `EXP#${input.expeditionId}` }).useIndex("byExpedition")
      ),

    // Find dinosaurs by species
    getBySpecies: createQuery
      .input(z.object({ species: z.string() }))
      .query(({ input, entity }) =>
        entity.query({ pk: `SPECIES#${input.species}` }).useIndex("bySpecies")
      ),

    // Get large carnivores from a specific period
    getLargeCarnivores: createQuery
      .input(z.object({
        period: z.enum(["triassic", "jurassic", "cretaceous"]),
        minWeight: z.number().default(1000)
      }))
      .query(({ input, entity }) =>
        entity.query({ pk: "DIET#carnivore" })
          .useIndex("byDietPeriod")
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
        entity.query({ pk: `LOC#${input.country}` }).useIndex("byLocation")
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
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Table } from "dyno-table/table";
import { DinosaurEntity } from "./entities/dinosaur.js";

// Configure DynamoDB client
const client = new DynamoDBClient({
  region: "us-east-1", // or your preferred region
  // For local development:
  // endpoint: "http://localhost:8000"
});

const docClient = DynamoDBDocument.from(client);

// Create table instance
const table = new Table({
  client: docClient,
  tableName: "dinosaur-research",
  indexes: {
    partitionKey: "pk",
    sortKey: "sk",
    // GSI names must match the entity's own index names exactly (byExpedition,
    // bySpecies, ...) — dyno-table looks up the physical GSI by that name when
    // generating and querying index attributes.
    gsis: {
      byExpedition: {
        partitionKey: "gsi1pk",
        sortKey: "gsi1sk"
      },
      bySpecies: {
        partitionKey: "gsi2pk",
        sortKey: "gsi2sk"
      },
      byDietPeriod: {
        partitionKey: "gsi3pk",
        sortKey: "gsi3sk"
      },
      byLocation: {
        partitionKey: "gsi4pk",
        sortKey: "gsi4sk"
      }
    }
  }
});

// Create repository
export const dinosaurRepo = DinosaurEntity.createRepository(table);
```

## Next Steps

Now that you have your first entity working, explore these advanced topics:

- **[Standard Schema Support](./entities.md#standard-schema-support)** - Deep dive into validation patterns
- **[Key Design Patterns](./key-patterns.md)** - Advanced multi-entity key patterns
- **[Table Operations](./table-query-builder.md)** - Indexes, scans, and parallel scan segments
- **[Transactions](./transactions.md)** - ACID operations across entities
