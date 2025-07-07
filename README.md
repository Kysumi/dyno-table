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
  <td width="50%">
    <h3>⚡ Velociraptor-fast API</h3>
    <p>Intuitive chainable builder pattern for complex operations that feels natural and reduces boilerplate</p>
  </td>
  <td width="50%">
    <h3>🎯 Semantic data access patterns</h3>
    <p>Encourages meaningful, descriptive method names like <code>getUserByEmail()</code> instead of cryptic <code>gsi1</code> references</p>
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
- [🎯 DynamoDB Best Practices](#-dynamodb-best-practices)
  - [Semantic Data Access Patterns](#semantic-data-access-patterns)
  - [The Problem with Generic Index Names](#the-problem-with-generic-index-names)
  - [The Solution: Meaningful Method Names](#the-solution-meaningful-method-names)
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
  - [Entity-Based Batch Operations](#-entity-based-batch-operations)
  - [Table-Direct Batch Operations](#-table-direct-batch-operations)
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

## 🎯 DynamoDB Best Practices

<div align="center">

### **Design Your Data Access Patterns First, Name Them Meaningfully**

</div>

dyno-table follows DynamoDB best practices by encouraging developers to **define their data access patterns upfront** and assign them **meaningful, descriptive names**. This approach ensures that when writing business logic, developers call semantically clear methods instead of cryptic index references.

### Semantic Data Access Patterns

The core principle is simple: **your code should read like business logic, not database implementation details**.

<table>
<tr>
<th>❌ Cryptic Implementation</th>
<th>✅ Semantic Business Logic</th>
</tr>
<tr>
<td>

```ts
// Hard to understand what this does - using raw AWS Document Client
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";

const docClient = DynamoDBDocument.from(new DynamoDBClient({}));

const users = await docClient.send(new QueryCommand({
  TableName: "MyTable",
  IndexName: "gsi1", 
  KeyConditionExpression: "#pk = :pk",
  ExpressionAttributeNames: { "#pk": "pk" },
  ExpressionAttributeValues: { ":pk": "STATUS#active" }
}));

const orders = await docClient.send(new QueryCommand({
  TableName: "MyTable",
  IndexName: "gsi2",
  KeyConditionExpression: "#pk = :pk",
  ExpressionAttributeNames: { "#pk": "pk" },
  ExpressionAttributeValues: { ":pk": "CUSTOMER#123" }
}));

const products = await docClient.send(new QueryCommand({
  TableName: "MyTable",
  IndexName: "gsi3",
  KeyConditionExpression: "#pk = :pk",
  ExpressionAttributeNames: { "#pk": "pk" },
  ExpressionAttributeValues: { ":pk": "CATEGORY#electronics" }
}));
```

</td>
<td>

```ts
// Clear business intent
const activeUsers = await userRepo.query
  .getActiveUsers()
  .execute();

const customerOrders = await orderRepo.query
  .getOrdersByCustomer({ customerId: "123" })
  .execute();

const electronics = await productRepo.query
  .getProductsByCategory({ category: "electronics" })
  .execute();
```

</td>
</tr>
</table>

### The Problem with Generic Index Names

When you use generic names like `gsi1`, `gsi2`, `gsi3`, you create several problems:

- **🧠 Cognitive Load**: Developers must remember what each index does
- **📚 Poor Documentation**: Code doesn't self-document its purpose
- **🐛 Error-Prone**: Easy to use the wrong index for a query
- **👥 Team Friction**: New team members struggle to understand data access patterns
- **🔄 Maintenance Issues**: Refactoring becomes risky and unclear

### The Solution: Meaningful Method Names

dyno-table encourages you to define your access patterns with descriptive names that reflect their business purpose:

```ts
// Define your access patterns with meaningful names
const UserEntity = defineEntity({
  name: "User",
  schema: userSchema,
  primaryKey,
  queries: {
    // ✅ Clear business purpose
    getActiveUsers: createQuery
      .input(z.object({}))
      .query(({ entity }) => entity.query({ pk: "STATUS#active" }).useIndex("gsi1")),

    getUsersByEmail: createQuery
      .input(z.object({ email: z.string() }))
      .query(({ input, entity }) => entity.query({ pk: `EMAIL#${input.email}` }).useIndex("gsi1")),

    getUsersByDepartment: createQuery
      .input(z.object({ department: z.string() }))
      .query(({ input, entity }) => entity.query({ pk: `DEPT#${input.department}` }).useIndex("gsi2")),
  },
});

// Usage in business logic is now self-documenting
const activeUsers = await userRepo.query.getActiveUsers().execute();
const engineeringTeam = await userRepo.query.getUsersByDepartment({ department: "engineering" }).execute();
const user = await userRepo.query.getUsersByEmail({ email: "john@company.com" }).execute();
```

**This pattern promotes:**
- ✅ **Better code readability and maintainability**
- ✅ **Self-documenting API design**
- ✅ **Easier onboarding for new team members**
- ✅ **Reduced cognitive load when understanding data access patterns**
- ✅ **Clear separation between business logic and database implementation**

> **🏗️ Important Note**: Keep your actual DynamoDB table GSI names generic (`gsi1`, `gsi2`, etc.) for flexibility across different entities. The meaningful, descriptive names should live at the entity/repository level, not at the table level. This allows multiple entities to share the same GSIs while maintaining semantic clarity in your business logic.

## 🚀 Quick Start

<div align="center">

### From Zero to DynamoDB Hero in Minutes

</div>

### 1. Configure Your Jurassic Table

> **Note:** dyno-table does not create or manage the actual DynamoDB table for you. We recommend using infrastructure as code tools like Terraform, OpenTofu, SST, or AWS CDK to provision and manage your DynamoDB tables.

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
      gsi1: {
        partitionKey: "gsi1pk",
        sortKey: "gsi1sk",
      },
    },
  },
});
```

### 2. Perform Type-Safe Operations directly on the table instance

> **💡 Pro Tip**: While you can use the table directly, we recommend using the [Entity Pattern](#-entity-pattern-with-standard-schema-validators) with meaningful, descriptive method names like `getUserByEmail()` instead of generic index references. This follows DynamoDB best practices and makes your code self-documenting.

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
await dinoTable.transaction((tx) => {
  // Move dinosaur to new enclosure
  dinoTable
    .delete({ pk: "ENCLOSURE#A", sk: "DINO#1" })
    .withTransaction(tx);

  dinoTable
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
<th>❌ Without dyno-table</th>
<th>✅ With dyno-table (Entity Pattern)</th>
</tr>
<tr>
<td>

```ts
// Verbose, error-prone, no type safety
await docClient.send(new QueryCommand({
  TableName: "JurassicPark",
  IndexName: "gsi1", // What does gsi1 do?
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
<td>

```ts
// Self-documenting, type-safe, semantic
const featheredTRexes = await dinosaurRepo.query
  .getFeatheredDinosaursBySpecies({
    species: "trex"
  })
  .execute();

// Or using table directly (still better than raw SDK)
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
</tr>
</table>

**Key improvements:**
- 🛡️ **Type Safety**: Compile-time error checking prevents runtime failures
- 📖 **Self-Documenting**: Code clearly expresses business intent
- 🧠 **Reduced Complexity**: No manual expression building or attribute mapping

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

Define custom queries with **meaningful, descriptive names** that reflect their business purpose. This follows DynamoDB best practices by making your data access patterns self-documenting:

```ts
import { createQueries } from "dyno-table/entity";

const createQuery = createQueries<Dinosaur>();

const DinosaurEntity = defineEntity({
  name: "Dinosaur",
  schema: dinosaurSchema,
  primaryKey,
  queries: {
    // ✅ Semantic method names that describe business intent
    getDinosaursByDiet: createQuery
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

    findDinosaursBySpecies: createQuery
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

    getActiveCarnivores: createQuery
      .input(z.object({}))
      .query(({ entity }) => {
        return entity
          .query({
            pk: dinosaurPK({diet: "carnivore"})
          })
          .filter((op) => op.eq("status", "active"));
      }),

    getDangerousDinosaursInEnclosure: createQuery
      .input(
        z.object({
          enclosureId: z.string(),
          minDangerLevel: z.number().min(1).max(10),
        })
      )
      .query(({ input, entity }) => {
        return entity
          .scan()
          .filter((op) => op.and(
            op.contains("enclosureId", input.enclosureId),
            op.gte("dangerLevel", input.minDangerLevel)
          ));
      }),
  },
});

// Usage in business logic is now self-documenting
const carnivores = await dinosaurRepo.query.getDinosaursByDiet({ diet: "carnivore" }).execute();
const trexes = await dinosaurRepo.query.findDinosaursBySpecies({ species: "Tyrannosaurus Rex" }).execute();
const activeCarnivores = await dinosaurRepo.query.getActiveCarnivores().execute();
const dangerousDinos = await dinosaurRepo.query.getDangerousDinosaursInEnclosure({
  enclosureId: "PADDOCK-A",
  minDangerLevel: 8
}).execute();
```

**Benefits of semantic naming:**
- 🎯 **Clear Intent**: Method names immediately convey what data you're accessing
- 📖 **Self-Documenting**: No need to look up what `gsi1` or `gsi2` does
- 🧠 **Reduced Cognitive Load**: Developers can focus on business logic, not database details
- 👥 **Team Collaboration**: New team members understand the codebase faster
- 🔍 **Better IDE Support**: Autocomplete shows meaningful method names

#### 4. Defining GSI Access Patterns

Define GSI access patterns with **meaningful names** that reflect their business purpose. This is crucial for maintaining readable, self-documenting code:

```ts
import { createIndex } from "dyno-table/entity";

// Define GSI templates with descriptive names that reflect their purpose
const speciesPK = partitionKey`SPECIES#${"species"}`
const speciesSK = sortKey`DINOSAUR#${"id"}`

const enclosurePK = partitionKey`ENCLOSURE#${"enclosureId"}`
const enclosureSK = sortKey`DANGER#${"dangerLevel"}#ID#${"id"}`

// Create indexes with meaningful names
const speciesIndex = createIndex()
  .input(dinosaurSchema)
  .partitionKey(({ species }) => speciesPK({ species }))
  .sortKey(({ id }) => speciesSK({ id }));

const enclosureIndex = createIndex()
  .input(dinosaurSchema)
  .partitionKey(({ enclosureId }) => enclosurePK({ enclosureId }))
  .sortKey(({ dangerLevel, id }) => enclosureSK({ dangerLevel, id }));

const DinosaurEntity = defineEntity({
  name: "Dinosaur",
  schema: dinosaurSchema,
  primaryKey,
  indexes: {
    // ✅ Map to generic GSI names for table flexibility
    gsi1: speciesIndex,
    gsi2: enclosureIndex,
  },
  queries: {
    // ✅ Semantic method names that describe business intent
    getDinosaursBySpecies: createQuery
      .input(
        z.object({
          species: z.string(),
        })
      )
      .query(({ input, entity }) => {
        return entity
          .query({
            pk: speciesPK({species: input.species}),
          })
          .useIndex("gsi1"); // Generic GSI name for table flexibility
      }),

    getDinosaursByEnclosure: createQuery
      .input(
        z.object({
          enclosureId: z.string(),
        })
      )
      .query(({ input, entity }) => {
        return entity
          .query({
            pk: enclosurePK({enclosureId: input.enclosureId}),
          })
          .useIndex("gsi2");
      }),

    getMostDangerousInEnclosure: createQuery
      .input(
        z.object({
          enclosureId: z.string(),
          minDangerLevel: z.number().min(1).max(10),
        })
      )
      .query(({ input, entity }) => {
        return entity
          .query({
            pk: enclosurePK({enclosureId: input.enclosureId}),
            sk: (op) => op.gte(`DANGER#${input.minDangerLevel}`)
          })
          .useIndex("gsi2")
          .sortDescending(); // Get most dangerous first
      }),
  },
});

// Usage is now self-documenting
const trexes = await dinosaurRepo.query.getDinosaursBySpecies({ species: "Tyrannosaurus Rex" }).execute();
const paddockADinos = await dinosaurRepo.query.getDinosaursByEnclosure({ enclosureId: "PADDOCK-A" }).execute();
const dangerousDinos = await dinosaurRepo.query.getMostDangerousInEnclosure({
  enclosureId: "PADDOCK-A",
  minDangerLevel: 8
}).execute();
```

**Key principles for access pattern naming:**
- 🎯 **Generic GSI Names**: Keep table-level GSI names generic (`gsi1`, `gsi2`) for flexibility across entities
- 🔍 **Business-Focused**: Method names should reflect what the query achieves, not how it works
- 📚 **Self-Documenting**: Anyone reading the code should understand the purpose immediately
- 🏗️ **Entity-Level Semantics**: The meaningful names live at the entity/repository level, not the table level

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
    // ✅ Semantic method names that describe business intent
    getDinosaursBySpecies: createQuery
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

    getDinosaursByEnclosure: createQuery
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

    getDangerousDinosaursInEnclosure: createQuery
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

  // Query dinosaurs by species using semantic method names
  const trexes = await dinosaurRepo.query.getDinosaursBySpecies({
    species: "Tyrannosaurus Rex"
  }).execute();

  // Query dangerous dinosaurs in an enclosure
  const dangerousDinos = await dinosaurRepo.query.getDangerousDinosaursInEnclosure({
    enclosureId: "enc-001",
    minDangerLevel: 8,
  }).execute();
}
```

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
| **In Array**              | `.filter(op => op.inArray("status", ["ACTIVE", "PENDING"]))` | `status IN (:v1, :v2)`            |
| **Begins With**           | `.filter(op => op.beginsWith("email", "@example.com"))`      | `begins_with(email, :v1)`         |
| **Contains**              | `.filter(op => op.contains("tags", "important"))`            | `contains(tags, :v1)`             |
| **Attribute Exists**      | `.filter(op => op.attributeExists("email"))`                 | `attribute_exists(email)`         |
| **Attribute Not Exists**  | `.filter(op => op.attributeNotExists("deletedAt"))`          | `attribute_not_exists(deletedAt)` |
| **Nested Attributes**     | `.filter(op => op.eq("address.city", "London"))`             | `address.city = :v1`              |

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

| Category       | Operators                                    | Example                                                                 |
|----------------|----------------------------------------------|-------------------------------------------------------------------------|
| **Comparison** | `eq`, `ne`, `lt`, `lte`, `gt`, `gte`         | `.condition(op => op.gt("age", 18))`                                    |
| **String/Set** | `between`, `beginsWith`, `contains`, `inArray` | `.condition(op => op.inArray("status", ["active", "pending"]))`         |
| **Existence**  | `attributeExists`, `attributeNotExists`      | `.condition(op => op.attributeExists("email"))`                         |
| **Logical**    | `and`, `or`, `not`                           | `.condition(op => op.and(op.eq("status", "active"), op.gt("age", 18)))` |

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
  op.inArray("alertLevel", ["LOW", "MEDIUM", "HIGH"]), // ✓ Valid: matches union type
  op.inArray("alertLevel", ["UNKNOWN", "INVALID"]), // ❌ TypeScript Error: invalid alert levels
  op.eq("alertLevel", "UNKNOWN") // ❌ TypeScript Error: invalid alert level
))
.execute();
```

## 🔄 Batch Operations

Efficiently handle multiple items in a single request with automatic chunking and type safety.

### 🏗️ Entity-Based Batch Operations

**Type-safe batch operations with automatic entity type inference**

```ts
// Create a typed batch builder
const batch = table.batchBuilder<{
  Dinosaur: DinosaurEntity;
  Fossil: FossilEntity;
}>();

// Add operations - entity type is automatically inferred
dinosaurRepo.create(newDinosaur).withBatch(batch);
dinosaurRepo.get({ id: 'dino-123', diet: 'carnivore', species: 'Tyrannosaurus Rex' }).withBatch(batch);
fossilRepo.create(newFossil).withBatch(batch);

// Execute and get typed results
const result = await batch.execute();
const dinosaurs: DinosaurEntity[] = result.reads.itemsByType.Dinosaur;
const fossils: FossilEntity[] = result.reads.itemsByType.Fossil;
```

### 📋 Table-Direct Batch Operations

**Direct table access for maximum control**

```ts
// Batch get - retrieve multiple items
const keys = [
  { pk: "DIET#carnivore", sk: "SPECIES#Tyrannosaurus Rex#ID#dino-123" },
  { pk: "FOSSIL#456", sk: "DISCOVERY#2024" }
];

const { items, unprocessedKeys } = await table.batchGet<DynamoItem>(keys);

// Batch write - mix of operations
const operations = [
  { type: "put" as const, item: { pk: "DIET#herbivore", sk: "SPECIES#Triceratops#ID#dino-789", name: "Spike", dangerLevel: 3 } },
  { type: "delete" as const, key: { pk: "FOSSIL#OLD", sk: "DISCOVERY#1990" } }
];

const { unprocessedItems } = await table.batchWrite(operations);

// Handle unprocessed items (retry if needed)
if (unprocessedItems.length > 0) {
  await table.batchWrite(unprocessedItems);
}
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
- `inArray(attr, values)` - Checks if value is in a list of values (IN operator, max 100 values)
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

// Example: Filter dinosaurs by multiple status values using inArray
await dinoTable
  .query<Dinosaur>({
    pk: "SPECIES#trex"
  })
  .filter((op) => op.and(
    op.inArray("status", ["ACTIVE", "FEEDING", "RESTING"]),  // Multiple valid statuses
    op.inArray("diet", ["carnivore", "omnivore"]),           // Meat-eating dinosaurs
    op.gt("dangerLevel", 5)                                  // High danger level
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
    // Alert: Critical status dinosaurs requiring immediate attention
    op.and(
      op.inArray("status", ["SICK", "INJURED", "QUARANTINE"]),  // Critical statuses
      op.inArray("priority", ["HIGH", "URGENT"])                // High priority levels
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
