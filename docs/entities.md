# dyno-table Entity Pattern Guide

The Entity Pattern in dyno-table provides a high-level abstraction over DynamoDB operations with schema validation, type safety, and semantic query methods. This guide covers everything you need to know about using entities effectively in your applications.

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Schema Definition](#schema-definition)
- [Index Configuration](#index-configuration)
- [Entity Configuration](#entity-configuration)
- [Repository Operations](#repository-operations)
- [Custom Queries](#custom-queries)
- [Timestamps and Metadata](#timestamps-and-metadata)
- [Advanced Features](#advanced-features)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [Migration Guide](#migration-guide)

## Overview

The Entity Pattern provides:

- **Schema Validation**: Works with any Standard Schema library (Zod, ArkType, Valibot)
- **Type Safety**: Full TypeScript support with automatic type inference
- **Semantic Queries**: Meaningful method names like `getUserByEmail()` instead of cryptic `gsi1`
- **Automatic Key Generation**: Handles partition and sort key creation automatically
- **Index Management**: Automatic GSI key generation and updates
- **Timestamp Management**: Automatic `createdAt` and `updatedAt` handling
- **Repository Pattern**: Clean separation between data access and business logic

### Why Use the Entity Pattern?

```ts
// ❌ Without entities: Cryptic, error-prone, no validation
const users = await table
  .query({ pk: "STATUS#active" })
  .useIndex("gsi1")
  .execute();

// ✅ With entities: Clear intent, type-safe, validated
const activeUsers = await userRepo.query
  .getActiveUsers()
  .execute();
```

## Getting Started

### Basic Entity Setup

```ts
import { z } from "zod";
import { defineEntity, createIndex, createQueries } from "dyno-table/entity";

// 1. Define your schema
const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  status: z.enum(["active", "inactive", "suspended"]),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// 2. Define types
type User = z.infer<typeof userSchema>;

// 3. Create primary key index
const primaryKey = createIndex()
  .input(z.object({ id: z.string() }))
  .partitionKey(({ id }) => `USER#${id}`)
  .sortKey(() => "PROFILE");

// 4. Define the entity
const UserEntity = defineEntity({
  name: "User",
  schema: userSchema,
  primaryKey,
  queries: {},
});

// 5. Create repository
const userRepo = UserEntity.createRepository(table);
```

### Standard Schema Support

dyno-table works with any library that implements the Standard Schema interface:

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

// All can be used with defineEntity
const Entity = defineEntity({
  name: "MyEntity",
  schema: zodSchema, // or arkSchema, or valibotSchema
  // ... rest of config
});
```

## Schema Definition

### Input vs Output Types

Schemas can define different input and output types, useful for defaults and transformations:

```ts
const dinosaurSchema = z.object({
  id: z.string(),
  species: z.string(),
  name: z.string(),
  weight: z.number().positive().default(1), // Default value
  status: z.enum(["active", "inactive"]),
  createdAt: z.string().optional(), // Auto-generated
});

// Input type (for create operations - weight is optional due to default)
type DinosaurInput = z.input<typeof dinosaurSchema>;

// Output type (what exists in database - weight is required after defaults)
type Dinosaur = z.output<typeof dinosaurSchema>;

const DinosaurEntity = defineEntity({
  name: "Dinosaur",
  schema: dinosaurSchema,
  // ... configuration
});

// Usage
await repo.create({
  id: "dino-001",
  species: "T-Rex",
  name: "Rexy",
  // weight is optional here due to default
  status: "active"
}); // DinosaurInput type

const dinosaur = await repo.get({ id: "dino-001" });
console.log(dinosaur.weight); // number (required in output type)
```

### Schema Validation Features

```ts
const productSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  price: z.number().positive(),
  category: z.enum(["electronics", "books", "clothing"]),
  tags: z.array(z.string()).default([]),
  metadata: z.object({
    rating: z.number().min(0).max(5).optional(),
    reviews: z.number().int().min(0).default(0),
  }),
  // Computed fields
  searchText: z.string().transform((_, ctx) => {
    const product = ctx.parent as any;
    return `${product.name} ${product.category}`.toLowerCase();
  }),
});

type Product = z.infer<typeof productSchema>;

const ProductEntity = defineEntity({
  name: "Product",
  schema: productSchema,
  // ... configuration
});
```

## Index Configuration

### Primary Key Configuration

```ts
// Simple primary key (partition key only)
const simpleKey = createIndex()
  .input(z.object({ id: z.string() }))
  .partitionKey(({ id }) => `USER#${id}`)
  .withoutSortKey();

// Composite primary key (partition + sort key)
const compositeKey = createIndex()
  .input(z.object({ userId: z.string(), orderId: z.string() }))
  .partitionKey(({ userId }) => `USER#${userId}`)
  .sortKey(({ orderId }) => `ORDER#${orderId}`);

// Using utility functions for consistent key patterns
import { partitionKey, sortKey } from "dyno-table/utils";

const userPK = partitionKey`USER#${"id"}`;
const orderSK = sortKey`ORDER#${"orderId"}#DATE#${"createdAt"}`;

const orderKey = createIndex()
  .input(z.object({ id: z.string(), orderId: z.string(), createdAt: z.string() }))
  .partitionKey(({ id }) => userPK({ id }))
  .sortKey(({ orderId, createdAt }) => orderSK({ orderId, createdAt }));
```

### Global Secondary Index (GSI) Configuration

```ts
const UserEntity = defineEntity({
  name: "User",
  schema: userSchema,
  primaryKey: primaryKey,
  indexes: {
    // Status-based access pattern
    byStatus: createIndex()
      .input(userSchema)
      .partitionKey(({ status }) => `STATUS#${status}`)
      .sortKey(({ createdAt }) => createdAt),

    // Department-based access pattern
    byDepartment: createIndex()
      .input(userSchema)
      .partitionKey(({ department }) => `DEPT#${department}`)
      .sortKey(({ name }) => name),

    // Email lookup (unique)
    byEmail: createIndex()
      .input(userSchema)
      .partitionKey(({ email }) => `EMAIL#${email}`)
      .withoutSortKey(),

    // Read-only index (not updated on writes)
    analytics: createIndex()
      .input(userSchema)
      .partitionKey(({ status }) => `ANALYTICS#${status}`)
      .sortKey(({ lastLoginAt }) => lastLoginAt || "1970-01-01")
      .readOnly(true), // Won't be updated on writes
  },
  queries: {},
});
```

### Index Design Patterns

```ts
// Pattern 1: Hierarchical Access
const hierarchicalIndex = createIndex()
  .input(z.object({
    tenantId: z.string(),
    orgId: z.string(),
    userId: z.string()
  }))
  .partitionKey(({ tenantId }) => `TENANT#${tenantId}`)
  .sortKey(({ orgId, userId }) => `ORG#${orgId}#USER#${userId}`);

// Pattern 2: Time-series Data
const timeSeriesIndex = createIndex()
  .input(z.object({
    deviceId: z.string(),
    timestamp: z.string()
  }))
  .partitionKey(({ deviceId }) => `DEVICE#${deviceId}`)
  .sortKey(({ timestamp }) => timestamp); // ISO format for lexical sorting

// Pattern 3: Multi-tenant with Status
const multiTenantIndex = createIndex()
  .input(z.object({
    tenantId: z.string(),
    status: z.string(),
    priority: z.number()
  }))
  .partitionKey(({ tenantId, status }) => `TENANT#${tenantId}#STATUS#${status}`)
  .sortKey(({ priority }) => priority.toString().padStart(3, '0')); // Zero-pad for lexical sorting
```

## Entity Configuration

### Complete Entity Configuration

```ts
const UserEntity = defineEntity({
  name: "User",
  schema: userSchema,
  primaryKey: primaryKey,
  indexes: {
    byStatus: statusIndex,
    byDepartment: departmentIndex,
  },
  queries: {
    getActiveUsers: createQuery
      .input(z.object({}))
      .query(({ entity }) =>
        entity.query({ pk: "STATUS#active" }).useIndex("byStatus")
      ),

    getUsersByDepartment: createQuery
      .input(z.object({ department: z.string() }))
      .query(({ input, entity }) =>
        entity.query({ pk: `DEPT#${input.department}` }).useIndex("byDepartment")
      ),
  },
  settings: {
    entityTypeAttributeName: "entityType", // Default: "entityType"
    timestamps: {
      createdAt: {
        format: "ISO", // or "UNIX"
        attributeName: "createdAt", // Default: "createdAt"
      },
      updatedAt: {
        format: "ISO", // or "UNIX"
        attributeName: "updatedAt", // Default: "updatedAt"
      },
    },
  },
});
```

### Settings Configuration

#### Entity Type Attribute

```ts
const settings = {
  entityTypeAttributeName: "type", // Custom attribute name
};

// Results in items like:
// { pk: "USER#123", sk: "PROFILE", type: "User", name: "John" }
```

#### Timestamp Configuration

```ts
const settings = {
  timestamps: {
    createdAt: {
      format: "ISO", // "2024-01-15T10:30:00.000Z"
      attributeName: "created",
    },
    updatedAt: {
      format: "UNIX", // 1705312200
      attributeName: "modified",
    },
  },
};
```

## Repository Operations

### Create Operations

```ts
// Create with automatic key generation and validation
const newUser = await userRepo.create({
  id: "user-123",
  name: "John Doe",
  email: "john@example.com",
  status: "active",
}).execute();

// Create with transaction
await table.transaction((tx) => {
  userRepo.create(userData).withTransaction(tx);
  // other operations...
});

// Create with batch
await table.batchWrite((batch) => {
  userRepo.create(user1).withBatch(batch);
  userRepo.create(user2).withBatch(batch);
});
```

### Upsert Operations

```ts
// Upsert (create or replace) - requires full key
const updatedUser = await userRepo.upsert({
  id: "user-123", // Required for key generation
  name: "John Smith",
  email: "johnsmith@example.com",
  status: "active",
  // All required fields must be provided
}).execute();
```

### Get Operations

```ts
// Get by primary key
const user = await userRepo.get({ id: "user-123" }).execute();

// Get with consistent read
const user = await userRepo.get({ id: "user-123" })
  .consistentRead(true)
  .execute();

// Get specific fields only
const userProfile = await userRepo.get({ id: "user-123" })
  .select(["name", "email", "status"])
  .execute();
```

### Update Operations

```ts
// Basic update
await userRepo.update(
  { id: "user-123" }, // Key
  { name: "John Smith" } // Update data
).execute();

// Update with atomic operations
await userRepo.update(
  { id: "user-123" },
  {}
)
.set("name", "John Smith")
.add("loginCount", 1)
.remove("temporaryField")
.execute();

// Conditional update
await userRepo.update(
  { id: "user-123" },
  { status: "inactive" }
)
.condition((op) => op.eq("status", "active"))
.execute();

// Update with timestamp handling
// updatedAt is automatically set when timestamps are configured
await userRepo.update(
  { id: "user-123" },
  { name: "New Name" }
).execute(); // updatedAt automatically updated
```

### Delete Operations

```ts
// Simple delete
await userRepo.delete({ id: "user-123" }).execute();

// Conditional delete
await userRepo.delete({ id: "user-123" })
  .condition((op) => op.eq("status", "inactive"))
  .execute();

// Delete in transaction
await table.transaction((tx) => {
  userRepo.delete({ id: "user-123" }).withTransaction(tx);
});
```

### Scan Operations

```ts
// Scan all entities of this type
const allUsers = await userRepo.scan().execute();

// Scan with filters
const activeUsers = await userRepo.scan()
  .filter((op) => op.eq("status", "active"))
  .execute();

// Scan with pagination
const paginator = userRepo.scan()
  .filter((op) => op.eq("department", "engineering"))
  .paginate(50);

while (paginator.hasNextPage()) {
  const page = await paginator.getNextPage();
  console.log(`Found ${page.items.length} engineers`);
}
```

## Custom Queries

### Defining Custom Queries

```ts
const createQuery = createQueries<User>();

const queries = {
  // Simple query
  getActiveUsers: createQuery
    .input(z.object({}))
    .query(({ entity }) =>
      entity.query({ pk: "STATUS#active" }).useIndex("byStatus")
    ),

  // Parameterized query
  getUsersByDepartment: createQuery
    .input(z.object({ department: z.string() }))
    .query(({ input, entity }) =>
      entity.query({ pk: `DEPT#${input.department}` }).useIndex("byDepartment")
    ),

  // Complex query with multiple conditions
  getActiveUsersInDepartment: createQuery
    .input(z.object({
      department: z.string(),
      minCreatedDate: z.string().optional()
    }))
    .query(({ input, entity }) => {
      let query = entity
        .query({ pk: `DEPT#${input.department}` })
        .useIndex("byDepartment")
        .filter((op) => op.eq("status", "active"));

      if (input.minCreatedDate) {
        query = query.filter((op) => op.gte("createdAt", input.minCreatedDate));
      }

      return query;
    }),

  // Scan-based query
  searchByName: createQuery
    .input(z.object({ namePrefix: z.string() }))
    .query(({ input, entity }) =>
      entity.scan().filter((op) => op.beginsWith("name", input.namePrefix))
    ),

  // Get operation
  getUserByEmail: createQuery
    .input(z.object({ email: z.string().email() }))
    .query(({ input, entity }) =>
      entity.get({ email: input.email }) // Uses byEmail index
    ),
};

const UserEntity = defineEntity({
  name: "User",
  schema: userSchema,
  primaryKey: primaryKey,
  indexes: { /* ... */ },
  queries: queries,
});
```

### Using Custom Queries

```ts
const userRepo = UserEntity.createRepository(table);

// Simple query usage
const activeUsers = await userRepo.query
  .getActiveUsers()
  .execute();

// Parameterized query usage
const engineers = await userRepo.query
  .getUsersByDepartment({ department: "engineering" })
  .execute();

// Query with additional runtime filters
const seniorEngineers = await userRepo.query
  .getUsersByDepartment({ department: "engineering" })
  .filter((op) => op.beginsWith("name", "Senior"))
  .limit(10)
  .execute();

// Query with field selection
const engineerNames = await userRepo.query
  .getUsersByDepartment({ department: "engineering" })
  .select(["name", "email"])
  .execute();
```

### Query Validation

Input parameters are automatically validated based on the schema:

```ts
// ✅ Valid input
await userRepo.query.getUsersByDepartment({
  department: "engineering"
});

// ❌ Validation error - missing required field
await userRepo.query.getUsersByDepartment({});
// Error: department is required

// ❌ Validation error - wrong type
await userRepo.query.getUsersByDepartment({
  department: 123
});
// Error: department must be a string
```

## Timestamps and Metadata

### Automatic Timestamps

```ts
const UserEntity = defineEntity({
  name: "User",
  schema: userSchema,
  primaryKey: primaryKey,
  queries: {},
  settings: {
    timestamps: {
      createdAt: {
        format: "ISO", // ISO string format
        attributeName: "createdAt",
      },
      updatedAt: {
        format: "UNIX", // Unix timestamp format
        attributeName: "modifiedAt",
      },
    },
  },
});

// Create operation - both timestamps added automatically
await userRepo.create({
  id: "user-123",
  name: "John Doe",
  email: "john@example.com",
  status: "active",
}).execute();
// Results in: { ..., createdAt: "2024-01-15T10:30:00.000Z", modifiedAt: 1705312200 }

// Update operation - only updatedAt is modified
await userRepo.update(
  { id: "user-123" },
  { name: "John Smith" }
).execute();
// Results in: { ..., createdAt: "2024-01-15T10:30:00.000Z", modifiedAt: 1705312250 }
```

### Custom Metadata

```ts
const UserEntity = defineEntity({
  name: "User",
  schema: userSchema,
  primaryKey: primaryKey,
  queries: {},
  settings: {
    entityTypeAttributeName: "type", // Custom entity type field
  },
});

// All items will include: { type: "User", ... }
```

### TTL Integration

```ts
// Schema with TTL field
const sessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  expiresAt: z.number(), // Unix timestamp for DynamoDB TTL
  data: z.record(z.unknown()),
});

const SessionEntity = defineEntity({
  name: "Session",
  schema: sessionSchema,
  primaryKey: createIndex()
    .input(z.object({ id: z.string() }))
    .partitionKey(({ id }) => `SESSION#${id}`)
    .withoutSortKey(),
  queries: {},
  settings: {
    timestamps: {
      createdAt: {
        format: "UNIX", // Use UNIX for TTL compatibility
      },
    },
  },
});

// Create session with TTL
await sessionRepo.create({
  id: "session-123",
  userId: "user-456",
  expiresAt: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
  data: { theme: "dark" },
}).execute();
```

## Advanced Features

### Conditional Operations

```ts
// Conditional create (fail if exists)
await userRepo.create(userData)
  .condition((op) => op.attributeNotExists("pk"))
  .execute();

// Conditional update (optimistic locking)
await userRepo.update(
  { id: "user-123" },
  { version: 2, name: "Updated Name" }
)
.condition((op) => op.eq("version", 1))
.execute();

// Conditional delete
await userRepo.delete({ id: "user-123" })
  .condition((op) => op.eq("status", "inactive"))
  .execute();
```

### Transactions with Entities

```ts
// Multi-entity transaction
await table.transaction((tx) => {
  // Create user
  userRepo.create({
    id: "user-123",
    name: "John Doe",
    email: "john@example.com",
    status: "active",
  }).withTransaction(tx);

  // Create user profile
  profileRepo.create({
    userId: "user-123",
    bio: "Software Engineer",
    avatar: "avatar-url",
  }).withTransaction(tx);

  // Update counter
  statsRepo.update(
    { type: "user-count" },
    {}
  ).add("count", 1).withTransaction(tx);
});
```

### Batch Operations with Entities

```ts
// Batch write operations
await table.batchWrite((batch) => {
  users.forEach(userData => {
    userRepo.create(userData).withBatch(batch);
  });
});

// Mixed batch operations
await table.batchWrite((batch) => {
  userRepo.create(newUser).withBatch(batch);
  userRepo.delete({ id: "old-user" }).withBatch(batch);
  profileRepo.create(newProfile).withBatch(batch);
});
```

### Index Updates

```ts
// Updates automatically maintain GSI consistency
await userRepo.update(
  { id: "user-123" },
  {
    status: "inactive", // Updates byStatus GSI
    department: "sales" // Updates byDepartment GSI
  }
).execute();

// Read-only indexes are not updated
const UserEntityWithReadOnlyIndex = defineEntity({
  name: "User",
  schema: userSchema,
  primaryKey: primaryKey,
  indexes: {
    analytics: createIndex()
      .input(userSchema)
      .partitionKey(({ status }) => `ANALYTICS#${status}`)
      .readOnly(true), // Won't be updated on writes
  },
  queries: {},
});
```

### Type-Safe Field Selection

```ts
// Select specific fields with automatic type inference
const userProfiles = await userRepo.scan()
  .select(["name", "email", "metadata.preferences"])
  .execute();

// TypeScript knows the result type:
for await (const profile of userProfiles) {
  console.log(profile.name);    // ✅ string
  console.log(profile.email);   // ✅ string
  console.log(profile.metadata.preferences); // ✅ nested object
  // console.log(profile.id);   // ❌ TypeScript error - not selected
}
```

## Error Handling

### Entity-Specific Errors

```ts
try {
  await userRepo.create(invalidUserData).execute();
} catch (error) {
  if (error.name === "ValidationError") {
    console.error("Schema validation failed:", error.message);
    console.error("Validation issues:", error.details.issues);
  } else if (error.name === "ConditionalCheckFailedException") {
    console.error("Conditional check failed - item might already exist");
  } else if (error.name === "EntityError") {
    console.error("Entity-specific error:", error.message);
    console.error("Entity type:", error.entityType);
  }
}
```

### Query Validation Errors

```ts
try {
  await userRepo.query.getUsersByDepartment({
    department: 123 // Invalid type
  });
} catch (error) {
  if (error.name === "ValidationError") {
    console.error("Query input validation failed:", error.message);
  }
}
```

### Index Generation Errors

```ts
try {
  await userRepo.create(userData).execute();
} catch (error) {
  if (error.name === "IndexingError") {
    console.error("Failed to generate index keys:", error.message);
    console.error("Index name:", error.indexName);
    console.error("Entity type:", error.entityType);
  }
}
```

## Best Practices

### Schema Design

```ts
// ✅ Good: Use specific, validated types
const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  status: z.enum(["active", "inactive", "suspended"]), // Restricted values
  age: z.number().int().min(0).max(150), // Reasonable constraints
  metadata: z.object({
    preferences: z.object({
      theme: z.enum(["light", "dark"]),
      notifications: z.boolean(),
    }),
  }),
});

// ❌ Avoid: Overly permissive schemas
const badSchema = z.object({
  id: z.string(), // Should be UUID
  email: z.string(), // Should validate email format
  status: z.string(), // Should be enum
  data: z.any(), // Too permissive
});
```

### Index Design

```ts
// ✅ Good: Design indexes for your access patterns
const indexes = {
  byStatus: createIndex()
    .input(userSchema)
    .partitionKey(({ status }) => `STATUS#${status}`)
    .sortKey(({ createdAt }) => createdAt), // Time-ordered

  byEmail: createIndex()
    .input(userSchema)
    .partitionKey(({ email }) => `EMAIL#${email}`)
    .withoutSortKey(), // Unique lookup

  byDepartmentAndRole: createIndex()
    .input(userSchema)
    .partitionKey(({ department }) => `DEPT#${department}`)
    .sortKey(({ role, name }) => `ROLE#${role}#NAME#${name}`), // Hierarchical
};

// ❌ Avoid: Indexes that don't match your queries
const badIndexes = {
  randomIndex: createIndex()
    .input(userSchema)
    .partitionKey(({ id }) => `USER#${id}`) // Same as primary key
    .sortKey(({ email }) => email), // Won't help with email lookups
};
```

### Query Design

```ts
// ✅ Good: Semantic, reusable queries
const queries = {
  getActiveUsers: createQuery
    .input(z.object({}))
    .query(({ entity }) =>
      entity.query({ pk: "STATUS#active" }).useIndex("byStatus")
    ),

  getUsersByDepartmentAndRole: createQuery
    .input(z.object({
      department: z.string(),
      role: z.string().optional()
    }))
    .query(({ input, entity }) => {
      const pk = `DEPT#${input.department}`;
      const query = entity.query({ pk }).useIndex("byDepartmentAndRole");

      if (input.role) {
        return query.filter((op) => op.beginsWith("sk", `ROLE#${input.role}`));
      }

      return query;
    }),
};

// ❌ Avoid: Generic, unclear queries
const badQueries = {
  query1: createQuery
    .input(z.any()) // No validation
    .query(({ input, entity }) =>
      entity.scan().filter((op) => op.eq("field1", input.value)) // Inefficient scan
    ),
};
```

### Performance Optimization

```ts
// ✅ Good: Use field selection for large items
const lightweightUsers = await userRepo.query
  .getActiveUsers()
  .select(["id", "name", "email"]) // Only essential fields
  .execute();

// ✅ Good: Use pagination for large result sets
const paginator = userRepo.scan()
  .paginate(100);

while (paginator.hasNextPage()) {
  const page = await paginator.getNextPage();
  await processBatch(page.items);
}

// ✅ Good: Use consistent reads only when necessary
const criticalData = await userRepo.get({ id: "user-123" })
  .consistentRead(true) // Only when absolutely needed
  .execute();

// ❌ Avoid: Loading large datasets into memory
const allUsers = await userRepo.scan()
  .execute()
  .then(iterator => iterator.toArray()); // Memory issue with large datasets
```

### Error Handling

```ts
// ✅ Good: Comprehensive error handling
async function createUser(userData: UserInput): Promise<User> {
  try {
    return await userRepo.create(userData).execute();
  } catch (error) {
    if (error.name === "ValidationError") {
      throw new Error(`Invalid user data: ${error.message}`);
    } else if (error.name === "ConditionalCheckFailedException") {
      throw new Error("User already exists");
    } else if (error.name === "ProvisionedThroughputExceededException") {
      // Implement retry logic
      await delay(1000);
      return createUser(userData);
    } else {
      // Log unexpected errors
      console.error("Unexpected error creating user:", error);
      throw new Error("Failed to create user");
    }
  }
}
```

## Migration Guide

### From Table Operations to Entities

```ts
// Before: Direct table operations
const users = await table
  .query({ pk: "STATUS#active" })
  .useIndex("gsi1")
  .filter((op) => op.eq("department", "engineering"))
  .execute();

// After: Entity pattern
const engineers = await userRepo.query
  .getActiveEngineers()
  .execute();

// The entity query provides:
// - Input validation
// - Clear semantic meaning
// - Type safety
// - Automatic entity type filtering
```

### Adding Entities to Existing Tables

```ts
// 1. Define entity for existing data structure
const LegacyUserEntity = defineEntity({
  name: "LegacyUser",
  schema: z.object({
    // Match existing fields exactly
    pk: z.string(),
    sk: z.string(),
    userId: z.string(),
    userName: z.string(),
    // ... other existing fields
  }),
  primaryKey: createIndex()
    .input(z.object({ pk: z.string(), sk: z.string() }))
    .partitionKey(({ pk }) => pk)
    .sortKey(({ sk }) => sk),
  queries: {},
  settings: {
    entityTypeAttributeName: "type", // Add entity type gradually
  },
});

// 2. Gradually migrate to semantic queries
const queries = {
  // Start with direct translations
  getUsersByStatus: createQuery
    .input(z.object({ status: z.string() }))
    .query(({ input, entity }) =>
      entity.scan().filter((op) => op.eq("userStatus", input.status))
    ),

  // Evolve to better patterns over time
  getActiveUsers: createQuery
    .input(z.object({}))
    .query(({ entity }) =>
      entity.scan().filter((op) => op.eq("userStatus", "ACTIVE"))
    ),
};
```

### Schema Evolution

```ts
// Version 1: Initial schema
const userSchemaV1 = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

// Version 2: Add optional fields with defaults
const userSchemaV2 = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  status: z.enum(["active", "inactive"]).default("active"), // New field with default
  preferences: z.object({
    theme: z.enum(["light", "dark"]).default("light"),
  }).default({ theme: "light" }), // New nested object with defaults
});

// Version 3: Transform existing data
const userSchemaV3 = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  status: z.enum(["active", "inactive", "suspended"]),
  profile: z.object({
    displayName: z.string().transform((_, ctx) => {
      // Transform from existing 'name' field
      const user = ctx.parent as any;
      return user.name || user.displayName;
    }),
    preferences: z.object({
      theme: z.enum(["light", "dark"]).default("light"),
    }),
  }),
});
```

This comprehensive guide covers all aspects of the dyno-table Entity Pattern. The combination of schema validation, type safety, semantic queries, and automatic key management makes it the recommended approach for production applications using dyno-table.
