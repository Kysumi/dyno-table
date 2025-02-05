# 🦖 dyno-table [![npm version](https://img.shields.io/npm/v/dyno-table.svg?style=flat-square)](https://www.npmjs.com/package/dyno-table) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

**A type-safe, fluent interface for DynamoDB single-table designs**  
*Tame the NoSQL wilderness with a robust abstraction layer that brings order to DynamoDB operations*

<img src="docs/images/geoff-the-dyno.png" width="400" height="250" alt="Geoff the Dyno" style="float: right; margin-left: 20px; margin-bottom: 20px;">

```ts
// Type-safe DynamoDB operations made simple
await dinoRepo
  .update({ pk: 'SPECIES#trex', sk: 'PROFILE#001' })
  .set('diet', 'Carnivore')
  .increment('sightings', 1)
  .whereEquals('status', 'ACTIVE')
  .execute();
```

## 🌟 Why dyno-table?

- **🧩 Single-table design made simple** - Clean abstraction layer for complex DynamoDB patterns
- **🛡️ Type-safe operations** - Full TypeScript support with strict type checking
- **⚡ Fluent API** - Chainable builder pattern for complex operations
- **🔒 Transactional safety** - ACID-compliant operations with easy-to-use transactions
- **📈 Scalability built-in** - Automatic batch chunking and pagination handling

## 📦 Installation

```bash
npm install dyno-table
```

*Note: Requires AWS SDK v3 as peer dependency*

```bash
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

## 🚀 Quick Start

### 1. Configure Your Table

```ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Table } from "dyno-table";

// Configure AWS SDK clients
const client = new DynamoDBClient({ region: "us-west-2" });
const docClient = DynamoDBDocument.from(client);

// Initialize table with single-table design schema
const dinoTable = new Table({
  client: docClient,
  tableName: "DinosaurPark",
  tableIndexes: {
    primary: {
      pkName: "pk",
      skName: "sk",
    },
    GSI1: {
      pkName: "GSI1PK",
      skName: "GSI1SK",
    },
  },
});
```

### 2. Define Your Repository

```ts
import { BaseRepository } from "dyno-table";

type Dinosaur = {
  speciesId: string;
  name: string;
  diet: "herbivore" | "carnivore" | "omnivore";
  length: number;
  discoveryYear: number;
};

class DinoRepository extends BaseRepository<Dinosaur> {
  protected createPrimaryKey(data: Dinosaur) {
    return {
      pk: `SPECIES#${data.speciesId}`,
      sk: `PROFILE#${data.speciesId}`,
    };
  }

  protected getType() {
    return "DINOSAUR"; // Automatic type scoping
  }

  // Custom query methods
  async findCarnivores() {
    return this.scan()
      .whereEquals("diet", "carnivore")
      .execute();
  }
}

export const dinoRepo = new DinoRepository(dinoTable);
```

### 3. Perform Type-Safe Operations

**🦖 Creating a new dinosaur**
```ts
const rex = await dinoRepo.create({
  speciesId: "trex",
  name: "Tyrannosaurus Rex",
  diet: "carnivore",
  length: 12.3,
  discoveryYear: 1902
}).execute();
```

**🔍 Query with conditions**
```ts
const largeDinos = await dinoRepo
  .query({ 
    pk: "SPECIES#trex",
    sk: { operator: "begins_with", value: "PROFILE#" }
  })
  .whereGreaterThan("length", 10)
  .limit(10)
  .execute();
```

**🔄 Complex update operation**
```ts
await dinoRepo
  .update({ pk: "SPECIES#trex", sk: "PROFILE#trex" })
  .set("diet", "omnivore")
  .increment("discoveryYear", 1)
  .remove("outdatedField")
  .whereExists("discoverySite")
  .execute();
