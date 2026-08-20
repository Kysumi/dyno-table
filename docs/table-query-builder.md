# dyno-table table query builder guide

The dyno-table Table Query Builder provides direct access to DynamoDB operations with a type-safe, fluent API. This approach gives you full control over partition keys, sort keys, indexes, and query expressions while maintaining TypeScript safety.

## Table of contents

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

## Getting started

### Basic table setup

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

### Type definitions

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

## Query operations

### Query - fast partition key retrieval

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

### Scan - full table examination

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

#### Parallel scan

Use `.segments(n)` for full-table jobs where one sequential scan is the bottleneck. `n` must be an integer from 1 to
1,000,000. The method returns an async iterable directly:

```ts
const users = table
  .scan<User>()
  .filter(op => op.eq("status", "active"))
  .segments(4);

for await (const user of users) {
  await exportUser(user);
}

const allUsers = await userRepo.scan().segments(4).toArray();
```

Each segment paginates independently and results arrive as soon as each segment produces them. A failure in any segment
fails the merged scan.

`.limit(n)` applies to the merged result, so `.limit(10).segments(4)` returns at most 10 items total. Each segment can still
issue a concurrent scan request with that limit, so parallel scans can throttle provisioned tables; reserve them for large
full-table work.

Use `.paginate(pageSize)` for page-by-page processing:

```ts
const paginator = table.scan<User>().segments(4).paginate(100);

while (paginator.hasNextPage()) {
  const page = await paginator.getNextPage();
  await exportUsers(page.items);
}
```

DynamoDB returns one continuation key per segment, not one key for the merged scan, so dyno-table holds parallel
pagination state in memory.

### Batch get - multiple items by key

```ts
// Get multiple user profiles
const { items: userProfiles } = await table.batchGet<User>([
  { pk: "USER#123", sk: "PROFILE" },
  { pk: "USER#456", sk: "PROFILE" },
  { pk: "USER#789", sk: "PROFILE" }
]);

// Get specific orders
const { items: specificOrders } = await table.batchGet<Order>([
  { pk: "USER#123", sk: "ORDER#001" },
  { pk: "USER#123", sk: "ORDER#002" },
  { pk: "USER#456", sk: "ORDER#003" }
]);
```

## Key conditions

### Sort key operators

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

### DynamoDB lexical sorting best practices

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

## Filter conditions

Filters control which items queries and scans return. dyno-table applies them **after** DynamoDB retrieves the items, but **before** returning them to your application.

See the [Conditions Guide](./conditions.md) for condition patterns, including conditional writes and duplicate prevention.

### Comparison operators

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

### String and set operations

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

### Attribute existence

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

### Complex logical operations

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

### Advanced AND/OR query patterns

Nested `and`/`or` groups combine to express multi-factor conditions:

```ts
// Find VIP customers: high spend or order count, and active + verified
const vipCustomers = await table
  .scan<User>()
  .filter(op => op.and(
    op.or(
      op.gt("totalSpent", 10000),
      op.gt("orderCount", 50)
    ),
    op.eq("status", "active"),
    op.eq("emailVerified", true)
  ))
  .execute();

// Find players for matchmaking on a queried partition
const potentialMatches = await table
  .query<Player>({ pk: "SKILL_TIER#gold" })
  .filter(op => op.and(
    op.between("skillRating", 1800, 2200),
    op.or(
      op.eq("region", "us-west"),
      op.lt("averageLatency", 50)
    ),
    op.or(
      op.eq("status", "online"),
      op.gte("lastActiveAt", "2024-01-20")
    )
  ))
  .execute();
```

### Chaining multiple filter conditions

You can also chain multiple `.filter()` calls, which creates an implicit AND between them:

```ts
// These are equivalent approaches:

// Approach 1: Single filter with op.and()
const results1 = await table
  .scan<Order>()
  .filter(op => op.and(
    op.eq("status", "shipped"),
    op.gt("amount", 100),
    op.eq("region", "us-west")
  ))
  .execute();

// Approach 2: Multiple filter calls (implicit AND)
const results2 = await table
  .scan<Order>()
  .filter(op => op.eq("status", "shipped"))
  .filter(op => op.gt("amount", 100))
  .filter(op => op.eq("region", "us-west"))
  .execute();

// Approach 3: Mixed - combining both patterns
const results3 = await table
  .scan<Order>()
  .filter(op => op.or(
    op.eq("status", "shipped"),
    op.eq("status", "delivered")
  ))
  .filter(op => op.gt("amount", 100))        // AND with the OR condition above
  .filter(op => op.eq("region", "us-west"))  // AND with all previous conditions
  .execute();
```

### Performance considerations for complex filters

