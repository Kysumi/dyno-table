# dyno-table

A modern, type-safe DynamoDB ORM for TypeScript applications with powerful single-table design patterns and schema validation.

[![npm version](https://img.shields.io/npm/v/dyno-table.svg)](https://www.npmjs.com/package/dyno-table)
[![npm downloads](https://img.shields.io/npm/dm/dyno-table.svg)](https://www.npmjs.com/package/dyno-table)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.0%2B-blue?logo=typescript)](https://www.typescriptlang.org/)

## Why dyno-table?

- 🛡️ **Type Safety First** - Complete TypeScript integration with automatic type inference
- 🏗️ **Schema Validation** - Built-in support for Zod, ArkType, Valibot, and other Standard Schema libraries
- 🎯 **Semantic Queries** - Write `getUserByEmail()` instead of cryptic `gsi1` references
- ⚡ **Zero Learning Curve** - If you know DynamoDB, you know dyno-table
- 🔍 **Field Selection** - Type-safe projections with automatic type inference
- 📦 **Single-Table Design** - Built for DynamoDB best practices from day one
- 🔄 **Repository Pattern** - Clean separation between data access and business logic

## Installation

```bash
npm install dyno-table @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

**Peer Dependencies**: Requires AWS SDK v3 for DynamoDB operations.

## Quick Start

### 1. Set up your DynamoDB client

```ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Table } from "dyno-table/table";

const client = new DynamoDBClient({ region: "us-west-2" });
const docClient = DynamoDBDocument.from(client);

const table = new Table({
  client: docClient,
  tableName: "MyTable",
  indexes: {
    partitionKey: "pk",
    sortKey: "sk",
  },
});
```

### 2. Define your schema and entity

```ts
import { z } from "zod";
import { defineEntity, createIndex } from "dyno-table/entity";

// Define your schema with validation
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  status: z.enum(["active", "inactive"]),
  createdAt: z.string().optional(), // Auto-generated
  updatedAt: z.string().optional(), // Auto-generated
});

type User = z.infer<typeof userSchema>;

// Create your entity
const UserEntity = defineEntity({
  name: "User",
  schema: userSchema,
  primaryKey: createIndex()
    .input(z.object({ id: z.string() }))
    .partitionKey(({ id }) => `USER#${id}`)
    .sortKey(() => "PROFILE"),
  queries: {},
});

// Get your repository
const userRepo = UserEntity.createRepository(table);
```

### 3. Start using your repository

```ts
// Create a user
const user = await userRepo.create({
  id: "123",
  name: "John Doe",
  email: "john@example.com",
  status: "active",
}).execute();

// Get a user
const foundUser = await userRepo.get({ id: "123" }).execute();

// Update a user
await userRepo.update(
  { id: "123" },
  { name: "Jane Doe" }
).execute();

// Delete a user
await userRepo.delete({ id: "123" }).execute();
```

That's it! You now have a fully type-safe, validated DynamoDB repository.

**Ready to build type-safe DynamoDB applications?** Start with our [5-minute quick start guide](docs/query-builder.md) or dive into the [Entity Pattern documentation](docs/entities.md).

## Core Concepts

### Entities vs Direct Table Access

dyno-table provides two approaches - choose what fits your needs:

#### Entity Pattern (Recommended)
High-level abstraction with schema validation and semantic queries:

```ts
// ✅ Entity Pattern - Type-safe, validated, semantic
const activeUsers = await userRepo.query
  .getActiveUsers()
  .execute();

const userProfile = await userRepo.get({ id: "123" })
  .select(["name", "email"])
  .execute();
```

#### Direct Table Access
Low-level control for simple operations:

```ts
// Direct table access - More control, less safety
const items = await table
  .query({ pk: "USER#123" })
  .filter((op) => op.eq("status", "active"))
  .execute();
```

### Type-Safe Field Selection

Get exactly what you need with automatic type inference:

```ts
// Select specific fields - TypeScript knows the result type
const profiles = await userRepo.scan()
  .select(["name", "email", "metadata.preferences"])
  .execute();

for await (const profile of profiles) {
  console.log(profile.name);    // ✅ string
  console.log(profile.email);   // ✅ string
  console.log(profile.metadata.preferences); // ✅ nested object
  // console.log(profile.id);   // ❌ TypeScript error - not selected
}
```

### Query Building

Fluent, chainable API for complex operations:

```ts
// Simple query
const users = await table
  .query({ pk: "USER#active" })
  .execute();

// Complex query with filters and pagination
const results = await table
  .query({ pk: "PRODUCT#electronics" })
  .filter((op) =>
    op.and(
      op.gt("price", 100),
      op.eq("inStock", true)
    )
  )
  .limit(20)
  .execute();

// Stream large results efficiently
for await (const product of results) {
  console.log(product.name);
  // Process one item at a time - memory efficient
}
```

## Advanced Examples

### Semantic Queries with Entities

```ts
import { createQueries } from "dyno-table/entity";

const createQuery = createQueries<User>();

const UserEntity = defineEntity({
  name: "User",
  schema: userSchema,
  primaryKey: primaryKey,
  indexes: {
    byStatus: createIndex()
      .input(userSchema)
      .partitionKey(({ status }) => `STATUS#${status}`)
      .sortKey(({ createdAt }) => createdAt),
    byEmail: createIndex()
      .input(userSchema)
      .partitionKey(({ email }) => `EMAIL#${email}`)
      .withoutSortKey(),
  },
  queries: {
    // Define semantic query methods
    getActiveUsers: createQuery
      .input(z.object({}))
      .query(({ entity }) =>
        entity.query({ pk: "STATUS#active" }).useIndex("byStatus")
      ),

    getUserByEmail: createQuery
      .input(z.object({ email: z.string().email() }))
      .query(({ input, entity }) =>
        entity.query({ pk: `EMAIL#${input.email}` }).useIndex("byEmail")
      ),
  },
});

// Usage - clear, validated, type-safe
const activeUsers = await userRepo.query.getActiveUsers().execute();
const user = await userRepo.query.getUserByEmail({
  email: "john@example.com"
}).execute();
```

### Transactions and Batch Operations

```ts
// ACID transactions
await table.transaction((tx) => {
  userRepo.create(newUser).withTransaction(tx);
  userRepo.update({ id: "456" }, { status: "inactive" }).withTransaction(tx);
  userRepo.delete({ id: "789" }).withTransaction(tx);
});

// Batch operations with automatic chunking
await table.batchWrite((batch) => {
  users.forEach(user => {
    userRepo.create(user).withBatch(batch);
  });
});
```

### Schema Evolution

```ts
// Start simple
const userSchemaV1 = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

// Evolve with defaults for backward compatibility
const userSchemaV2 = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  status: z.enum(["active", "inactive"]).default("active"), // New field with default
  preferences: z.object({
    theme: z.enum(["light", "dark"]).default("light"),
    notifications: z.boolean().default(true),
  }).default({ theme: "light", notifications: true }), // New nested object
});
```

## Documentation

### 📚 Complete Guides
- **[Query Builder Guide](docs/query-builder.md)** - Complete guide to queries, filters, pagination, and optimization
- **[Entity Pattern Guide](docs/entities.md)** - Schema validation, semantic queries, and advanced entity features

### 🚀 Examples
- **[Entity Pattern Example](examples/entity-example/)** - Complete entity setup with schema validation
- **[Basic Table Operations](examples/)** - Simple CRUD operations
- **[Advanced Queries](examples/)** - Complex filtering and pagination

## Schema Library Support

Works with any Standard Schema library:

```ts
// Zod
import { z } from "zod";
const zodSchema = z.object({ name: z.string() });

// ArkType
import { type } from "arktype";
const arkSchema = type({ name: "string" });

// Valibot
import * as v from "valibot";
const valibotSchema = v.object({ name: v.string() });

// All work with defineEntity
const Entity = defineEntity({
  name: "MyEntity",
  schema: zodSchema, // or arkSchema, or valibotSchema
  // ... rest of config
});
```

### Development Setup

```bash
# Install dependencies
pnpm install

# Start local DynamoDB for testing
pnpm run ddb:start
pnpm run local:setup

# Run tests
pnpm test

# Run integration tests
pnpm test:int

# Build the project
pnpm build
```

### Testing

- `pnpm test` - Unit tests
- `pnpm test:int` - Integration tests (requires local DynamoDB)
- `pnpm run format` - Format code
- `pnpm run lint` - Lint code
- `pnpm run check-types` - Type check

## License

MIT © [dyno-table contributors](LICENSE)

---
