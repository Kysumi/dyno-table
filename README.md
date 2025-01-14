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
const item = {
  pk: "USER#123",
  sk: "PROFILE#123",
  name: "John Doe",
  email: "john@example.com",
  age: 30,
  type: "USER",
};

await table.put(item).execute();
```

#### Read (Get)

```ts
const key = { pk: "USER#123", sk: "PROFILE#123" };
const result = await table.get(key);
console.log(result);
```

#### Update

```ts
const updates = { email: "john.doe@example.com", age: 31 };
await table.update(key).setMany(updates).execute();
```

#### Delete

```ts
await table.delete(key).execute();
```

### Query Operations

```ts
const result = await table
  .query({ pk: "USER#123" })
  .where("type", "=", "USER")
  .execute();

console.log(result.Items);
```

### Scan Operations

```ts
const result = await table.scan().whereEquals("type", "USER").execute();
console.log(result.Items);
```

### Batch Operations

```ts
const items = [
  { pk: "USER#123", sk: "PROFILE#123", name: "John Doe" },
  { pk: "USER#124", sk: "PROFILE#124", name: "Jane Doe" },
];

await table.batchWrite(
  items.map((item) => ({ type: "put", item })),
);
```

### Transaction Operations

```ts
await table.withTransaction(async (trx) => {
  table.put({ pk: "USER#123", sk: "PROFILE#123", name: "John Doe" }).withTransaction(trx);
  table.put({ pk: "USER#124", sk: "PROFILE#124", name: "Jane Doe" }).withTransaction(trx);
});
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
  * This allows allows dyno-table to work in a singe table design
  */
  protected getTypeAttributeName(): string {
    return "_type";
  }
}

const userRepository = new UserRepository(table);
```

Use the repository for CRUD operations.

```ts
const user = { id: "123", name: "John Doe", email: "john@example.com", age: 30 };
await userRepository.create(user).execute();

const retrievedUser = await userRepository.findOne({ pk: "USER#123", sk: "PROFILE#123" });
console.log(retrievedUser);

await userRepository.update({ pk: "USER#123", sk: "PROFILE#123" }, { age: 31 });

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
