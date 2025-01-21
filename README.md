# 🦖 dyno-table

A powerful, type-safe, and fluent DynamoDB table abstraction layer for Node.js applications.

Allows you to work with DynamoDB in a single table design pattern

## ✨ Features

- **Type-safe operations**: Ensures type safety for all DynamoDB operations.
- **Builders for operations**: Provides builders for put, update, delete, query, and scan operations.
- **Transaction support**: Supports transactional operations.
- **Batch operations**: Handles batch write operations with automatic chunking for large datasets.
- **Conditional operations**: Supports conditional puts, updates, and deletes.
- **Repository pattern**: Provides a base repository class for implementing the repository pattern.
- **Error handling**: Custom error classes for handling DynamoDB errors gracefully.

## 📦 Installation

Get started with Dyno Table by installing it via npm:

```bash
npm install dyno-table
```

## 🦕 Getting Started

### Setting Up the Table

First, set up the `Table` instance with your DynamoDB client and table configuration.

```ts
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Table } from "dyno-table";
import { docClient } from "./ddb-client"; // Your DynamoDB client instance

const table = new Table({
  client: docClient,
  tableName: "DinoTable",
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

### CRUD Operations

#### Create (Put)

```ts
// Simple put
const dino = {
  pk: "SPECIES#trex",
  sk: "PROFILE#001",
  name: "Rex",
  diet: "Carnivore",
  length: 40,
  type: "DINOSAUR",
};

await table.put(dino).execute();

// Conditional put
await table
  .put(dino)
  .whereNotExists("pk")  // Only insert if dinosaur doesn't exist
  .whereNotExists("sk")
  .execute();
```

#### Read (Get)

```ts
const key = { pk: "SPECIES#trex", sk: "PROFILE#001" };
const result = await table.get(key);
console.log(result);

// Get with specific index
const result = await table.get(key, { indexName: "GSI1" });
```

#### Update

```ts
// Simple update
const updates = { length: 42, diet: "Carnivore" };
await table.update(key).setMany(updates).execute();

// Advanced update operations
await table
  .update(key)
  .set("diet", "Omnivore")              // Set a single field
  .set({ length: 45, name: "Rexy" })    // Set multiple fields
  .remove("optional_field")              // Remove fields
  .increment("sightings", 1)             // Increment a number
  .whereEquals("length", 42)             // Conditional update
  .execute();
```

#### Delete

```ts
// Simple delete
await table.delete(key).execute();

// Conditional delete
await table
  .delete(key)
  .whereExists("pk")
  .whereEquals("type", "DINOSAUR")
  .execute();
```

### Query Operations

```ts
// Basic query
const result = await table
  .query({ pk: "SPECIES#trex" })
  .execute();

// Advanced query with conditions
const result = await table
  .query({
    pk: "SPECIES#velociraptor",
    sk: { operator: "begins_with", value: "PROFILE#" }
  })
  .where("type", "=", "DINOSAUR")
  .whereGreaterThan("length", 6)
  .limit(10)
  .useIndex("GSI1")
  .execute();

// Available query conditions:
// .where(field, operator, value)        // Generic condition
// .whereEquals(field, value)            // Equality check
// .whereBetween(field, start, end)      // Range check
// .whereIn(field, values)               // IN check
// .whereLessThan(field, value)          // < check
// .whereLessThanOrEqual(field, value)   // <= check
// .whereGreaterThan(field, value)       // > check
// .whereGreaterThanOrEqual(field, value) // >= check
// .whereNotEqual(field, value)          // <> check
// .whereBeginsWith(field, value)        // begins_with check
// .whereContains(field, value)          // contains check
// .whereNotContains(field, value)       // not_contains check
// .whereExists(field)                   // attribute_exists check
// .whereNotExists(field)                // attribute_not_exists check
// .whereAttributeType(field, type)      // attribute_type check
```

### Scan Operations

```ts
// Basic scan
const result = await table.scan().execute();

