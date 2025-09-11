# dyno-table Query Builder Guide

The dyno-table Query Builder provides a powerful, type-safe API for creating complex DynamoDB queries with a fluent, chainable interface. This guide covers all aspects of using the query builder effectively in your applications.

## Table of Contents

- [Basic Concepts](#basic-concepts)
- [Query vs Scan](#query-vs-scan)
- [Getting Started](#getting-started)
- [Key Conditions](#key-conditions)
- [Filter Conditions](#filter-conditions)
- [Type-Safe Field Selection](#type-safe-field-selection)
- [Using Indexes](#using-indexes)
- [Sorting and Ordering](#sorting-and-ordering)
- [Pagination](#pagination)
- [ResultIterator vs .toArray()](#resultiterator-vs-toarray)
- [Type Safety](#type-safety)
- [Performance Optimization](#performance-optimization)
- [Entity Query Builder](#entity-query-builder)
- [Advanced Examples](#advanced-examples)

## Basic Concepts

The dyno-table Query Builder is built around DynamoDB's native query and scan operations, providing:

- **Type safety**: All operations are fully typed based on your item schema
- **Fluent API**: Chain methods together for readable, expressive queries
- **Automatic optimization**: Handles expression building and parameter mapping
- **Pagination support**: Built-in pagination with automatic chunking
- **Index support**: Type-safe Global Secondary Index (GSI) operations
- **Field selection**: Type-safe projection with automatic type inference

### Core Components

```ts
import { Table } from "dyno-table/table";

// Table operations return query builders
const query = table.query({ pk: "USER#123" });
const scan = table.scan();
```

## Query vs Scan

Understanding when to use Query vs Scan is crucial for performance:

### Query Operations
- **Use when**: You know the partition key value
- **Performance**: Fast, efficient - only reads items with matching partition key
- **Cost**: Pay only for items examined
- **Scalability**: Excellent, regardless of table size

```ts
// Query: Get all orders for a specific user (efficient)
const userOrders = await table
  .query({ pk: "USER#123" })
  .execute();
```

### Scan Operations
- **Use when**: You need to examine all items or don't know the partition key
- **Performance**: Slower - reads entire table/index
- **Cost**: Pay for all items scanned, not just returned
- **Scalability**: Degrades as table grows

```ts
// Scan: Find all users with a specific status (less efficient)
const activeUsers = await table
  .scan()
  .filter((op) => op.eq("status", "active"))
  .execute();
```

## Getting Started

### Basic Table Setup

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
    gsis: {
      gsi1: {
        partitionKey: "gsi1pk",
        sortKey: "gsi1sk",
      },
      gsi2: {
        partitionKey: "gsi2pk",
        sortKey: "gsi2sk",
      },
    },
  },
});
```

### Basic Query Operations

```ts
// Simple query
const results = await table
  .query({ pk: "USER#123" })
  .execute();

// Iterate through results
for await (const item of results) {
  console.log(item);
}

// Or load all into memory (use carefully with large datasets)
const allItems = await results.toArray();
```

### Item Type Definition

Define your item types for full type safety:

```ts
interface User {
  pk: string;          // partition key
  sk: string;          // sort key
  id: string;
  name: string;
  email: string;
  status: "active" | "inactive" | "suspended";
  createdAt: string;
  metadata: {
    preferences: {
      notifications: boolean;
      theme: "light" | "dark";
    };
    billing: {
      plan: string;
      credits: number;
    };
  };
}

// Use the type in queries
const users = await table
  .query<User>({ pk: "USER#123" })
  .execute();
```

## Key Conditions

Key conditions define which items to retrieve based on partition and sort keys.

### Partition Key Conditions

The partition key condition is required and must be an equality check:

```ts
// Simple partition key query
await table.query({ pk: "USER#123" }).execute();

// With typed interface
await table.query<User>({ pk: "USER#123" }).execute();
```

### Sort Key Conditions

Sort key conditions are optional but enable powerful range queries:

```ts
// Exact match
await table.query({
  pk: "USER#123",
  sk: "ORDER#2024-001"
}).execute();

// Range queries using operators
await table.query({
  pk: "USER#123",
  sk: (op) => op.beginsWith("ORDER#2024")
}).execute();

await table.query({
  pk: "USER#123",
  sk: (op) => op.between("ORDER#2024-01-01", "ORDER#2024-12-31")
}).execute();

await table.query({
  pk: "ANALYTICS#DAILY",
  sk: (op) => op.gte("2024-01-01")
}).execute();
```

#### ⚠️ Important: DynamoDB Lexical Sorting

**DynamoDB sorts all data lexically (as strings), not numerically or chronologically.** This has critical implications for sort key design:

```ts
// ❌ Problem: Numeric sorting doesn't work as expected
// These sort keys will be ordered: "1", "10", "11", "2", "20", "3"
await table.query({
  pk: "SCORES",
  sk: (op) => op.between("1", "20")  // Gets "1", "10", "11" - not what you want!
}).execute();

// ✅ Solution: Zero-pad numbers for proper lexical sorting
// These sort keys will be ordered: "001", "002", "003", "010", "011", "020"
await table.query({
  pk: "SCORES",
  sk: (op) => op.between("001", "020")  // Now gets all scores 1-20 correctly
}).execute();

// ❌ Problem: Date sorting without proper format
// These won't sort chronologically: "1/1/2024", "12/1/2024", "2/1/2024"
await table.query({
  pk: "EVENTS",
  sk: (op) => op.gte("1/1/2024")  // Will miss many dates!
}).execute();

// ✅ Solution: Use ISO date format (YYYY-MM-DD) for proper lexical sorting
// These will sort correctly: "2024-01-01", "2024-01-02", "2024-12-01"
await table.query({
  pk: "EVENTS",
  sk: (op) => op.gte("2024-01-01")  // Lexical = chronological order
}).execute();
```

#### Sort Key Design Patterns

Design your sort keys to take advantage of lexical sorting:

```ts
// ✅ Good: Hierarchical structure with consistent formatting
const sortKeys = [
  "TYPE#ORDER#DATE#2024-01-15#ID#12345",
  "TYPE#ORDER#DATE#2024-01-16#ID#12346",
  "TYPE#REFUND#DATE#2024-01-17#ID#12347"
];

// ✅ Good: Zero-padded numbers maintain numeric order
const priorityKeys = [
  "PRIORITY#001#TASK#urgent-fix",
  "PRIORITY#002#TASK#feature-request",
  "PRIORITY#010#TASK#documentation"
];

// ✅ Good: ISO timestamps for time-based queries
const timestampKeys = [
  "EVENT#2024-01-15T10:30:00Z#USER#123",
  "EVENT#2024-01-15T10:45:00Z#USER#456",
  "EVENT#2024-01-15T11:00:00Z#USER#789"
];

// Query examples that work correctly with lexical sorting
await table.query({
  pk: "TRANSACTIONS#USER#123",
  sk: (op) => op.between(
    "TYPE#ORDER#DATE#2024-01-01",
    "TYPE#ORDER#DATE#2024-01-31"
  )
}).execute();

await table.query({
  pk: "TASKS#PROJECT#456",
  sk: (op) => op.beginsWith("PRIORITY#001")  // High priority tasks
}).execute();
```

### Sort Key Operators

Available sort key condition operators:

| Operator | Description | Example |
|----------|-------------|---------|
| `eq(value)` | Equal to | `sk: "ORDER#123"` |
| `lt(value)` | Less than | `sk: (op) => op.lt("ORDER#999")` |
| `lte(value)` | Less than or equal | `sk: (op) => op.lte("ORDER#999")` |
| `gt(value)` | Greater than | `sk: (op) => op.gt("ORDER#001")` |
| `gte(value)` | Greater than or equal | `sk: (op) => op.gte("ORDER#001")` |
| `between(low, high)` | Between values | `sk: (op) => op.between("A", "M")` |
| `beginsWith(prefix)` | Starts with prefix | `sk: (op) => op.beginsWith("ORDER#")` |

## Filter Conditions

Filters are applied after key conditions and allow complex filtering logic:

### Basic Filter Operations

```ts
// Single condition
await table
  .query({ pk: "USER#123" })
  .filter((op) => op.eq("status", "active"))
  .execute();

// Multiple conditions with chaining (AND logic)
await table
  .query({ pk: "PRODUCT#electronics" })
  .filter((op) => op.gt("price", 100))
  .filter((op) => op.eq("inStock", true))
  .filter((op) => op.contains("tags", "featured"))
  .execute();
```

### Comparison Operators

```ts
// Equality and inequality
.filter((op) => op.eq("status", "active"))
.filter((op) => op.ne("status", "deleted"))

// Numerical comparisons
.filter((op) => op.gt("price", 50))
.filter((op) => op.gte("rating", 4.0))
.filter((op) => op.lt("stock", 10))
.filter((op) => op.lte("discount", 0.3))

// Range queries
.filter((op) => op.between("age", 18, 65))
.filter((op) => op.inArray("category", ["electronics", "books", "clothing"]))
```

### String and Set Operations

```ts
// String operations
.filter((op) => op.beginsWith("name", "John"))
.filter((op) => op.contains("description", "premium"))

// Set operations (for DynamoDB sets)
.filter((op) => op.contains("skillSet", "javascript"))

// Attribute existence
.filter((op) => op.attributeExists("email"))
.filter((op) => op.attributeNotExists("deletedAt"))
```

### Nested Object Filtering

Access nested properties using dot notation:

```ts
// Nested property access
await table
  .query<User>({ pk: "USER#123" })
  .filter((op) => op.eq("metadata.preferences.theme", "dark"))
  .filter((op) => op.gt("metadata.billing.credits", 100))
  .execute();
```

### Complex Logical Operations

Combine multiple conditions with logical operators:

```ts
// AND conditions (explicit)
await table
  .query({ pk: "PRODUCT#electronics" })
  .filter((op) =>
    op.and(
      op.gt("price", 100),
      op.eq("inStock", true),
      op.contains("tags", "featured")
    )
  )
  .execute();

// OR conditions
await table
  .query({ pk: "USER#notifications" })
  .filter((op) =>
    op.or(
      op.eq("priority", "high"),
      op.eq("urgent", true)
    )
  )
  .execute();

// NOT conditions
await table
  .query({ pk: "ORDER#processing" })
  .filter((op) => op.not(op.eq("status", "cancelled")))
  .execute();

// Complex nested logic
await table
  .query({ pk: "ANALYTICS#users" })
  .filter((op) =>
    op.and(
      op.or(
        op.eq("plan", "premium"),
        op.gt("credits", 1000)
      ),
      op.not(op.eq("status", "suspended")),
      op.attributeExists("lastLogin")
    )
  )
  .execute();
```

## Type-Safe Field Selection

dyno-table provides type-safe field selection (projection) that reduces bandwidth and provides automatic type inference:

### Basic Field Selection

```ts
interface User {
  pk: string;
  sk: string;
  id: string;
  name: string;
  email: string;
  status: "active" | "inactive";
  metadata: {
    preferences: { theme: "light" | "dark" };
    billing: { plan: string; credits: number };
  };
}

// Select specific fields
const users = await table
  .query<User>({ pk: "USER#123" })
  .select(['name', 'email', 'status'])
  .execute();

// TypeScript automatically infers the result type as:
// { name: string; email: string; status: "active" | "inactive" }
for await (const user of users) {
  console.log(user.name);    // ✅ Type-safe
  console.log(user.email);   // ✅ Type-safe
  console.log(user.status);  // ✅ Type-safe
  // console.log(user.id);   // ❌ TypeScript error - not selected
}
```

### Nested Field Selection

Access nested properties using dot notation:

```ts
// Select nested fields
const userProfiles = await table
  .query<User>({ pk: "USER#active" })
  .select(['name', 'metadata.preferences.theme', 'metadata.billing.credits'])
  .execute();

// Result type is automatically inferred as:
// { name: string; metadata: { preferences: { theme: "light" | "dark" }; billing: { credits: number } } }
for await (const profile of userProfiles) {
  console.log(profile.name);                           // ✅ string
  console.log(profile.metadata.preferences.theme);     // ✅ "light" | "dark"
  console.log(profile.metadata.billing.credits);       // ✅ number
  // console.log(profile.metadata.billing.plan);       // ❌ TypeScript error - not selected
}
```

### Benefits of Type-Safe Field Selection

- **Performance**: Reduces data transfer and improves query speed
- **Type Safety**: TypeScript prevents accessing non-selected fields at compile time
- **IntelliSense**: IDE provides accurate autocompletion for selected fields only
- **Bundle Size**: Smaller payload sizes improve application performance
- **Cost Optimization**: Lower data transfer costs in DynamoDB

### Field Selection with Entity Repositories

```ts
// Works seamlessly with entity repositories
const selectedUsers = await userRepo.scan()
  .select(['name', 'email'])
  .execute();

// Type is automatically inferred from entity schema
for await (const user of selectedUsers) {
  console.log(user.name);  // ✅ Type-safe
  console.log(user.email); // ✅ Type-safe
}
```

## Using Indexes

Global Secondary Indexes (GSIs) enable alternative access patterns:

### Basic Index Usage

```ts
// Query a GSI
const activeUsers = await table
  .query({ pk: "STATUS#active" })
  .useIndex("status-index")
  .execute();

// GSI with sort key
const recentOrders = await table
  .query({
    pk: "STATUS#processing",
    sk: (op) => op.gte("2024-01-01")
  })
  .useIndex("status-timestamp-index")
  .execute();
```

### Type-Safe Index Selection

When properly configured, index names are type-checked:

```ts
const table = new Table({
  client: docClient,
  tableName: "MyTable",
  indexes: {
    partitionKey: "pk",
    sortKey: "sk",
    gsis: {
      "user-status-index": {
        partitionKey: "userStatus",
        sortKey: "createdAt",
      },
      "category-price-index": {
        partitionKey: "category",
        sortKey: "price",
      },
    },
  },
});

// TypeScript will validate index names
await table
  .query({ pk: "STATUS#premium" })
  .useIndex("user-status-index") // ✅ Valid
  // .useIndex("invalid-index")  // ❌ TypeScript error
  .execute();
```

## Sorting and Ordering

Control the order of returned results:

### Sort Direction

```ts
// Ascending (default)
await table
  .query({ pk: "USER#123" })
  .sortAscending()
  .execute();

// Descending (most recent first)
await table
  .query({ pk: "ORDER#processing" })
  .sortDescending()
  .execute();
```

### Combining with Indexes

```ts
// Get most recent orders first
await table
  .query({ pk: "USER#123" })
  .useIndex("user-timestamp-index")
  .sortDescending()
  .limit(10)
  .execute();
```

### 📝 Understanding Sort Order with Lexical Sorting

Remember that DynamoDB's lexical sorting affects the order of results:

```ts
// ❌ Common Mistake: Expecting numeric order
// Sort keys: ["ITEM#1", "ITEM#10", "ITEM#2", "ITEM#20", "ITEM#3"]
// DynamoDB returns them in this lexical order: 1, 10, 2, 20, 3
await table
  .query({ pk: "INVENTORY" })
  .sortAscending()  // Gets: ITEM#1, ITEM#10, ITEM#2...
  .execute();

// ✅ Correct: Use zero-padded numbers for proper ordering
// Sort keys: ["ITEM#001", "ITEM#002", "ITEM#003", "ITEM#010", "ITEM#020"]
// DynamoDB returns them in correct numeric order: 001, 002, 003, 010, 020
await table
  .query({ pk: "INVENTORY" })
  .sortAscending()  // Gets: ITEM#001, ITEM#002, ITEM#003...
  .execute();

// ✅ Time-based sorting with ISO format works correctly
// Sort keys with ISO timestamps sort chronologically
await table
  .query({ pk: "EVENTS#2024-01-15" })
  .sortDescending()  // Most recent events first
  .execute();
```

## Pagination

dyno-table provides multiple approaches to handle large result sets efficiently:

### Automatic Pagination with Paginator

```ts
// Create a paginator
const paginator = table
  .query({ pk: "USER#123" })
  .filter((op) => op.eq("status", "active"))
  .paginate(25); // 25 items per page

// Iterate through pages
while (paginator.hasNextPage()) {
  const page = await paginator.getNextPage();

  console.log(`Page ${page.page}: ${page.items.length} items`);
  console.log(`Has more pages: ${page.hasNextPage}`);

  // Process items
  page.items.forEach(item => {
    console.log(`Processing item: ${item.id}`);
  });
}
```

### Manual Pagination

```ts
let lastKey: Record<string, unknown> | undefined;
const allItems: User[] = [];

do {
  const iterator = await table
    .query<User>({ pk: "USER#active" })
    .limit(50)
    .startFrom(lastKey)
    .execute();

  const items = await iterator.toArray();
  allItems.push(...items);

  lastKey = iterator.getLastEvaluatedKey();
} while (lastKey);

console.log(`Total items: ${allItems.length}`);
```

### Get All Pages at Once

```ts
// Load all matching items (use carefully with large datasets)
const allUsers = await table
  .query({ pk: "COMPANY#123" })
  .filter((op) => op.eq("department", "engineering"))
  .paginate(100)
  .getAllPages();

console.log(`Found ${allUsers.length} engineers`);
```

## ResultIterator vs .toArray()

dyno-table returns a `ResultIterator` that provides different ways to consume results, each with distinct memory and performance characteristics:

### ResultIterator (Streaming Approach)

The `ResultIterator` provides memory-efficient, lazy evaluation:

```ts
// Returns immediately - no data fetched yet
const iterator = await table
  .query<Product>({ pk: "CATALOG#electronics" })
  .execute();

// Option 1: Iterate one by one (most memory efficient)
for await (const product of iterator) {
  console.log(`Processing: ${product.name}`);
  // Only one item in memory at a time
  // Can break early to save API calls
  if (product.price > 1000) break;
}

// Option 2: Process in chunks
const iterator2 = await table
  .query<Product>({ pk: "CATALOG#books" })
  .execute();

let batch: Product[] = [];
for await (const product of iterator2) {
  batch.push(product);

  // Process in batches of 50
  if (batch.length === 50) {
    await processBatch(batch);
    batch = []; // Clear memory
  }
}
// Process remaining items
if (batch.length > 0) {
  await processBatch(batch);
}
```

### .toArray() (Load All Approach)

The `.toArray()` method loads all results into memory at once:

```ts
// Fetches ALL matching items before returning
const iterator = await table
  .query<Product>({ pk: "CATALOG#electronics" })
  .execute();

const allProducts = await iterator.toArray(); // Product[]

// All items are now in memory
console.log(`Total products: ${allProducts.length}`);
allProducts.forEach(product => {
  console.log(product.name);
});
```

### When to Use Each Approach

| Scenario | Recommended Approach | Reason |
|----------|---------------------|---------|
| **Large datasets (1000+ items)** | `ResultIterator` | Memory efficient, can process incrementally |
| **Unknown result size** | `ResultIterator` | Avoid memory issues with unexpectedly large results |
| **Early termination possible** | `ResultIterator` | Can break early, saving API calls |
| **Streaming processing** | `ResultIterator` | Process items as they arrive |
| **Small datasets (<100 items)** | `.toArray()` | Simple, all data available immediately |
| **Need total count first** | `.toArray()` | Get length before processing |
| **Multiple iterations** | `.toArray()` | Avoid re-querying DynamoDB |
| **Sorting/filtering all results** | `.toArray()` | Need all data for operations |

### Performance and Memory Implications

```ts
// ❌ Memory issue: Large dataset loaded at once
const allOrders = await table
  .query({ pk: "USER#123" })  // Could return 10,000+ orders
  .execute()
  .then(iterator => iterator.toArray()); // Loads everything into memory

console.log(`Processing ${allOrders.length} orders...`);
// Risk: Out of memory error with large datasets

// ✅ Memory efficient: Stream processing
const orderIterator = await table
  .query({ pk: "USER#123" })
  .execute();

let totalValue = 0;
let processedCount = 0;

for await (const order of orderIterator) {
  totalValue += order.amount;
  processedCount++;

  // Optional: Progress reporting
  if (processedCount % 100 === 0) {
    console.log(`Processed ${processedCount} orders so far...`);
  }
}

console.log(`Total value: ${totalValue} from ${processedCount} orders`);
```

## Type Safety

dyno-table provides comprehensive type safety throughout the query builder:

### Strongly Typed Filters

```ts
interface Product {
  pk: string;
  sk: string;
  name: string;
  price: number;
  category: "electronics" | "books" | "clothing";
  inStock: boolean;
  metadata: {
    rating: number;
    reviews: number;
  };
}

await table
  .query<Product>({ pk: "CATEGORY#electronics" })
  .filter((op) =>
    op.and(
      op.gt("price", 50),                    // ✅ number comparison
      op.eq("inStock", true),               // ✅ boolean comparison
      op.eq("category", "electronics"),     // ✅ union type
      op.gt("metadata.rating", 4.0),       // ✅ nested property
      // op.eq("price", "50")               // ❌ Type error: string vs number
      // op.eq("category", "invalid")       // ❌ Type error: invalid union value
    )
  )
  .execute();
```

### Type-Safe Result Handling

```ts
const products = await table
  .query<Product>({ pk: "FEATURED#products" })
  .execute();

// products is strongly typed as ResultIterator<Product>
for await (const product of products) {
  // Full IntelliSense support
  console.log(product.name);           // ✅ string
  console.log(product.price);          // ✅ number
  console.log(product.metadata.rating); // ✅ nested access
}

// Type-safe array conversion
const items = await products.toArray(); // Product[]
```

## Performance Optimization

### Efficient Query Patterns

```ts
// ✅ Good: Use specific partition keys
await table
  .query({ pk: "USER#123" })
  .execute();

// ❌ Avoid: Scanning entire table
await table
  .scan()
  .filter((op) => op.eq("userId", "123"))
  .execute();

// ✅ Good: Use sort key ranges
await table
  .query({
    pk: "USER#123",
    sk: (op) => op.between("ORDER#2024-01", "ORDER#2024-12")
  })
  .execute();

// ✅ Good: Limit results when appropriate
await table
  .query({ pk: "RECENT#activity" })
  .limit(50)
  .sortDescending()
  .execute();
```

### Field Selection for Performance

```ts
// ✅ Good: Select only needed fields
const users = await table
  .query<User>({ pk: "ACTIVE#users" })
  .select(["id", "name", "email"])
  .execute();

// ✅ Good: Select nested fields specifically
const profiles = await table
  .query<User>({ pk: "USER#123" })
  .select(["name", "metadata.preferences.theme"])
  .execute();
```

### Consistent Reads

Use consistent reads when you need the most up-to-date data:

```ts
// Eventually consistent (default, cheaper)
const orders = await table
  .query({ pk: "USER#123" })
  .execute();

// Strongly consistent (more expensive, latest data)
const criticalData = await table
  .query({ pk: "PAYMENT#processing" })
  .consistentRead(true)
  .execute();
```

## Entity Query Builder

When using the Entity pattern, you get additional type safety and semantic query methods:

### Entity Definition with Queries

```ts
import { z } from "zod";
import { defineEntity, createIndex, createQueries } from "dyno-table/entity";

const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  status: z.enum(["active", "inactive", "suspended"]),
  department: z.string(),
  createdAt: z.string(),
});

type User = z.infer<typeof userSchema>;

const createQuery = createQueries<User>();

const UserEntity = defineEntity({
  name: "User",
  schema: userSchema,
  primaryKey: createIndex()
    .input(z.object({ id: z.string() }))
    .partitionKey(({ id }) => `USER#${id}`)
    .sortKey(() => "PROFILE"),
  indexes: {
    gsi1: createIndex()
      .input(userSchema)
      .partitionKey(({ status }) => `STATUS#${status}`)
      .sortKey(({ createdAt }) => createdAt),
    gsi2: createIndex()
      .input(userSchema)
      .partitionKey(({ department }) => `DEPT#${department}`)
      .sortKey(({ name }) => name),
  },
  queries: {
    // Semantic query names
    getActiveUsers: createQuery
      .input(z.object({}))
      .query(({ entity }) =>
        entity.query({ pk: "STATUS#active" }).useIndex("gsi1")
      ),

    getUsersByDepartment: createQuery
      .input(z.object({ department: z.string() }))
      .query(({ input, entity }) =>
        entity.query({ pk: `DEPT#${input.department}` }).useIndex("gsi2")
      ),

    getActiveUsersInDepartment: createQuery
      .input(z.object({ department: z.string() }))
      .query(({ input, entity }) =>
        entity
          .query({ pk: `DEPT#${input.department}` })
          .useIndex("gsi2")
          .filter((op) => op.eq("status", "active"))
      ),
  },
});
```

### Using Entity Queries

```ts
const userRepo = UserEntity.createRepository(table);

// Semantic method names make intent clear
const activeUsers = await userRepo.query
  .getActiveUsers()
  .execute();

const engineers = await userRepo.query
  .getUsersByDepartment({ department: "engineering" })
  .execute();

// Chain additional filters at runtime
const seniorEngineers = await userRepo.query
  .getActiveUsersInDepartment({ department: "engineering" })
  .filter((op) => op.beginsWith("name", "Senior"))
  .execute();

// Type-safe field selection with entities
const engineerNames = await userRepo.query
  .getUsersByDepartment({ department: "engineering" })
  .select(["name", "email"])
  .execute();
```

## Advanced Examples

### Complex Business Logic Queries

```ts
// E-commerce: Find trending products
const trendingProducts = await table
  .query({ pk: "ANALYTICS#products" })
  .useIndex("analytics-index")
  .filter((op) =>
    op.and(
      op.gte("salesLastWeek", 100),
      op.gte("rating", 4.0),
      op.gt("reviewCount", 10),
      op.eq("inStock", true),
      op.not(op.contains("flags", "discontinued"))
    )
  )
  .sortDescending()
  .limit(20)
  .select(["name", "price", "rating", "salesLastWeek"])
  .execute();

// Analytics: User engagement analysis
const engagedUsers = await table
  .query({ pk: "ENGAGEMENT#high" })
  .useIndex("engagement-index")
  .filter((op) =>
    op.and(
      op.gte("lastLoginDays", 0),
      op.lte("lastLoginDays", 7),
      op.gt("sessionsThisMonth", 5),
      op.or(
        op.eq("plan", "premium"),
        op.gt("purchases", 0)
      )
    )
  )
  .execute();
```

### Conditional Query Building

```ts
function buildUserQuery(filters: {
  status?: string;
  department?: string;
  minCreatedDate?: string;
  namePrefix?: string;
}) {
  let query = table.query<User>({ pk: "USERS#all" });

  // Conditionally add filters
  if (filters.status) {
    query = query.filter((op) => op.eq("status", filters.status));
  }

  if (filters.department) {
    query = query.filter((op) => op.eq("department", filters.department));
  }

  if (filters.minCreatedDate) {
    query = query.filter((op) => op.gte("createdAt", filters.minCreatedDate));
  }

  if (filters.namePrefix) {
    query = query.filter((op) => op.beginsWith("name", filters.namePrefix));
  }

  return query;
}

// Usage
const results = await buildUserQuery({
  status: "active",
  department: "engineering",
  namePrefix: "John"
}).execute();
```

### Aggregation Patterns

```ts
// Count pattern with streaming
let orderCount = 0;
const orderIterator = await table
  .query({ pk: "USER#123" })
  .filter((op) => op.beginsWith("sk", "ORDER#"))
  .execute();

for await (const order of orderIterator) {
  orderCount++;
}

// Group by pattern with streaming
const ordersByStatus: Record<string, number> = {};
const allOrdersIterator = await table
  .query({ pk: "ORDERS#2024" })
  .execute();

for await (const order of allOrdersIterator) {
  ordersByStatus[order.status] = (ordersByStatus[order.status] || 0) + 1;
}

// Memory-efficient sum calculation
let totalRevenue = 0;
const revenueIterator = await table
  .query({ pk: "SALES#2024" })
  .select(["amount"])
  .execute();

for await (const sale of revenueIterator) {
  totalRevenue += sale.amount;
}
```

### Error Handling

```ts
try {
  const results = await table
    .query({ pk: "USER#123" })
    .filter((op) => op.eq("status", "active"))
    .execute();

  let itemCount = 0;
  for await (const item of results) {
    itemCount++;
    console.log(`Processing item ${itemCount}: ${item.name}`);
  }

} catch (error) {
  if (error.name === "ValidationException") {
    console.error("Invalid query parameters:", error.message);
  } else if (error.name === "ResourceNotFoundException") {
    console.error("Table not found:", error.message);
  } else if (error.name === "ProvisionedThroughputExceededException") {
    console.error("Rate limit exceeded, implement backoff");
  } else {
    console.error("Unexpected error:", error);
  }
}
```

### Optimization Strategies

```ts
// Strategy 1: Use field selection to reduce bandwidth
const lightweightUsers = await table
  .query({ pk: "USERS#active" })
  .select(["id", "name", "status"])  // Only essential fields
  .execute();

// Strategy 2: Implement pagination for large datasets
const paginator = table
  .query({ pk: "ORDERS#2024" })
  .paginate(100);

while (paginator.hasNextPage()) {
  const page = await paginator.getNextPage();
  await processOrderBatch(page.items);

  // Optional: Add delay to respect rate limits
  await new Promise(resolve => setTimeout(resolve, 100));
}

// Strategy 3: Early termination for searches
const highValueOrderIterator = await table
  .query({ pk: "CUSTOMER#premium" })
  .sortDescending()
  .execute();

for await (const order of highValueOrderIterator) {
  if (order.amount > 10000) {
    console.log("Found high-value order:", order.id);
    break; // Stop searching after first match
  }
}
```

This comprehensive guide covers all aspects of the dyno-table Query Builder. The combination of type safety, field selection, fluent API design, and memory-efficient processing makes it a powerful tool for building high-performance, maintainable DynamoDB applications.
