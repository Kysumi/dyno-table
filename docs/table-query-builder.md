# dyno-table Table Query Builder Guide

The dyno-table Table Query Builder provides direct access to DynamoDB operations with a type-safe, fluent API. This approach gives you full control over partition keys, sort keys, indexes, and query expressions while maintaining TypeScript safety.

## Table of Contents

- [Getting Started](#getting-started)
- [Query Operations](#query-operations)
- [Key Conditions](#key-conditions)
- [Filter Conditions](#filter-conditions)
- [Query Constraints](#query-constraints)
- [Transaction Operations](#transaction-operations)
- [Pagination & Results](#pagination--results)
- [Type Safety](#type-safety)
- [Global Secondary Indexes](#global-secondary-indexes)
- [Advanced Examples](#advanced-examples)

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
  tableName: "UserOrdersTable",
  indexes: {
    partitionKey: "pk",
    sortKey: "sk",
    gsis: {
      "status-index": {
        partitionKey: "status",
        sortKey: "createdAt",
      },
      "email-index": {
        partitionKey: "email",
        sortKey: "pk",
      },
    },
  },
});
```

### Type Definitions

Define your item types for full type safety:

```ts
interface User {
  pk: string;          // USER#123
  sk: string;          // PROFILE
  id: string;
  name: string;
  email: string;
  status: "active" | "inactive" | "suspended";
  createdAt: string;
}

interface Order {
  pk: string;          // USER#123
  sk: string;          // ORDER#456
  orderId: string;
  amount: number;
  status: "pending" | "processing" | "shipped" | "delivered";
  createdAt: string;
  items: Array<{
    productId: string;
    quantity: number;
    price: number;
  }>;
}
```

## Query Operations

### Query - Fast Partition Key Retrieval

```ts
// Get all orders for a specific user
const userOrders = await table
  .query<Order>({ pk: "USER#123" })
  .filter(op => op.beginsWith("sk", "ORDER#"))
  .execute();

for await (const order of userOrders) {
  console.log(`Order ${order.orderId}: $${order.amount}`);
}

// Get specific order
const specificOrder = await table
  .query<Order>({ pk: "USER#123", sk: "ORDER#456" })
  .execute();
```

### Scan - Full Table Examination

```ts
// Find all active users (less efficient - scans entire table)
const activeUsers = await table
  .scan<User>()
  .filter(op => op.and(
    op.eq("status", "active"),
    op.beginsWith("sk", "PROFILE")
  ))
  .execute();

// Scan with field selection for better performance
const userProfiles = await table
  .scan<User>()
  .filter(op => op.beginsWith("sk", "PROFILE"))
  .select(['name', 'email', 'status'])
  .execute();
```

### Batch Get - Multiple Items by Key

```ts
// Get multiple user profiles
const userProfiles = await table
  .batchGet<User>([
    { pk: "USER#123", sk: "PROFILE" },
    { pk: "USER#456", sk: "PROFILE" },
    { pk: "USER#789", sk: "PROFILE" }
  ])
  .execute();

// Get specific orders
const specificOrders = await table
  .batchGet<Order>([
    { pk: "USER#123", sk: "ORDER#001" },
    { pk: "USER#123", sk: "ORDER#002" },
    { pk: "USER#456", sk: "ORDER#003" }
  ])
  .execute();
```

## Key Conditions

### Sort Key Operators

```ts
// Exact match - get user profile
const userProfile = await table
  .query<User>({ pk: "USER#123", sk: "PROFILE" })
  .execute();

// Less than - orders before a specific date
const oldOrders = await table
  .query<Order>({
    pk: "USER#123",
    sk: op => op.lt("ORDER#2024-06-01")
  })
  .execute();

// Greater than or equal - recent orders
const recentOrders = await table
  .query<Order>({
    pk: "USER#123",
    sk: op => op.gte("ORDER#2024-01-01")
  })
  .execute();

// Between - orders in date range
const ordersInRange = await table
  .query<Order>({
    pk: "USER#123",
    sk: op => op.between("ORDER#2024-01-01", "ORDER#2024-12-31")
  })
  .execute();

// Begins with - all orders (vs profiles, settings, etc.)
const allUserOrders = await table
  .query<Order>({
    pk: "USER#123",
    sk: op => op.beginsWith("ORDER#")
  })
  .execute();
```

### DynamoDB Lexical Sorting Best Practices

```ts
// ❌ Wrong: Numbers don't sort correctly
// These would be ordered: "ORDER#1", "ORDER#10", "ORDER#2"
const badOrderKeys = [
  "ORDER#1",
  "ORDER#10",
  "ORDER#2"
];

// ✅ Correct: Zero-padded for proper lexical sorting
// These are ordered correctly: "ORDER#001", "ORDER#002", "ORDER#010"
const goodOrderKeys = [
  "ORDER#001",
  "ORDER#002",
  "ORDER#010"
];

// Query with proper zero-padding
const orderRange = await table
  .query<Order>({
    pk: "USER#123",
    sk: op => op.between("ORDER#001", "ORDER#010")
  })
  .execute();

// ✅ ISO date format for chronological sorting
const timeBasedQuery = await table
  .query({
    pk: "ANALYTICS#daily",
    sk: op => op.gte("2024-01-15T10:00:00Z")
  })
  .execute();
```

## Filter Conditions

### Comparison Operators

```ts
// Equal to - active users only
const activeUsers = await table
  .scan<User>()
  .filter(op => op.eq("status", "active"))
  .execute();

// Not equal - exclude suspended users
const validUsers = await table
  .scan<User>()
  .filter(op => op.ne("status", "suspended"))
  .execute();

// Numeric comparisons - high value orders
const highValueOrders = await table
  .query<Order>({ pk: "USER#123" })
  .filter(op => op.gt("amount", 1000))
  .execute();

// Range filtering - orders in price range
const moderateOrders = await table
  .query<Order>({ pk: "USER#123" })
  .filter(op => op.between("amount", 50, 500))
  .execute();

// Array membership - orders with specific statuses
const processingOrders = await table
  .scan<Order>()
  .filter(op => op.inArray("status", ["processing", "shipped"]))
  .execute();
```

### String and Set Operations

```ts
// String begins with - find users by name prefix
const johnsAndJanes = await table
  .scan<User>()
  .filter(op => op.or(
    op.beginsWith("name", "John"),
    op.beginsWith("name", "Jane")
  ))
  .execute();

// Contains for strings - search in descriptions
const electronicsOrders = await table
  .scan<Order>()
  .filter(op => op.contains("description", "electronics"))
  .execute();

// Contains for sets - orders with specific product
const ordersWithProduct = await table
  .scan<Order>()
  .filter(op => op.contains("productIds", "PROD#123"))
  .execute();
```

### Attribute Existence

```ts
// Must have email - verified users
const verifiedUsers = await table
  .scan<User>()
  .filter(op => op.attributeExists("email"))
  .execute();

// Not deleted - active records
const activeRecords = await table
  .scan()
  .filter(op => op.attributeNotExists("deletedAt"))
  .execute();
```

### Complex Logical Operations

```ts
// AND conditions - premium active users
const premiumActiveUsers = await table
  .scan<User>()
  .filter(op => op.and(
    op.eq("status", "active"),
    op.eq("plan", "premium"),
    op.attributeExists("email")
  ))
  .execute();

// OR conditions - urgent orders
const urgentOrders = await table
  .scan<Order>()
  .filter(op => op.or(
    op.eq("priority", "high"),
    op.gt("amount", 10000),
    op.contains("tags", "rush")
  ))
  .execute();

// NOT conditions - exclude test users
const realUsers = await table
  .scan<User>()
  .filter(op => op.not(
    op.beginsWith("email", "test+")
  ))
  .execute();

// Complex nested logic
const targetUsers = await table
  .scan<User>()
  .filter(op => op.and(
    op.or(
      op.eq("status", "active"),
      op.eq("status", "pending")
    ),
    op.not(op.beginsWith("email", "temp+")),
    op.attributeExists("lastLogin")
  ))
  .execute();
```

## Query Constraints

### Limiting Results

```ts
// Get first 10 orders
const firstTenOrders = await table
  .query<Order>({ pk: "USER#123" })
  .filter(op => op.beginsWith("sk", "ORDER#"))
  .limit(10)
  .execute();

// Get most recent 5 orders
const recentOrders = await table
  .query<Order>({ pk: "USER#123" })
  .filter(op => op.beginsWith("sk", "ORDER#"))
  .sortDescending()
  .limit(5)
  .execute();
```

### Consistency Control

```ts
// Eventual consistency (default, cheaper)
const userProfile = await table
  .query<User>({ pk: "USER#123", sk: "PROFILE" })
  .execute();

// Strong consistency (more expensive, latest data)
const criticalUserData = await table
  .query<User>({ pk: "USER#123", sk: "PROFILE" })
  .consistentRead(true)
  .execute();
```

### Sort Direction

```ts
// Ascending (default) - oldest first
const oldestFirst = await table
  .query<Order>({ pk: "USER#123" })
  .filter(op => op.beginsWith("sk", "ORDER#"))
  .sortAscending()
  .execute();

// Descending - newest first
const newestFirst = await table
  .query<Order>({ pk: "USER#123" })
  .filter(op => op.beginsWith("sk", "ORDER#"))
  .sortDescending()
  .execute();
```

### Field Selection (Projection)

```ts
// Select specific fields - reduce bandwidth
const userSummaries = await table
  .query<User>({ pk: "USER#123" })
  .select(['name', 'email', 'status'])
  .execute();

// Nested field selection
const userPreferences = await table
  .scan<User>()
  .select(['name', 'settings.theme', 'settings.notifications'])
  .execute();
```

### Pagination Control

```ts
// Manual pagination
let lastKey: Record<string, unknown> | undefined;
const allOrders: Order[] = [];

do {
  const results = await table
    .query<Order>({ pk: "USER#123" })
    .filter(op => op.beginsWith("sk", "ORDER#"))
    .limit(25)
    .startFrom(lastKey)
    .execute();

  const pageItems = await results.toArray();
  allOrders.push(...pageItems);
  lastKey = results.getLastEvaluatedKey();
} while (lastKey);
```

## Transaction Operations

### Conditional Checks

```ts
// Ensure inventory before purchase
await table.transactWrite([
  // Check stock exists
  table.conditionCheck(
    { pk: "PRODUCT#123", sk: "INVENTORY" },
    op => op.gt("quantity", 0)
  ),

  // Reduce inventory
  table.update(
    { pk: "PRODUCT#123", sk: "INVENTORY" },
    { quantity: val => val.add(-1) }
  ),

  // Create order
  table.put({
    pk: "USER#456",
    sk: "ORDER#789",
    orderId: "789",
    productId: "123",
    amount: 29.99,
    status: "processing",
    createdAt: new Date().toISOString()
  })
]).execute();
```

### Conditional Put Operations

```ts
// Create user only if doesn't exist
await table
  .put<User>({
    pk: "USER#123",
    sk: "PROFILE",
    id: "123",
    name: "John Doe",
    email: "john@example.com",
    status: "active",
    createdAt: new Date().toISOString()
  })
  .condition(op => op.attributeNotExists("pk"))
  .execute();
```

### Conditional Updates

```ts
// Update user credits only if active
await table
  .update({ pk: "USER#123", sk: "PROFILE" }, {
    credits: val => val.add(100),
    lastUpdated: new Date().toISOString()
  })
  .condition(op => op.eq("status", "active"))
  .execute();

// Complex update conditions
await table
  .update({ pk: "USER#123", sk: "PROFILE" }, {
    status: "suspended",
    suspendedAt: new Date().toISOString()
  })
  .condition(op => op.and(
    op.eq("status", "active"),
    op.lt("credits", 0)
  ))
  .execute();
```

### Conditional Deletes

```ts
// Delete only inactive users
await table
  .delete({ pk: "USER#123", sk: "PROFILE" })
  .condition(op => op.eq("status", "inactive"))
  .execute();
```

## Pagination & Results

### Automatic Pagination with Paginator

```ts
// Create paginator
const paginator = table
  .query<Order>({ pk: "USER#123" })
  .filter(op => op.beginsWith("sk", "ORDER#"))
  .sortDescending()
  .paginate(20);

// Process page by page
while (paginator.hasNextPage()) {
  const page = await paginator.getNextPage();

  console.log(`Page ${page.page}: ${page.items.length} orders`);

  page.items.forEach(order => {
    console.log(`  Order ${order.orderId}: $${order.amount}`);
  });
}
```

### Load All Pages at Once

```ts
// Get all matching items (use carefully with large datasets)
const allUserOrders = await table
  .query<Order>({ pk: "USER#123" })
  .filter(op => op.beginsWith("sk", "ORDER#"))
  .paginate(50)
  .getAllPages();

console.log(`Total orders: ${allUserOrders.length}`);
```

### ResultIterator - Memory Efficient Streaming

```ts
// Process one item at a time (memory efficient)
const orderIterator = await table
  .query<Order>({ pk: "USER#123" })
  .filter(op => op.beginsWith("sk", "ORDER#"))
  .execute();

let totalAmount = 0;
let orderCount = 0;

for await (const order of orderIterator) {
  totalAmount += order.amount;
  orderCount++;

  // Can break early to save API calls
  if (order.amount > 10000) {
    console.log(`Found high-value order: ${order.orderId}`);
    break;
  }
}

console.log(`Processed ${orderCount} orders, total: $${totalAmount}`);
```

### Array Loading

```ts
// Load all results into memory (for small datasets)
const results = await table
  .query<Order>({ pk: "USER#123" })
  .filter(op => op.beginsWith("sk", "ORDER#"))
  .limit(10)
  .execute();

const orders = await results.toArray();
console.log(`Found ${orders.length} orders`);
```

## Type Safety

### Generic Type Parameters

```ts
// Strongly typed queries
interface UserProfile {
  pk: string;
  sk: string;
  name: string;
  email: string;
  preferences: {
    theme: "light" | "dark";
    notifications: boolean;
  };
}

const profiles = await table
  .query<UserProfile>({ pk: "USER#123", sk: "PROFILE" })
  .execute();

for await (const profile of profiles) {
  console.log(profile.name);                    // ✅ string
  console.log(profile.preferences.theme);       // ✅ "light" | "dark"
  // console.log(profile.invalidField);         // ❌ TypeScript error
}
```

### Field Selection Type Safety

```ts
// Selected fields are automatically typed
const userNames = await table
  .query<UserProfile>({ pk: "USER#123" })
  .select(['name', 'email'])  // Type: { name: string; email: string }
  .execute();

for await (const user of userNames) {
  console.log(user.name);   // ✅ Available and typed
  console.log(user.email);  // ✅ Available and typed
  // console.log(user.preferences); // ❌ TypeScript error - not selected
}

// Nested field selection
const themes = await table
  .query<UserProfile>({ pk: "USER#123" })
  .select(['name', 'preferences.theme'])
  .execute();

for await (const user of themes) {
  console.log(user.name);                // ✅ string
  console.log(user.preferences.theme);   // ✅ "light" | "dark"
  // console.log(user.preferences.notifications); // ❌ Not selected
}
```

### Union Type Support

```ts
interface Order {
  pk: string;
  sk: string;
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled";
  priority: "low" | "normal" | "high";
}

// TypeScript enforces valid enum values
const highPriorityOrders = await table
  .query<Order>({ pk: "USER#123" })
  .filter(op => op.eq("priority", "high"))     // ✅ Valid enum value
  // .filter(op => op.eq("priority", "urgent")) // ❌ TypeScript error
  .execute();
```

## Global Secondary Indexes

### Using GSI with Type Safety

```ts
// Query by user status (using status-index GSI)
const activeUsers = await table
  .query<User>({ pk: "active" })
  .useIndex("status-index")
  .execute();

// Query by email (using email-index GSI)
const userByEmail = await table
  .query<User>({ pk: "john@example.com" })
  .useIndex("email-index")
  .execute();

// GSI with sort key conditions
const recentActiveUsers = await table
  .query<User>({
    pk: "active",
    sk: op => op.gte("2024-01-01T00:00:00Z")
  })
  .useIndex("status-index")
  .sortDescending()
  .limit(50)
  .execute();
```

### Complex GSI Queries

```ts
// Find high-value recent orders
const highValueRecentOrders = await table
  .query<Order>({
    pk: "processing",
    sk: op => op.gte("2024-01-01T00:00:00Z")
  })
  .useIndex("status-index")
  .filter(op => op.gt("amount", 1000))
  .sortDescending()
  .execute();
```

## Advanced Examples

### E-commerce Order Processing

```ts
// Get customer order history with analytics
async function getCustomerOrderSummary(userId: string) {
  const orders = await table
    .query<Order>({ pk: `USER#${userId}` })
    .filter(op => op.beginsWith("sk", "ORDER#"))
    .sortDescending()
    .execute();

  let totalSpent = 0;
  let orderCount = 0;
  const statusCounts: Record<string, number> = {};

  for await (const order of orders) {
    totalSpent += order.amount;
    orderCount++;
    statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
  }

  return {
    userId,
    totalSpent,
    orderCount,
    statusCounts,
    averageOrderValue: totalSpent / orderCount
  };
}
```

### Conditional Inventory Management

```ts
async function processOrder(userId: string, orderId: string, items: Array<{productId: string, quantity: number}>) {
  // Build transaction operations
  const transactionOps = [];

  // Check inventory for each item
  for (const item of items) {
    transactionOps.push(
      table.conditionCheck(
        { pk: `PRODUCT#${item.productId}`, sk: "INVENTORY" },
        op => op.gte("quantity", item.quantity)
      )
    );
  }

  // Update inventory for each item
  for (const item of items) {
    transactionOps.push(
      table.update(
        { pk: `PRODUCT#${item.productId}`, sk: "INVENTORY" },
        { quantity: val => val.add(-item.quantity) }
      )
    );
  }

  // Create the order
  transactionOps.push(
    table.put({
      pk: `USER#${userId}`,
      sk: `ORDER#${orderId}`,
      orderId,
      items,
      status: "processing",
      createdAt: new Date().toISOString()
    })
  );

  // Execute transaction
  await table.transactWrite(transactionOps).execute();
}
```

### Efficient Pagination Pattern

```ts
async function getAllUserData(userId: string) {
  const paginator = table
    .query({ pk: `USER#${userId}` })
    .sortAscending()
    .paginate(100);

  const profile = { orders: [], settings: [], analytics: [] };

  while (paginator.hasNextPage()) {
    const page = await paginator.getNextPage();

    for (const item of page.items) {
      if (item.sk.startsWith("ORDER#")) {
        profile.orders.push(item);
      } else if (item.sk.startsWith("SETTING#")) {
        profile.settings.push(item);
      } else if (item.sk.startsWith("ANALYTICS#")) {
        profile.analytics.push(item);
      }
    }

    // Optional: Add delay to respect rate limits
    if (paginator.hasNextPage()) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return profile;
}
```

### Error Handling

```ts
async function safeQuery(userId: string) {
  try {
    const results = await table
      .query<User>({ pk: `USER#${userId}` })
      .filter(op => op.eq("status", "active"))
      .execute();

    const users = await results.toArray();
    return users;

  } catch (error) {
    if (error.name === "ValidationException") {
      console.error("Invalid query parameters:", error.message);
    } else if (error.name === "ResourceNotFoundException") {
      console.error("Table not found:", error.message);
    } else if (error.name === "ProvisionedThroughputExceededException") {
      console.error("Rate limit exceeded - implement exponential backoff");
    } else if (error.name === "ConditionalCheckFailedException") {
      console.error("Condition failed - item state changed");
    } else {
      console.error("Unexpected error:", error);
    }

    throw error;
  }
}
```

This comprehensive guide covers all aspects of using dyno-table's Table Query Builder, providing direct control over DynamoDB operations while maintaining type safety and performance best practices.
