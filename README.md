<div align="center">

# 🦖 dyno-table

### **Tame Your DynamoDB Data with Type-Safe Precision**

[![npm version](https://img.shields.io/npm/v/dyno-table.svg?style=for-the-badge)](https://www.npmjs.com/package/dyno-table) 
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.0%2B-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![AWS DynamoDB](https://img.shields.io/badge/AWS-DynamoDB-orange?style=for-the-badge&logo=amazon-aws)](https://aws.amazon.com/dynamodb/)

</div>

<p align="center"><strong>A powerful, type-safe abstraction layer for DynamoDB single-table designs</strong><br/>
<em>Write cleaner, safer, and more maintainable DynamoDB code</em></p>

<img src="docs/images/geoff-the-dyno.png" width="400" height="250" alt="Geoff the Dyno" style="float: right; margin-left: 20px; margin-bottom: 20px;">

## 🔥 Why Developers Choose dyno-table

```ts
// Type-safe dinosaur tracking operations made simple
await dinoTable
  .update<Dinosaur>({
    pk: 'SPECIES#trex',
    sk: 'PROFILE#001'
  })
  .set('diet', 'Carnivore')      // Update dietary classification
  .add('sightings', 1)           // Increment sighting counter
  .condition(op => op.eq('status', 'ACTIVE'))  // Only if dinosaur is active
  .execute();
```

## 🌟 Why dyno-table Stands Out From The Pack

<table>
<tr>
  <td width="50%">
    <h3>🦕 Dinosaur-sized data made manageable</h3>
    <p>Clean abstraction layer that simplifies complex DynamoDB patterns and makes single-table design approachable</p>
  </td>
  <td width="50%">
    <h3>🛡️ Extinction-proof type safety</h3>
    <p>Full TypeScript support with strict type checking that catches errors at compile time, not runtime</p>
  </td>
</tr>
<tr>
  <td>
    <h3>⚡ Velociraptor-fast API</h3>
    <p>Intuitive chainable builder pattern for complex operations that feels natural and reduces boilerplate</p>
  </td>
</tr>
<tr>
  <td width="50%">
    <h3>📈 Jurassic-scale performance</h3>
    <p>Automatic batch chunking and pagination handling that scales with your data without extra code</p>
  </td>
  <td width="50%">
    <h3>🧩 Flexible schema validation</h3>
    <p>Works with your favorite validation libraries including Zod, ArkType, and Valibot</p>
  </td>
</tr>
</table>

## 📑 Table of Contents

- [📦 Installation](#-installation)
- [🚀 Quick Start](#-quick-start)
  - [1. Configure Your Jurassic Table](#1-configure-your-jurassic-table)
  - [2. Perform Type-Safe Dinosaur Operations](#2-perform-type-safe-dinosaur-operations)
- [🏗️ Entity Pattern](#-entity-pattern-with-standard-schema-validators)
  - [Defining Entities](#defining-entities)
  - [Entity Features](#entity-features)
    - [1. Schema Validation](#1-schema-validation)
    - [2. CRUD Operations](#2-crud-operations)
    - [3. Custom Queries](#3-custom-queries)
    - [4. Defining GSI Access Patterns](#4-defining-gsi-access-patterns)
    - [5. Lifecycle Hooks](#5-lifecycle-hooks)
  - [Complete Entity Example](#complete-entity-example)
- [🧩 Advanced Features](#-advanced-features)
  - [Transactional Operations](#transactional-operations)
  - [Batch Processing](#batch-processing)
  - [Pagination Made Simple](#pagination-made-simple)
- [🛡️ Type-Safe Query Building](#️-type-safe-query-building)
  - [Comparison Operators](#comparison-operators)
  - [Logical Operators](#logical-operators)
  - [Query Operations](#query-operations)
  - [Put Operations](#put-operations)
  - [Update Operations](#update-operations)
    - [Condition Operators](#condition-operators)
    - [Multiple Operations](#multiple-operations)
- [🔄 Type Safety Features](#-type-safety-features)
  - [Nested Object Support](#nested-object-support)
  - [Type-Safe Conditions](#type-safe-conditions)
- [🔄 Batch Operations](#-batch-operations)
  - [Batch Get](#batch-get)
  - [Batch Write](#batch-write)
- [🔒 Transaction Operations](#-transaction-operations)
  - [Transaction Builder](#transaction-builder)
  - [Transaction Options](#transaction-options)
- [🚨 Error Handling](#-error-handling)
- [📚 API Reference](#-api-reference)
  - [Condition Operators](#condition-operators-1)
    - [Comparison Operators](#comparison-operators-1)
    - [Attribute Operators](#attribute-operators)
    - [Logical Operators](#logical-operators-1)
  - [Key Condition Operators](#key-condition-operators)
- [🔮 Future Roadmap](#-future-roadmap)
- [🤝 Contributing](#-contributing)
- [🦔 Running Examples](#-running-examples)

## 📦 Installation

<div align="center">

### Get Started in Seconds

</div>

```bash
# Install the core library
npm install dyno-table

# Install required AWS SDK v3 peer dependencies
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

<details>
<summary><b>📋 Other Package Managers</b></summary>

```bash
# Using Yarn
yarn add dyno-table @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb

# Using PNPM
pnpm add dyno-table @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```
</details>

## 🚀 Quick Start

<div align="center">

### From Zero to DynamoDB Hero in Minutes

</div>

### 1. Configure Your Jurassic Table

```ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Table } from "dyno-table/table";

// Configure AWS SDK clients
const client = new DynamoDBClient({ region: "us-west-2" });
const docClient = DynamoDBDocument.from(client);

// Initialise table
const dinoTable = new Table({
  client: docClient,
  tableName: "JurassicPark",
  indexes: {
    partitionKey: "pk",
    sortKey: "sk",
    gsis: {
      // Global Secondary Index setup in an abstract to allow unique access patterns per Entity Type for single table design
      gsi1: {
        partitionKey: "gsi1pk",
        sortKey: "gsi1sk",
      },
    },
  },
});
```

### 2. Perform Type-Safe Dinosaur Operations

<table>
<tr>
<td>

#### 🦖 Creating a new dinosaur specimen

```ts
// Add a new T-Rex with complete type safety
const rex = await dinoTable
  .create<Dinosaur>({
    pk: "SPECIES#trex",
    sk: "PROFILE#trex",
    speciesId: "trex",
    name: "Tyrannosaurus Rex",
    diet: "carnivore",
    length: 12.3,
    discoveryYear: 1902
  })
  .execute();
```

</td>
<td>

#### 🔍 Query with powerful conditions

```ts
// Find large carnivorous dinosaurs
const largeDinos = await dinoTable
  .query<Dinosaur>({ 
    pk: "SPECIES#trex",
    sk: (op) => op.beginsWith("PROFILE#")
  })
  .filter((op) => op.and(
    op.gte("length", 10),
    op.eq("diet", "carnivore")
  ))
  .limit(10)
  .execute();
```

</td>
</tr>
<tr>
<td>

#### 🔄 Update with type-safe operations

```ts
// Update a dinosaur's classification
await dinoTable
  .update<Dinosaur>({ 
    pk: "SPECIES#trex",
    sk: "PROFILE#trex"
  })
  .set("diet", "omnivore")
  .add("discoveryYear", 1)
  .remove("outdatedField")
  .condition((op) => 
    op.attributeExists("discoverySite")
  )
  .execute();
```

</td>
<td>

#### 🔒 Transactional operations

```ts
// Perform multiple operations atomically
await dinoTable.transaction(async (tx) => {
  // Move dinosaur to new enclosure
  await dinoTable
    .delete({ pk: "ENCLOSURE#A", sk: "DINO#1" })
    .withTransaction(tx);

  await dinoTable
    .create({ pk: "ENCLOSURE#B", sk: "DINO#1", 
      status: "ACTIVE" })
    .withTransaction(tx);
});
```

</td>
</tr>
</table>

<div align="center">
<h3>💡 See the difference with dyno-table</h3>
</div>

<table>
<tr>
<th>With dyno-table</th>
<th>Without dyno-table</th>
</tr>
<tr>
<td>

```ts
// Type-safe, clean, and intuitive
await dinoTable
  .query<Dinosaur>({ 
    pk: "SPECIES#trex"
  })
  .filter(op => 
    op.contains("features", "feathers")
  )
  .execute();
```

</td>
<td>

```ts
// Verbose, error-prone, no type safety
await docClient.send(new QueryCommand({
  TableName: "JurassicPark",
  KeyConditionExpression: "#pk = :pk",
  FilterExpression: "contains(#features, :feathers)",
  ExpressionAttributeNames: {
    "#pk": "pk",
    "#features": "features"
  },
  ExpressionAttributeValues: {
    ":pk": "SPECIES#trex",
    ":feathers": "feathers"
  }
}));
```

</td>
</tr>
</table>

## 🏗️ Entity Pattern with Standard Schema validators

<div align="center">

### The Most Type-Safe Way to Model Your DynamoDB Data

</div>

<table>
<tr>
<td width="70%">
<p>The entity pattern provides a structured, type-safe way to work with DynamoDB items. It combines schema validation, key management, and repository operations into a cohesive abstraction.</p>

<p>✨ This library supports all <a href="https://github.com/standard-schema/standard-schema#what-schema-libraries-implement-the-spec">Standard Schema</a> validation libraries, including <strong>zod</strong>, <strong>arktype</strong>, and <strong>valibot</strong>, allowing you to choose your preferred validation tool!</p>

<p>You can find a full example implementation here of <a href="https://github.com/Kysumi/dyno-table/blob/main/examples/entity-example/src/dinosaur-entity.ts">Entities</a></p>
</td>
<td width="30%">

#### Entity Pattern Benefits

- 🛡️ **Type-safe operations**
- 🧪 **Schema validation**
- 🔑 **Automatic key generation**
- 📦 **Repository pattern**
- 🔍 **Custom query builders**
- 🔄 **Lifecycle hooks**

</td>
</tr>
</table>

### Defining Entities

Entities are defined using the `defineEntity` function, which takes a configuration object that includes a schema, primary key definition, and optional indexes and queries.

```ts
import { z } from "zod";
import { defineEntity, createIndex } from "dyno-table/entity";

// Define your schema using Zod
const dinosaurSchema = z.object({
  id: z.string(),
  species: z.string(),
  name: z.string(),
  diet: z.enum(["carnivore", "herbivore", "omnivore"]),
  dangerLevel: z.number().int().min(1).max(10),
  height: z.number().positive(),
  weight: z.number().positive(),
  status: z.enum(["active", "inactive", "sick", "deceased"]),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Infer the type from the schema
type Dinosaur = z.infer<typeof dinosaurSchema>;

// Define key templates for Dinosaur entity
const dinosaurPK = partitionKey`ENTITY#DINOSAUR#DIET#${"diet"}`;
const dinosaurSK = sortKey`ID#${"id"}#SPECIES#${"species"}`;

// Create a primary index for Dinosaur entity
const primaryKey = createIndex()
  .input(z.object({ id: z.string(), diet: z.string(), species: z.string() }))
  .partitionKey(({ diet }) => dinosaurPK({ diet }))
  .sortKey(({ id, species }) => dinosaurSK({ species, id }));

// Define the entity
const DinosaurEntity = defineEntity({
  name: "Dinosaur",
  schema: dinosaurSchema,
  primaryKey,
});

// Create a repository
const dinosaurRepo = DinosaurEntity.createRepository(table);
```

### Entity Features

#### 1. Schema Validation

Entities use Zod schemas to validate data before operations:

```ts
// Define a schema with Zod
const dinosaurSchema = z.object({
  id: z.string(),
  species: z.string(),
  name: z.string(),
  diet: z.enum(["carnivore", "herbivore", "omnivore"]),
  dangerLevel: z.number().int().min(1).max(10),
  height: z.number().positive(),
  weight: z.number().positive(),
  status: z.enum(["active", "inactive", "sick", "deceased"]),
  tags: z.array(z.string()).optional(),
});

// Create an entity with the schema
const DinosaurEntity = defineEntity({
  name: "Dinosaur",
  schema: dinosaurSchema,
  primaryKey: createIndex()
          .input(z.object({ id: z.string(), diet: z.string(), species: z.string() }))
          .partitionKey(({ diet }) => dinosaurPK({ diet }))
          // could also be .withoutSortKey() if your table doesn't use sort keys
          .sortKey(({ id, species }) => dinosaurSK({ species, id })) 
});
```

#### 2. CRUD Operations

Entities provide type-safe CRUD operations:

```ts
// Create a new dinosaur
await dinosaurRepo.create({
  id: "dino-001",
  species: "Tyrannosaurus Rex",
  name: "Rexy",
  diet: "carnivore",
  dangerLevel: 10,
  height: 5.2,
  weight: 7000,
  status: "active",
}).execute();

// Get a dinosaur
const dino = await dinosaurRepo.get({
  id: "dino-001",
  diet: "carnivore",
  species: "Tyrannosaurus Rex",
}).execute();

// Update a dinosaur
await dinosaurRepo.update(
  { id: "dino-001", diet: "carnivore", species: "Tyrannosaurus Rex" },
  { weight: 7200, status: "sick" }
).execute();

// Delete a dinosaur
await dinosaurRepo.delete({
  id: "dino-001",
  diet: "carnivore",
  species: "Tyrannosaurus Rex",
}).execute();
```

#### 3. Custom Queries

Define custom queries with input validation:

```ts
import { createQueries } from "dyno-table/entity";

const createQuery = createQueries<Dinosaur>();

const DinosaurEntity = defineEntity({
  name: "Dinosaur",
  schema: dinosaurSchema,
  primaryKey,
  queries: {
    byDiet: createQuery
      .input(
        z.object({
          diet: z.enum(["carnivore", "herbivore", "omnivore"]),
        })
      )
      .query(({ input, entity }) => {
        return entity
          .query({
            pk: dinosaurPK({diet: input.diet})
          });
      }),

    bySpecies: createQuery
      .input(
        z.object({
          species: z.string(),
        })
      )
      .query(({ input, entity }) => {
        return entity
          .scan()
          .filter((op) => op.eq("species", input.species));
      }),
  },
});

// Use the custom queries
const carnivores = await dinosaurRepo.query.byDiet({ diet: "carnivore" }).execute();
const trexes = await dinosaurRepo.query.bySpecies({ species: "Tyrannosaurus Rex" }).execute();
```

#### 4. Defining GSI access patterns

Define GSI (LSI support coming later)

```ts
import { createIndex } from "dyno-table/entity";

// Define GSIs templates for querying by species
const gsi1PK = partitionKey`SPECIES#${"species"}`
const gsi1SK = sortKey`DINOSAUR#${"id"}`

// Implement typesafe generator for the GSI - This is used in create calls to ensure the GSI is generated
const speciesIndex = createIndex()
  .input(dinosaurSchema)
  .partitionKey(({ species }) => gsi1PK({ species }))
  .sortKey(({ id }) => gsiSK({ id }));

const DinosaurEntity = defineEntity({
  name: "Dinosaur",
  schema: dinosaurSchema,
  primaryKey,
  indexes: {
    species: speciesIndex,
  },
  queries: {
    bySpecies: createQuery
      .input(
        z.object({
          species: z.string(),
        })
      )
      .query(({ input, entity }) => {
        return entity
          .query({
            // Use the GSI template generator to avoid typos
            pk: gsi1PK({species: input.species}),
          })
          // Use the template name as defined in the table instance
          .useIndex("gsi1");
      }),
  },
});
```

### Complete Entity Example

Here's a complete example of using Zod schemas directly:

```ts
import { z } from "zod";
import { defineEntity, createQueries, createIndex } from "dyno-table/entity";
import { Table } from "dyno-table/table";
import { sortKey } from "dyno-table/utils/sort-key-template";
import { partitionKey } from "dyno-table/utils/partition-key-template";

// Define the schema with Zod
const dinosaurSchema = z.object({
  id: z.string(),
  species: z.string(),
  name: z.string(),
  enclosureId: z.string(),
  diet: z.enum(["carnivore", "herbivore", "omnivore"]),
  dangerLevel: z.number().int().min(1).max(10),
  height: z.number().positive(),
  weight: z.number().positive(),
  status: z.enum(["active", "inactive", "sick", "deceased"]),
  trackingChipId: z.string().optional(),
  lastFed: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Infer the type from the schema
type Dinosaur = z.infer<typeof dinosaurSchema>;

// Define key templates
const dinosaurPK = partitionKey`DINOSAUR#${"id"}`;
const dinosaurSK = sortKey`STATUS#${"status"}`;

const gsi1PK = partitionKey`SPECIES#${"species"}`
const gsi1SK = sortKey`DINOSAUR#${"id"}`

const gsi2PK = partitionKey`ENCLOSURE#${"enclosureId"}`
const gsi2SK = sortKey`DINOSAUR#${"id"}`

// Create a primary index
const primaryKey = createIndex()
  .input(dinosaurSchema)
  .partitionKey(({ id }) => dinosaurPK(id))
  .sortKey(({ status }) => dinosaurSK(status));

// Create a GSI for querying by species
const speciesIndex = createIndex()
  .input(dinosaurSchema)
  .partitionKey(({ species }) => gsi1PK({ species }))
  .sortKey(({ id }) => gsiSK({ id }));

// Create a GSI for querying by enclosure
const enclosureIndex = createIndex()
  .input(dinosaurSchema)
  .partitionKey(({ enclosureId }) => gsi2PK({ enclosureId }))
  .sortKey(({ id }) => gsi2SK({ id }));

// Create query builders
const createQuery = createQueries<Dinosaur>();

// Define the entity
const DinosaurEntity = defineEntity({
  name: "Dinosaur",
  schema: dinosaurSchema,
  primaryKey,
  indexes: {
    // These keys need to be named after the name of the GSI that is defined in your table instance 
    gsi1: speciesIndex,
    gsi2: enclosureIndex,
  },
  queries: {
    bySpecies: createQuery
      .input(
        z.object({
          species: z.string(),
        })
      )
      .query(({ input, entity }) => {
        return entity
          .query({
            pk: gsi1PK({ species: input.species }),
          })
          .useIndex("gsi1");
      }),

    byEnclosure: createQuery
      .input(
        z.object({
          enclosureId: z.string(),
        })
      )
      .query(({ input, entity }) => {
        return entity
          .query({
            pk: gsi2PK({ enclosureId: input.enclosureId }),
          })
          .useIndex("gsi2");
      }),

    dangerousInEnclosure: createQuery
      .input(
        z.object({
          enclosureId: z.string(),
          minDangerLevel: z.number().int().min(1).max(10),
        })
      )
      .query(({ input, entity }) => {
        return entity
          .query({
            pk: gsi2PK({ enclosureId: input.enclosureId }),
          })
          .useIndex("gsi2")
          .filter((op) => op.gte("dangerLevel", input.minDangerLevel));
      }),
  },
});

// Create a repository
const dinosaurRepo = DinosaurEntity.createRepository(table);

// Use the repository
async function main() {
  // Create a dinosaur
  await dinosaurRepo
    .create({
      id: "dino-001",
      species: "Tyrannosaurus Rex",
      name: "Rexy",
      enclosureId: "enc-001",
      diet: "carnivore",
      dangerLevel: 10,
      height: 5.2,
      weight: 7000,
      status: "active",
      trackingChipId: "TRX-001",
    })
    .execute();

  // Query dinosaurs by species
  const trexes = await dinosaurRepo.query.bySpecies({ 
    species: "Tyrannosaurus Rex" 
  }).execute();

  // Query dangerous dinosaurs in an enclosure
  const dangerousDinos = await dinosaurRepo.query.dangerousInEnclosure({
    enclosureId: "enc-001",
    minDangerLevel: 8,
  }).execute();
}
```

**Key benefits:**
- 🚫 Prevents accidental cross-type data access
- 🔍 Automatically filters queries/scans to a repository type
- 🛡️ Ensures consistent key structure across entities
- 📦 Encapsulates domain-specific query logic
- 🧪 Validates data with Zod schemas
- 🔄 Provides type inference from schemas

## 🧩 Advanced Features

### Transactional Operations

**Safe dinosaur transfer between enclosures**
```ts
// Start a transaction session for transferring a T-Rex to a new enclosure
// Critical for safety: All operations must succeed or none will be applied
await dinoTable.transaction(async (tx) => {
  // All operations are executed as a single transaction (up to 100 operations)
  // This ensures the dinosaur transfer is atomic - preventing half-completed transfers

  // STEP 1: Check if destination enclosure is ready and compatible with the dinosaur
  // We must verify the enclosure is prepared and suitable for a carnivore
  await dinoTable
    .conditionCheck({ 
      pk: "ENCLOSURE#B",          // Target enclosure B
      sk: "STATUS"                // Check the enclosure status record
    })
    .condition(op => op.and(
      op.eq("status", "READY"),   // Enclosure must be in READY state
      op.eq("diet", "Carnivore")  // Must support carnivorous dinosaurs
    ))
    .withTransaction(tx);

  // STEP 2: Remove dinosaur from current enclosure
  // Only proceed if the dinosaur is healthy enough for transfer
  await dinoTable
    .delete<Dinosaur>({ 
      pk: "ENCLOSURE#A",          // Source enclosure A
      sk: "DINO#001"              // T-Rex with ID 001
    })
    .condition(op => op.and(
      op.eq("status", "HEALTHY"), // Dinosaur must be in HEALTHY state
      op.gte("health", 80)        // Health must be at least 80%
    ))
    .withTransaction(tx);

  // STEP 3: Add dinosaur to new enclosure
  // Create a fresh record in the destination enclosure
  await dinoTable
    .create<Dinosaur>({
      pk: "ENCLOSURE#B",          // Destination enclosure B
      sk: "DINO#001",             // Same dinosaur ID for tracking
      name: "Rex",                // Dinosaur name
      species: "Tyrannosaurus",   // Species classification
      diet: "Carnivore",          // Dietary requirements
      status: "HEALTHY",          // Current health status
      health: 100,                // Reset health to 100% after transfer
      enclosureId: "B",           // Update enclosure reference
      lastFed: new Date().toISOString() // Reset feeding clock
    })
    .withTransaction(tx);

  // STEP 4: Update enclosure occupancy tracking
  // Keep accurate count of dinosaurs in each enclosure
  await dinoTable
    .update<Dinosaur>({ 
      pk: "ENCLOSURE#B",          // Target enclosure B
      sk: "OCCUPANCY"             // Occupancy tracking record
    })
    .add("currentOccupants", 1)   // Increment occupant count
    .set("lastUpdated", new Date().toISOString()) // Update timestamp
    .withTransaction(tx);
});

// Transaction for dinosaur feeding and health monitoring
// Ensures feeding status and schedule are updated atomically
await dinoTable.transaction(
  async (tx) => {
    // STEP 1: Update Stegosaurus health and feeding status
    // Record that the dinosaur has been fed and update its health metrics
    await dinoTable
      .update<Dinosaur>({
        pk: "ENCLOSURE#D",           // Herbivore enclosure D
        sk: "DINO#003"               // Stegosaurus with ID 003
      })
      .set({
        status: "HEALTHY",           // Update health status
        lastFed: new Date().toISOString(), // Record feeding time
        health: 100                  // Reset health to 100%
      })
      .deleteElementsFromSet("tags", ["needs_feeding"]) // Remove feeding alert tag
      .withTransaction(tx);

    // STEP 2: Update enclosure feeding schedule
    // Schedule next feeding time for tomorrow
    await dinoTable
      .update<Dinosaur>({
        pk: "ENCLOSURE#D",           // Same herbivore enclosure
        sk: "SCHEDULE"               // Feeding schedule record
      })
      .set("nextFeedingTime", new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()) // 24 hours from now
      .withTransaction(tx);
  },
  {
    // Transaction options for tracking and idempotency
    clientRequestToken: "feeding-session-001", // Prevents duplicate feeding operations
    returnConsumedCapacity: "TOTAL"            // Track capacity usage for park operations
  }
);
```

**Benefits of this transaction approach:**
- 🔄 Uses the same familiar API as non-transactional operations
- 🧠 Maintains consistent mental model for developers
- 🔒 All operations within the callback are executed as a single transaction
- 🛡️ Prevents race conditions and data inconsistencies
- 📊 Supports up to 100 actions per transaction

### Batch Processing

**Efficient dinosaur park management with bulk operations**
```ts
// SCENARIO 1: Morning health check for multiple dinosaurs across enclosures
// Retrieve health status for multiple dinosaurs in a single operation
const healthCheckKeys = [
  { pk: "ENCLOSURE#A", sk: "DINO#001" }, // T-Rex in Paddock A
  { pk: "ENCLOSURE#B", sk: "DINO#002" }, // Velociraptor in Paddock B
  { pk: "ENCLOSURE#C", sk: "DINO#003" }  // Stegosaurus in Paddock C
];

// Perform batch get operation to retrieve all dinosaurs at once
// This is much more efficient than individual gets
const { items: dinosaurs, unprocessedKeys } = await dinoTable.batchGet<Dinosaur>(healthCheckKeys);
console.log(`Health check completed for ${dinosaurs.length} dinosaurs`);

// Process health check results and identify any dinosaurs needing attention
dinosaurs.forEach(dino => {
  if (dino.health < 80) {
    console.log(`Health alert for ${dino.name} in Enclosure ${dino.enclosureId}`);
    // In a real application, you might trigger alerts or schedule veterinary visits
  }
});

// SCENARIO 2: Adding new herbivores to the park after quarantine
// Prepare data for multiple new herbivores joining the collection
const newHerbivores = [
  {
    pk: "ENCLOSURE#D", sk: "DINO#004",
    name: "Triceratops Alpha",      // Three-horned herbivore
    species: "Triceratops",
    diet: "Herbivore",
    status: "HEALTHY",
    health: 95,                     // Excellent health after quarantine
    lastFed: new Date().toISOString() // Just fed before joining main enclosure
  },
  {
    pk: "ENCLOSURE#D", sk: "DINO#005",
    name: "Brachy",                 // Long-necked herbivore
    species: "Brachiosaurus",
    diet: "Herbivore",
    status: "HEALTHY",
    health: 90,
    lastFed: new Date().toISOString()
  }
];

// Add all new herbivores to the enclosure in a single batch operation
// More efficient than individual writes and ensures consistent state
await dinoTable.batchWrite(
  newHerbivores.map(dino => ({
    type: "put",                    // Create or replace operation
    item: dino                      // Full dinosaur record
  }))
);

// SCENARIO 3: Releasing a dinosaur from quarantine to general population
// Multiple related operations performed as a batch
await dinoTable.batchWrite([
  // Step 1: Remove dinosaur from quarantine enclosure
  { 
    type: "delete", 
    key: { pk: "ENCLOSURE#QUARANTINE", sk: "DINO#006" } 
  },

  // Step 2: Add recovered dinosaur to main raptor enclosure
  { 
    type: "put", 
    item: {
      pk: "ENCLOSURE#E", sk: "DINO#006",
      name: "Raptor Beta",          // Juvenile Velociraptor
      species: "Velociraptor",
      diet: "Carnivore",
      status: "HEALTHY",            // Now healthy after treatment
      health: 100,
      lastFed: new Date().toISOString()
    }
  },

  // Step 3: Clear quarantine status record
  { 
    type: "delete", 
    key: { pk: "ENCLOSURE#QUARANTINE", sk: "STATUS#DINO#006" } 
  }
]);

// SCENARIO 4: Daily park-wide health monitoring
// Handle large-scale operations across all dinosaurs
// The library automatically handles chunking for large batches:
// - 25 items per batch write
// - 100 items per batch get
const dailyHealthUpdates = generateDinosaurHealthUpdates(); // Hundreds of updates
await dinoTable.batchWrite(dailyHealthUpdates); // Automatically chunked into multiple requests
```

### Pagination Made Simple

**Efficient dinosaur record browsing for park management**
```ts
// SCENARIO 1: Herbivore health monitoring with pagination
// Create a paginator for viewing healthy herbivores in manageable chunks
// Perfect for veterinary staff doing routine health checks
const healthyHerbivores = dinoTable
  .query<Dinosaur>({
    pk: "DIET#herbivore",                    // Target all herbivorous dinosaurs
    sk: op => op.beginsWith("STATUS#HEALTHY") // Only those with HEALTHY status
  })
  .filter((op) => op.and(
    op.gte("health", 90),                    // Only those with excellent health (90%+)
    op.attributeExists("lastFed")            // Must have feeding records
  ))
  .paginate(5);                              // Process in small batches of 5 dinosaurs

// Iterate through all pages of results - useful for processing large datasets
// without loading everything into memory at once
console.log("🦕 Beginning herbivore health inspection rounds...");
while (healthyHerbivores.hasNextPage()) {
  // Get the next page of dinosaurs
  const page = await healthyHerbivores.getNextPage();
  console.log(`Checking herbivores page ${page.page}, found ${page.items.length} dinosaurs`);

  // Process each dinosaur in the current page
  page.items.forEach(dino => {
    console.log(`${dino.name}: Health ${dino.health}%, Last fed: ${dino.lastFed}`);
    // In a real app, you might update health records or schedule next checkup
  });
}

// SCENARIO 2: Preparing carnivore feeding schedule
// Get all carnivores at once for daily feeding planning
// This approach loads all matching items into memory
const carnivoreSchedule = await dinoTable
  .query<Dinosaur>({
    pk: "DIET#carnivore",                    // Target all carnivorous dinosaurs
    sk: op => op.beginsWith("ENCLOSURE#")    // Organized by enclosure
  })
  .filter(op => op.attributeExists("lastFed")) // Only those with feeding records
  .paginate(10)                              // Process in pages of 10
  .getAllPages();                            // But collect all results at once

console.log(`Scheduling feeding for ${carnivoreSchedule.length} carnivores`);
// Now we can sort and organize feeding times based on species, size, etc.

// SCENARIO 3: Visitor information kiosk with limited display
// Create a paginated view for the public-facing dinosaur information kiosk
const visitorKiosk = dinoTable
  .query<Dinosaur>({ 
    pk: "VISITOR_VIEW",                      // Special partition for visitor-facing data
    sk: op => op.beginsWith("SPECIES#")      // Organized by species
  })
  .filter(op => op.eq("status", "ON_DISPLAY")) // Only show dinosaurs currently on display
  .limit(12)                                 // Show maximum 12 dinosaurs total
  .paginate(4);                              // Display 4 at a time for easy viewing

// Get first page for initial kiosk display
const firstPage = await visitorKiosk.getNextPage();
console.log(`🦖 Now showing: ${firstPage.items.map(d => d.name).join(", ")}`);
// Visitors can press "Next" to see more dinosaurs in the collection
```

## 🛡️ Type-Safe Query Building

Dyno-table provides comprehensive query methods that match DynamoDB's capabilities while maintaining type safety:

### Comparison Operators

| Operation                 | Method Example                                          | Generated Expression              |
|---------------------------|---------------------------------------------------------|-----------------------------------|
| **Equals**                | `.filter(op => op.eq("status", "ACTIVE"))`              | `status = :v1`                    |
| **Not Equals**            | `.filter(op => op.ne("status", "DELETED"))`             | `status <> :v1`                   |
| **Less Than**             | `.filter(op => op.lt("age", 18))`                       | `age < :v1`                       |
| **Less Than or Equal**    | `.filter(op => op.lte("score", 100))`                   | `score <= :v1`                    |
| **Greater Than**          | `.filter(op => op.gt("price", 50))`                     | `price > :v1`                     |
| **Greater Than or Equal** | `.filter(op => op.gte("rating", 4))`                    | `rating >= :v1`                   |
| **Between**               | `.filter(op => op.between("age", 18, 65))`              | `age BETWEEN :v1 AND :v2`         |
| **Begins With**           | `.filter(op => op.beginsWith("email", "@example.com"))` | `begins_with(email, :v1)`         |
| **Contains**              | `.filter(op => op.contains("tags", "important"))`       | `contains(tags, :v1)`             |
| **Attribute Exists**      | `.filter(op => op.attributeExists("email"))`            | `attribute_exists(email)`         |
| **Attribute Not Exists**  | `.filter(op => op.attributeNotExists("deletedAt"))`     | `attribute_not_exists(deletedAt)` |
| **Nested Attributes**     | `.filter(op => op.eq("address.city", "London"))`        | `address.city = :v1`              |

### Logical Operators

| Operation | Method Example                                                                    | Generated Expression           |
|-----------|-----------------------------------------------------------------------------------|--------------------------------|
| **AND**   | `.filter(op => op.and(op.eq("status", "ACTIVE"), op.gt("age", 18)))`              | `status = :v1 AND age > :v2`   |
| **OR**    | `.filter(op => op.or(op.eq("status", "PENDING"), op.eq("status", "PROCESSING")))` | `status = :v1 OR status = :v2` |
| **NOT**   | `.filter(op => op.not(op.eq("status", "DELETED")))`                               | `NOT status = :v1`             |

### Query Operations

| Operation                | Method Example                                                                       | Generated Expression                  |
|--------------------------|--------------------------------------------------------------------------------------|---------------------------------------|
| **Partition Key Equals** | `.query({ pk: "USER#123" })`                                                         | `pk = :pk`                            |
| **Sort Key Begins With** | `.query({ pk: "USER#123", sk: op => op.beginsWith("ORDER#2023") })`                  | `pk = :pk AND begins_with(sk, :v1)`   |
| **Sort Key Between**     | `.query({ pk: "USER#123", sk: op => op.between("ORDER#2023-01", "ORDER#2023-12") })` | `pk = :pk AND sk BETWEEN :v1 AND :v2` |

Additional query options:
```ts
// Sort order
const ascending = await table
  .query({ pk: "USER#123" })
  .sortAscending()
  .execute();

const descending = await table
  .query({ pk: "USER#123" })
  .sortDescending()
  .execute();

// Projection (select specific attributes)
const partial = await table
  .query({ pk: "USER#123" })
  .select(["name", "email"])
  .execute();

// Limit results
const limited = await table
  .query({ pk: "USER#123" })
  .limit(10)
  .execute();
```

### Put Operations

| Operation           | Method Example                                                      | Description                                                            |
|---------------------|---------------------------------------------------------------------|------------------------------------------------------------------------|
| **Create New Item** | `.create<Dinosaur>({ pk: "SPECIES#trex", sk: "PROFILE#001", ... })` | Creates a new item with a condition to ensure it doesn't already exist |
| **Put Item**        | `.put<Dinosaur>({ pk: "SPECIES#trex", sk: "PROFILE#001", ... })`    | Creates or replaces an item                                            |
| **With Condition**  | `.put(item).condition(op => op.attributeNotExists("pk"))`           | Adds a condition that must be satisfied                                |

#### Return Values

Control what data is returned from put operations:

| Option         | Description                                                                                                        | Example                                           |
|----------------|--------------------------------------------------------------------------------------------------------------------|---------------------------------------------------|
| **NONE**       | Default. No return value.                                                                                          | `.put(item).returnValues("NONE").execute()`       |
| **ALL_OLD**    | Returns the item's previous state if it existed. (Does not consume any RCU and returns strongly consistent values) | `.put(item).returnValues("ALL_OLD").execute()`    |
| **CONSISTENT** | Performs a consistent GET operation after the put to retrieve the item's new state. (Does consume RCU)             | `.put(item).returnValues("CONSISTENT").execute()` |

```ts
// Create with no return value (default)
await table.put<Dinosaur>({
  pk: "SPECIES#trex",
  sk: "PROFILE#001",
  name: "Tyrannosaurus Rex",
  diet: "carnivore"
}).execute();

// Create and return the newly created item
const newDino = await table.put<Dinosaur>({
  pk: "SPECIES#trex",
  sk: "PROFILE#002",
  name: "Tyrannosaurus Rex",
  diet: "carnivore"
}).returnValues("CONSISTENT").execute();

// Update with condition and get previous values
const oldDino = await table.put<Dinosaur>({
  pk: "SPECIES#trex",
  sk: "PROFILE#001",
  name: "Tyrannosaurus Rex",
  diet: "omnivore", // Updated diet
  discoveryYear: 1905
}).returnValues("ALL_OLD").execute();
```

### Update Operations

| Operation            | Method Example                                        | Generated Expression |
|----------------------|-------------------------------------------------------|----------------------|
| **Set Attributes**   | `.update(key).set("name", "New Name")`                | `SET #name = :v1`    |
| **Add to Number**    | `.update(key).add("score", 10)`                       | `ADD #score :v1`     |
| **Remove Attribute** | `.update(key).remove("temporary")`                    | `REMOVE #temporary`  |
| **Delete From Set**  | `.update(key).deleteElementsFromSet("tags", ["old"])` | `DELETE #tags :v1`   |

#### Condition Operators

The library supports a comprehensive set of type-safe condition operators:

| Category       | Operators                               | Example                                                                 |
|----------------|-----------------------------------------|-------------------------------------------------------------------------|
| **Comparison** | `eq`, `ne`, `lt`, `lte`, `gt`, `gte`    | `.condition(op => op.gt("age", 18))`                                    |
| **String/Set** | `between`, `beginsWith`, `contains`     | `.condition(op => op.beginsWith("email", "@example"))`                  |
| **Existence**  | `attributeExists`, `attributeNotExists` | `.condition(op => op.attributeExists("email"))`                         |
| **Logical**    | `and`, `or`, `not`                      | `.condition(op => op.and(op.eq("status", "active"), op.gt("age", 18)))` |

All operators are type-safe and will provide proper TypeScript inference for nested attributes.

#### Multiple Operations
Operations can be combined in a single update:
```ts
const result = await table
  .update({ pk: "USER#123", sk: "PROFILE" })
  .set("name", "Updated Name")
  .add("loginCount", 1)
  .remove("temporaryFlag")
  .condition(op => op.attributeExists("email"))
  .execute();
```

## 🔄 Type Safety Features

The library provides comprehensive type safety for all operations:

### Nested Object Support
```ts
interface Dinosaur {
  pk: string;
  sk: string;
  name: string;
  species: string;
  stats: {
    health: number;
    weight: number;
    length: number;
    age: number;
  };
  habitat: {
    enclosure: {
      id: string;
      section: string;
      climate: string;
    };
    requirements: {
      temperature: number;
      humidity: number;
    };
  };
  care: {
    feeding: {
      schedule: string;
      diet: string;
      lastFed: string;
    };
    medical: {
      lastCheckup: string;
      vaccinations: string[];
    };
  };
}

// TypeScript ensures type safety for all nested dinosaur attributes
await table.update<Dinosaur>({ pk: "ENCLOSURE#F", sk: "DINO#007" })
  .set("stats.health", 95) // ✓ Valid
  .set("habitat.enclosure.climate", "Tropical") // ✓ Valid
  .set("care.feeding.lastFed", new Date().toISOString()) // ✓ Valid
  .set("stats.invalid", true) // ❌ TypeScript Error: property doesn't exist
  .execute();
```

### Type-Safe Conditions
```ts
interface DinosaurMonitoring {
  species: string;
  health: number;
  lastFed: string;
  temperature: number;
  behavior: string[];
  alertLevel: "LOW" | "MEDIUM" | "HIGH";
}

await table.query<DinosaurMonitoring>({
  pk: "MONITORING",
  sk: op => op.beginsWith("ENCLOSURE#")
})
.filter(op => op.and(
  op.lt("health", "90"), // ❌ TypeScript Error: health expects number
  op.gt("temperature", 38), // ✓ Valid
  op.contains("behavior", "aggressive"), // ✓ Valid
  op.eq("alertLevel", "UNKNOWN") // ❌ TypeScript Error: invalid alert level
))
.execute();
```

## 🔄 Batch Operations

The library supports efficient batch operations for both reading and writing multiple items:

### Batch Get
```ts
const { items, unprocessedKeys } = await table.batchGet<User>([
  { pk: "USER#1", sk: "PROFILE" },
  { pk: "USER#2", sk: "PROFILE" }
]);
```

### Batch Write
```ts
const { unprocessedItems } = await table.batchWrite<User>([
  { type: "put", item: newUser },
  { type: "delete", key: { pk: "USER#123", sk: "PROFILE" } }
]);
```

## 🔒 Transaction Operations

Perform multiple operations atomically with transaction support:

### Transaction Builder
```ts
const result = await table.transaction(async (tx) => {
  // Building the expression manually
  tx.put("TableName", { pk: "123", sk: "123"}, and(op.attributeNotExists("pk"), op.attributeExists("sk")));

  // Using table to build the operation
  table
    .put({ pk: "123", sk: "123" })
    .condition((op) => {
      return op.and(op.attributeNotExists("pk"), op.attributeExists("sk"));
    })
    .withTransaction(tx);

  // Building raw condition check
  tx.conditionCheck(
    "TestTable",
    { pk: "transaction#test", sk: "condition#item" },
    eq("status", "active"),
  );

  // Using table to build the condition check
  table
    .conditionCheck({
      pk: "transaction#test",
      sk: "conditional#item",
    })
    .condition((op) => op.eq("status", "active"));
});
```

### Transaction Options
```ts
const result = await table.transaction(
  async (tx) => {
    // ... transaction operations
  },
  {
    // Optional transaction settings
    idempotencyToken: "unique-token",
    returnValuesOnConditionCheckFailure: true
  }
);
```


## 🚨 Error Handling

**TODO:**
to provide a more clear set of error classes and additional information to allow for an easier debugging experience

## 📚 API Reference

### Condition Operators

All condition operators are type-safe and will validate against your item type. For detailed information about DynamoDB conditions and expressions, see the [AWS DynamoDB Developer Guide](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html).

#### Comparison Operators
- `eq(attr, value)` - Equals (=)
- `ne(attr, value)` - Not equals (≠)
- `lt(attr, value)` - Less than (<)
- `lte(attr, value)` - Less than or equal to (≤)
- `gt(attr, value)` - Greater than (>)
- `gte(attr, value)` - Greater than or equal to (≥)
- `between(attr, lower, upper)` - Between two values (inclusive)
- `beginsWith(attr, value)` - Checks if string begins with value
- `contains(attr, value)` - Checks if string/set contains value

```ts
// Example: Health and feeding monitoring
await dinoTable
  .query<Dinosaur>({
    pk: "ENCLOSURE#G"
  })
  .filter((op) => op.and(
    op.lt("stats.health", 85),  // Health below 85%
    op.lt("care.feeding.lastFed", new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()),  // Not fed in 12 hours
    op.between("stats.weight", 1000, 5000)  // Medium-sized dinosaurs
  ))
  .execute();
```

#### Attribute Operators
- `attributeExists(attr)` - Checks if attribute exists
- `attributeNotExists(attr)` - Checks if attribute does not exist

```ts
// Example: Validate required attributes for dinosaur transfer
await dinoTable
  .update<Dinosaur>({
    pk: "ENCLOSURE#H", 
    sk: "DINO#008"
  })
  .set("habitat.enclosure.id", "ENCLOSURE#J")
  .condition((op) => op.and(
    // Ensure all required health data is present
    op.attributeExists("stats.health"),
    op.attributeExists("care.medical.lastCheckup"),
    // Ensure not already in transfer
    op.attributeNotExists("transfer.inProgress"),
    // Verify required monitoring tags
    op.attributeExists("care.medical.vaccinations")
  ))
  .execute();
```

#### Logical Operators
- `and(...conditions)` - Combines conditions with AND
- `or(...conditions)` - Combines conditions with OR
- `not(condition)` - Negates a condition

```ts
// Example: Complex safety monitoring conditions
await dinoTable
  .query<Dinosaur>({
    pk: "MONITORING#ALERTS"
  })
  .filter((op) => op.or(
    // Alert: Aggressive carnivores with low health
    op.and(
      op.eq("care.feeding.diet", "Carnivore"),
      op.lt("stats.health", 70),
      op.contains("behavior", "aggressive")
    ),
    // Alert: Any dinosaur not fed recently and showing stress
    op.and(
      op.lt("care.feeding.lastFed", new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()),
      op.contains("behavior", "stressed")
    ),
    // Alert: Enclosure climate issues
    op.and(
      op.not(op.eq("habitat.enclosure.climate", "Optimal")),
      op.or(
        op.gt("habitat.requirements.temperature", 40),
        op.lt("habitat.requirements.humidity", 50)
      )
    )
  ))
  .execute();
```

### Key Condition Operators

Special operators for sort key conditions in queries. See [AWS DynamoDB Key Condition Expressions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.html#Query.KeyConditionExpressions) for more details.

```ts
// Example: Query recent health checks by enclosure
const recentHealthChecks = await dinoTable
  .query<Dinosaur>({
    pk: "ENCLOSURE#K",
    sk: (op) => op.beginsWith(`HEALTH#${new Date().toISOString().slice(0, 10)}`)  // Today's checks
  })
  .execute();

// Example: Query dinosaurs by weight range in specific enclosure
const largeHerbivores = await dinoTable
  .query<Dinosaur>({
    pk: "DIET#herbivore",
    sk: (op) => op.between(
      `WEIGHT#${5000}`,  // 5 tons minimum
      `WEIGHT#${15000}`  // 15 tons maximum
    )
  })
  .execute();

// Example: Find all dinosaurs in quarantine by date range
const quarantinedDinos = await dinoTable
  .query<Dinosaur>({
    pk: "STATUS#quarantine",
    sk: (op) => op.between(
      `DATE#${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}`,  // Last 7 days
      `DATE#${new Date().toISOString().slice(0, 10)}`  // Today
    )
  })
  .execute();
```

Available key conditions for dinosaur queries:
- `eq(value)` - Exact match (e.g., specific enclosure)
- `lt(value)` - Earlier than date/time
- `lte(value)` - Up to and including date/time
- `gt(value)` - Later than date/time
- `gte(value)` - From date/time onwards
- `between(lower, upper)` - Range (e.g., weight range, date range)
- `beginsWith(value)` - Prefix match (e.g., all health checks today)

## 🔮 Future Roadmap

- [ ] Enhanced query plan visualization
- [ ] Migration tooling
- [ ] Local secondary index support
- [ ] Multi-table transaction support

## 🤝 Contributing

```bash
# Set up development environment
pnpm install

# Run tests (requires local DynamoDB)
pnpm run ddb:start
pnpm test

# Build the project
pnpm build
```

## 📦 Release Process

This project uses [semantic-release](https://github.com/semantic-release/semantic-release) for automated versioning and package publishing. The configuration is maintained in the `.releaserc.json` file. Releases are automatically triggered by commits to specific branches:

- **Main Channel**: Stable releases from the `main` branch
- **Alpha Channel**: Pre-releases from the `alpha` branch

### Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification for commit messages, which determines the release type:

- `fix: ...` - Patch release (bug fixes)
- `feat: ...` - Minor release (new features)
- `feat!: ...` or `fix!: ...` or any commit with `BREAKING CHANGE:` in the footer - Major release

### Release Workflow

1. For regular features and fixes:
   - Create a PR against the `main` branch
   - Once merged, a new release will be automatically published

2. For experimental features:
   - Create a PR against the `alpha` branch
   - Once merged, a new alpha release will be published with an alpha tag

### Installing Specific Channels

```bash
# Install the latest stable version
npm install dyno-table

# Install the latest alpha version
npm install dyno-table@alpha
```

## 🦔 Running Examples

There's a few pre-configured example scripts in the `examples` directory.

First you'll need to install the dependencies:

```bash
pnpm install
```
Then setup the test table in local DynamoDB by running the following command:

```bash
pnpm run ddb:start
pnpm run local:setup
```

To run the examples, you can use the following command:

```bash
npx tsx examples/[EXAMPLE_NAME].ts
```

To view the test table GUI in action: [DynamoDB Admin](http://localhost:8001/)