// Filtered scan
const result = await table
  .scan()
  .whereEquals("type", "DINOSAUR")
  .where("length", ">", 20)
  .limit(20)
  .execute();

// Scan supports all the same conditions as Query operations
```

### Batch Operations

```ts
// Batch write (put)
const dinos = [
  { pk: "SPECIES#trex", sk: "PROFILE#001", name: "Rex", length: 40 },
  { pk: "SPECIES#raptor", sk: "PROFILE#001", name: "Blue", length: 6 },
];

await table.batchWrite(
  dinos.map((dino) => ({ type: "put", item: dino }))
);

// Batch write (delete)
await table.batchWrite([
  { type: "delete", key: { pk: "SPECIES#trex", sk: "PROFILE#001" } },
  { type: "delete", key: { pk: "SPECIES#raptor", sk: "PROFILE#001" } },
]);

// Batch operations automatically handle chunking for large datasets
```

### Transaction Operations

Two ways to perform transactions:

#### Using withTransaction

```ts
await table.withTransaction(async (trx) => {
  table.put(trex).withTransaction(trx);
  table.put(raptor).withTransaction(trx);
  table.delete(brontoKey).withTransaction(trx);
});
```

#### Using TransactionBuilder

```ts
const transaction = new TransactionBuilder();

transaction
  .addOperation({
    put: { item: trex }
  })
  .addOperation({
    put: { item: raptor }
  })
  .addOperation({
    delete: { key: brontoKey }
  });

await table.transactWrite(transaction);
```

## Repository Pattern

Create a repository by extending the `BaseRepository` class.

```ts
import { BaseRepository } from "dyno-table";

type DinoRecord = {
  id: string;
  name: string;
  diet: string;
  length: number;
};

class DinoRepository extends BaseRepository<DinoRecord> {
  protected createPrimaryKey(data: DinoRecord) {
    return {
      pk: `SPECIES#${data.id}`,
      sk: `PROFILE#${data.id}`,
    };
  }

  protected getType() {
    return "DINOSAUR";
  }

  // Add custom methods
  async findByDiet(diet: string) {
    return this.scan()
      .whereEquals("diet", diet)
      .execute();
  }

  async findLargerThan(length: number) {
    return this.scan()
      .whereGreaterThan("length", length)
      .execute();
  }
}
```

### Repository Operations

The repository pattern in dyno-table not only provides a clean abstraction but also ensures data isolation through type-scoping. All operations available on the `Table` class are also available on your repository, but they're automatically scoped to the repository's type.

```ts
const dinoRepo = new DinoRepository(table);

// Query all T-Rexes - automatically includes type="DINOSAUR" condition
const rexes = await dinoRepo
  .query({ pk: "SPECIES#trex" })
  .execute();

// Scan for large carnivores - automatically includes type="DINOSAUR"
const largeCarnivores = await dinoRepo
  .scan()
  .whereEquals("diet", "Carnivore")
  .whereGreaterThan("length", 30)
  .execute();

// Put operation, the type attribute is automatically along with the primary key/secondary key is created
await dinoRepo.create({
  id: "trex",
  name: "Rex",
  diet: "Carnivore",
  length: 40
}).execute();

// Update operation
await dinoRepo
  .update({ pk: "SPECIES#trex", sk: "PROFILE#001" })
  .set("diet", "Omnivore")
  .execute();

// Delete operation
await dinoRepo
  .delete({ pk: "SPECIES#trex", sk: "PROFILE#001" })
  .execute();
```

This type-scoping ensures that:
- Each repository only accesses its own data type
- Queries automatically include type filtering
- Put operations automatically include the type attribute
- Updates and deletes are constrained to the correct type

This pattern is particularly useful in single-table designs where multiple entity types share the same table. Each repository provides a type-safe, isolated view of its own data while preventing accidental cross-type operations.

## Contributing 🤝
```bash
# Installing the dependencies
pnpm i

# Installing the peerDependencies manually
pnpm i @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

### Developing

```bash
docker run -p 8000:8000 amazon/dynamodb-local
```