```

## 🧩 Advanced Features

### Transactional Operations

**Atomic updates across multiple entities**
```ts
await dinoTable.withTransaction(async (trx) => {
  // Move dinosaur between enclosures
  dinoRepo
    .update(trexKey)
    .set("enclosure", "NW-SECTOR")
    .withTransaction(trx);

  dinoRepo
    .update(raptorKey)
    .set("enclosure", "SW-SECTOR")
    .withTransaction(trx);

  // Update tracking system
  trackingRepo
    .put(newTrackingRecord)
    .withTransaction(trx);
});
```

### Batch Processing

**Efficient bulk operations with automatic chunking**
```ts
// Batch create 250 dinosaurs
const fossils = await loadPaleontologyData(); 

// Batches will automatically be chunked into the maximum allowed amount of 25 items
await dinoTable.batchWrite(
  fossils.map(fossil => ({
    type: "put",
    item: dinoRepo.createItem(fossil)
  }))
);

// Batch write with mixed operations
await dinoTable.batchWrite([
  { type: "delete", key: rexKey },
  { type: "put", item: newVelociraptor },
  { type: "delete", key: stegoKey }
]);
```

### Pagination Made Simple

**Page large datasets effortlessly**
```ts
const paginator = dinoRepo
  .scan()
  .whereGreaterThan("length", 5)
  .limit(100) // Maximum of items returned
  .paginate(10); // in pages of 10 items

while (paginator.hasNextPage()) {
  const { items, lastKey } = await paginator.getNextPage();
  processBatch(items);
}
```

## 🛡️ Type-Safe Query Building

Dyno-table provides a comprehensive query DSL that matches DynamoDB's capabilities while maintaining type safety:

| Operation                  | Method Example                           |
|----------------------------|------------------------------------------|
| **Conditional Updates**    | `.whereEquals("status", "ACTIVE")`       |
| **Attribute Existence**    | `.whereExists("migrationPath")`          |
| **Begins With**            | `.whereBeginsWith("sk", "PROFILE#2023")` |
| **Nested Attributes**      | `.whereEquals("address.city", "London")` |
| **Between Values**         | `.whereBetween("age", 18, 65)`           |
| **Type Checks**            | `.whereAttributeType("score", "N")`      |

```ts
// Complex type-safe query example
const results = await dinoRepo
  .query({
    pk: "SPECIES#carnivore",
    sk: { operator: "between", start: "PROFILE#100", end: "PROFILE#200" }
  })
  .whereBeginsWith("discoverySite", "Canada")
  .whereAttributeType("mass", "N")
  .whereGreaterThanOrEqual("length", 8.5)
  .useIndex("GSI1")
  .execute();
```

## 🏗️ Repository Pattern Best Practices

The repository implementation provides automatic type isolation:

```ts
// All operations are automatically scoped to DINOSAUR type
const dinosaur = await dinoRepo.get(key); 
// Returns Dinosaur | null

// Type-safe updates
await dinoRepo.update(key)
  .set("diet", "herbivore") // Autocomplete for Dinosaur properties
  .execute();

// Cross-type operations are prevented at compile time
dinoRepo.put({ /* invalid shape */ }); // TypeScript error
```

**Key benefits:**
- 🚫 Prevents accidental cross-type data access
- 🔍 Automatically filters queries/scans to repository type
- 🛡️ Ensures consistent key structure across entities
- 📦 Encapsulates domain-specific query logic

## 🚨 Error Handling - TODO

Dyno-table provides enhanced error handling for DynamoDB operations:

Taking DynamoDB errors and adding additional context specific to the operation and entity. To allow easier debugging and handling of errors.

```ts
try {
  await dinoRepo.put(existingDino)
    .whereNotExists("pk")
    .execute();
} catch (error) {
  if (error instanceof ConditionalCheckFailedError) {
    // Handle conditional failure
    console.log("Dinosaur already exists!");
  }
  
  if (error instanceof TransactionCanceledException) {
    // Inspect transaction cancellation reasons
    error.cancellationReasons?.forEach(reason => {
      console.log(`Transaction failed: ${reason.Code}`);
    });
  }
}
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
