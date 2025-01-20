# 🚀 dyno-table

A powerful, type-safe, and fluent DynamoDB table abstraction layer for Node.js applications.

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

## 🚀 Getting Started

### Setting Up the Table

First, set up the `Table` instance with your DynamoDB client and table configuration.

```ts
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Table } from "dyno-table";
import { docClient } from "./ddb-client"; // Your DynamoDB client instance

const table = new Table({
  client: docClient,
  tableName: "YourTableName",
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
const item = {
  pk: "USER#123",
  sk: "PROFILE#123",
  name: "John Doe",
  email: "john@example.com",
  age: 30,
  type: "USER",
};

await table.put(item).execute();

// Conditional put
await table
  .put(item)
  .whereNotExists("pk")  // Only insert if item doesn't exist
  .whereNotExists("sk")
  .execute();
```

#### Read (Get)

```ts
const key = { pk: "USER#123", sk: "PROFILE#123" };
const result = await table.get(key);
console.log(result);

// Get with specific index
const result = await table.get(key, { indexName: "GSI1" });
```

#### Update

```ts
// Simple update
const updates = { email: "john.doe@example.com", age: 31 };
await table.update(key).setMany(updates).execute();

// Advanced update operations
await table
  .update(key)
  .set("email", "new@example.com")       // Set a single field
  .set({ age: 32, name: "John" })        // Set multiple fields
  .remove("optional_field")              // Remove fields
  .increment("visits", 1)                // Increment a number
  .whereEquals("age", 31)                // Conditional update
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
  .whereEquals("type", "USER")
  .execute();
```

### Query Operations

```ts
// Basic query
const result = await table
  .query({ pk: "USER#123" })
  .execute();

// Advanced query with conditions
const result = await table
  .query({
    pk: "USER#123",
    sk: { operator: "begins_with", value: "PROFILE#" }
  })
  .where("type", "=", "USER")
  .whereGreaterThan("age", 25)
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
  .whereEquals("type", "USER")
  .where("age", ">", 25)
  .limit(20)
  .execute();

// Scan supports all the same conditions as Query operations
```

### Batch Operations

```ts
// Batch write (put)
const items = [
  { pk: "USER#123", sk: "PROFILE#123", name: "John Doe" },
  { pk: "USER#124", sk: "PROFILE#124", name: "Jane Doe" },
];

await table.batchWrite(
  items.map((item) => ({ type: "put", item }))
);

// Batch write (delete)
await table.batchWrite([
  { type: "delete", key: { pk: "USER#123", sk: "PROFILE#123" } },
  { type: "delete", key: { pk: "USER#124", sk: "PROFILE#124" } },
]);

// Batch operations automatically handle chunking for large datasets
```

### Transaction Operations

Two ways to perform transactions:

#### Using withTransaction

```ts
await table.withTransaction(async (trx) => {
  table.put(item1).withTransaction(trx);
  table.put(item2).withTransaction(trx);
  table.delete(key3).withTransaction(trx);
});
```

#### Using TransactionBuilder

```ts
const transaction = new TransactionBuilder();

transaction
  .addOperation({
    put: { item: item1 }
  })
  .addOperation({
    put: { item: item2 }
  })
  .addOperation({
    delete: { key: key3 }
  });

await table.transactWrite(transaction);
```

### Repository Pattern

Create a repository by extending the `BaseRepository` class.

```ts
import { BaseRepository } from "dyno-table";

type UserRecord = {
  id: string;
  name: string;
  email: string;
  age: number;
};

class UserRepository extends BaseRepository<UserRecord> {
  protected createPrimaryKey(data: UserRecord) {
    return {
      pk: `USER#${data.id}`,
      sk: `PROFILE#${data.id}`,
    };
  }

  protected getType() {
    return "USER";
  }

  /**
   * This allows dyno-table to work in a single table design
   */
  protected getTypeAttributeName(): string {
    return "_type";
  }
}

const userRepository = new UserRepository(table);
```

Use the repository for CRUD operations:

```ts
// Create
const user = { id: "123", name: "John Doe", email: "john@example.com", age: 30 };
await userRepository.create(user).execute();

// Read
const user = await userRepository.findOne({ pk: "USER#123", sk: "PROFILE#123" });

// Update
await userRepository.update({ pk: "USER#123", sk: "PROFILE#123" }, { age: 31 });

// Delete
await userRepository.delete({ pk: "USER#123", sk: "PROFILE#123" }).execute();
```

## Contributing 🤝

### Developing

```bash
# Installing the dependencies
pnpm i

# Installing the peerDependencies manually
pnpm i @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

### Testing

```bash
docker run -p 8000:8000 amazon/dynamodb-local
```