```ts
// ❌ Inefficient: Complex scan with many OR conditions
const inefficientQuery = await table
  .scan<User>()
  .filter(op => op.or(
    op.eq("status", "active"),
    op.eq("status", "pending"),
    op.eq("status", "trial"),
    op.eq("status", "premium"),
    op.eq("status", "enterprise")
  ))
  .execute();

// ✅ Better: Use inArray for multiple equality checks
const efficientQuery = await table
  .scan<User>()
  .filter(op => op.inArray("status", ["active", "pending", "trial", "premium", "enterprise"]))
  .execute();

// ✅ Best: Design GSI for common filter patterns
const optimizedQuery = await table
  .query<User>({ pk: "STATUS#active" })  // Use GSI instead of scan
  .useIndex("status-index")
  .execute();
```

## Query constraints

### Limiting results

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

### Consistency control

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

### Sort direction

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

### Field selection (projection)

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

### Pagination control

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

## Transaction operations

### Conditional checks

```ts
// Ensure inventory before purchase
await table.transaction(async (tx) => {
  // Reduce inventory. Fails the whole transaction if stock is out
  table.update({ pk: "PRODUCT#123", sk: "INVENTORY" })
    .condition(op => op.gt("quantity", 0))
    .add("quantity", -1)
    .withTransaction(tx);

  // Create order
  table.create({
    pk: "USER#456",
    sk: "ORDER#789",
    orderId: "789",
    productId: "123",
    amount: 29.99,
    status: "processing",
    createdAt: new Date().toISOString()
  }).withTransaction(tx);
});
```

### Conditional put operations

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

See the [Conditions Guide](./conditions.md) for more condition examples.

### Conditional updates

```ts
// Update user credits only if active
await table
  .update({ pk: "USER#123", sk: "PROFILE" })
  .set("lastUpdated", new Date().toISOString())
  .add("credits", 100)
  .condition(op => op.eq("status", "active"))
  .execute();

// Complex update conditions
await table
  .update({ pk: "USER#123", sk: "PROFILE" })
  .set({
    status: "suspended",
    suspendedAt: new Date().toISOString()
  })
  .condition(op => op.and(
    op.eq("status", "active"),
    op.lt("credits", 0)
  ))
  .execute();
```

### Conditional deletes

```ts
// Delete only inactive users
await table
  .delete({ pk: "USER#123", sk: "PROFILE" })
  .condition(op => op.eq("status", "inactive"))
  .execute();
```

See the [Conditions Guide](./conditions.md) for conditional-operation and duplicate-prevention patterns.

## Pagination & results

### Automatic pagination with Paginator

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

### Load all pages at once

```ts
// Get all matching items (use carefully with large datasets)
const allUserOrders = await table
  .query<Order>({ pk: "USER#123" })
  .filter(op => op.beginsWith("sk", "ORDER#"))
  .paginate(50)
  .getAllPages();

console.log(`Total orders: ${allUserOrders.length}`);
```

### ResultIterator - memory efficient streaming

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

### Find one item

```ts
// Get the latest order without manual paging
const latestOrder = await table
  .query<Order>({ pk: "USER#123" })
  .filter(op => op.beginsWith("sk", "ORDER#"))
  .sortDescending()
  .findOne();

if (latestOrder) {
  console.log(`Latest order: ${latestOrder.orderId}`);
}
```

### Array loading

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

## Type safety

### Generic type parameters

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

### Field selection type safety

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

### Union type support

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

## Global secondary indexes

### Using GSI with type safety

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

### Complex GSI queries

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

## Advanced examples

### E-commerce order processing

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

### Conditional inventory management

```ts
async function processOrder(userId: string, orderId: string, items: Array<{productId: string, quantity: number}>) {
  // Execute transaction with all operations
  await table.transaction(async (tx) => {
    // Reduce inventory for each item. Fails the whole transaction if any item is short of stock
    for (const item of items) {
      table.update({ pk: `PRODUCT#${item.productId}`, sk: "INVENTORY" })
        .condition(op => op.gte("quantity", item.quantity))
        .add("quantity", -item.quantity)
        .withTransaction(tx);
    }

    // Create the order
    table.create({
      pk: `USER#${userId}`,
      sk: `ORDER#${orderId}`,
      orderId,
      items,
      status: "processing",
      createdAt: new Date().toISOString()
    }).withTransaction(tx);
  });
}
```

### Efficient pagination pattern

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

### Error handling

dyno-table wraps query and scan failures in an `OperationError` and preserves the original AWS SDK error on `.cause`. See [Error Handling](./error-handling.md) for the full guide, including the `isConditionalCheckFailed`/`getAwsErrorCode` helpers in `src/utils/error-utils.ts`.

```ts
try {
  const results = await table
    .query<User>({ pk: `USER#${userId}` })
    .filter(op => op.eq("status", "active"))
    .execute();

  return await results.toArray();
} catch (error) {
  if (error instanceof Error && error.cause instanceof Error) {
    console.error("AWS error:", error.cause.name, error.cause.message);
  }
  throw error;
}
```

For higher-level schema validation and semantic query methods, see the [Entity Query Builder](./entity-query-builder.md) instead.
