# dyno-table Entity Query Builder Guide

The dyno-table Entity Query Builder provides a high-level, schema-validated approach to DynamoDB operations. This approach abstracts away partition keys, sort keys, and indexes while providing semantic, business-meaningful query methods and automatic validation.

## Table of Contents

- [Getting Started](#getting-started)
- [Entity Definition](#entity-definition)
- [Query Operations](#query-operations)
- [Key Conditions](#key-conditions)
- [Filter Conditions](#filter-conditions)
- [Query Constraints](#query-constraints)
- [Transaction Operations](#transaction-operations)
- [Pagination & Results](#pagination--results)
- [Type Safety](#type-safety)
- [Custom Query Methods](#custom-query-methods)
- [Advanced Examples](#advanced-examples)

## Getting Started

### Basic Setup with Entity

```ts
import { z } from "zod";
import { defineEntity, createIndex, createQueries } from "dyno-table/entity";
import { partitionKey, sortKey } from "dyno-table/utils";
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

## Entity Definition

### User Entity with Schema Validation

```ts
// Define schema with validation
const userSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  email: z.string().email(),
  status: z.enum(["active", "inactive", "suspended"]),
  createdAt: z.string(),
  settings: z.object({
    theme: z.enum(["light", "dark"]),
    notifications: z.boolean(),
  }).optional(),
  credits: z.number().default(0),
});

type User = z.infer<typeof userSchema>;

const createQuery = createQueries<User>();

// Define key templates for User entity
const userPK = partitionKey`USER#${"id"}`;
const userSK = sortKey`PROFILE`;
const statusPK = partitionKey`STATUS#${"status"}`;
const emailPK = partitionKey`EMAIL#${"email"}`;
const emailSK = sortKey`USER#${"id"}`;

// Define entity with indexes and queries
const UserEntity = defineEntity({
  name: "User",
  schema: userSchema,

  // Primary key structure
  primaryKey: createIndex()
    .input(z.object({ id: z.string() }))
    .partitionKey(({ id }) => userPK({ id }))
    .sortKey(() => userSK({})),

  // Global Secondary Indexes
  indexes: {
    statusIndex: createIndex()
      .input(userSchema)
      .partitionKey(({ status }) => statusPK({ status }))
      .sortKey(({ createdAt }) => createdAt),

    emailIndex: createIndex()
      .input(userSchema)
      .partitionKey(({ email }) => emailPK({ email }))
      .sortKey(({ id }) => emailSK({ id })),
  },

  // Custom semantic query methods
  queries: {
    getActiveUsers: createQuery
      .input(z.object({}))
      .query(({ entity }) =>
        entity.query({ pk: statusPK({ status: "active" }) }).useIndex("statusIndex")
      ),

    getUserByEmail: createQuery
      .input(z.object({ email: z.string().email() }))
      .query(({ input, entity }) =>
        entity.query({ pk: emailPK({ email: input.email }) }).useIndex("emailIndex")
      ),

    getRecentUsers: createQuery
      .input(z.object({ since: z.string() }))
      .query(({ input, entity }) =>
        entity.query({ pk: statusPK({ status: "active" }) })
          .useIndex("statusIndex")
          .filter(op => op.gte("createdAt", input.since))
      ),
  },
});

// Create repository
const userRepo = UserEntity.createRepository(table);
```

### Order Entity Definition

```ts
const orderSchema = z.object({
  id: z.string(),
  userId: z.string(),
  amount: z.number().positive(),
  status: z.enum(["pending", "processing", "shipped", "delivered", "cancelled"]),
  createdAt: z.string(),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().positive(),
    price: z.number().positive(),
  })),
});

type Order = z.infer<typeof orderSchema>;

// Define key templates for Order entity
const orderUserPK = partitionKey`USER#${"userId"}`;
const orderSK = sortKey`ORDER#${"orderId"}`;
const orderStatusPK = partitionKey`STATUS#${"status"}`;

const OrderEntity = defineEntity({
  name: "Order",
  schema: orderSchema,

  primaryKey: createIndex()
    .input(z.object({ userId: z.string(), orderId: z.string() }))
    .partitionKey(({ userId }) => orderUserPK({ userId }))
    .sortKey(({ orderId }) => orderSK({ orderId })),

  indexes: {
    statusIndex: createIndex()
      .input(orderSchema)
      .partitionKey(({ status }) => orderStatusPK({ status }))
      .sortKey(({ createdAt }) => createdAt),
  },

  queries: {
    getUserOrders: createQuery
      .input(z.object({ userId: z.string() }))
      .query(({ input, entity }) =>
        entity.query({ pk: orderUserPK({ userId: input.userId }) })
          .filter(op => op.beginsWith("sk", "ORDER#"))
      ),

    getOrdersByStatus: createQuery
      .input(z.object({ status: z.enum(["pending", "processing", "shipped", "delivered", "cancelled"]) }))
      .query(({ input, entity }) =>
        entity.query({ pk: orderStatusPK({ status: input.status }) }).useIndex("statusIndex")
      ),

    getRecentOrdersForUser: createQuery
      .input(z.object({ userId: z.string(), since: z.string() }))
      .query(({ input, entity }) =>
        entity.query({ pk: orderUserPK({ userId: input.userId }) })
          .filter(op => op.and(
            op.beginsWith("sk", "ORDER#"),
            op.gte("createdAt", input.since)
          ))
      ),
  },
});

const orderRepo = OrderEntity.createRepository(table);
```

## Query Operations

### Get Operations - Direct Item Retrieval

```ts
// Get specific user by ID
const user = await userRepo.get({ id: "123" });
console.log(`User: ${user.name} (${user.status})`);

// Get specific order
const order = await orderRepo.get({ userId: "123", orderId: "456" });
console.log(`Order ${order.id}: $${order.amount}`);

// Strong consistency read
const criticalUser = await userRepo.get({ id: "123" }).consistentRead(true);
```

### Query Operations - Semantic Business Methods

```ts
// Get all orders for a specific user
const userOrders = await orderRepo.query
  .getUserOrders({ userId: "123" })
  .execute();

for await (const order of userOrders) {
  console.log(`Order ${order.id}: $${order.amount}`);
}

// Get active users
const activeUsers = await userRepo.query
  .getActiveUsers()
  .execute();

// Find user by email
const userByEmail = await userRepo.query
  .getUserByEmail({ email: "john@example.com" })
  .execute();

// Get recent users
const recentUsers = await userRepo.query
  .getRecentUsers({ since: "2024-01-01T00:00:00Z" })
  .execute();
```

### Scan Operations - Full Entity Examination

```ts
// Scan all users (with automatic validation)
const allUsers = await userRepo.scan().execute();

// Scan with filters
const premiumUsers = await userRepo.scan()
  .filter(op => op.gt("credits", 1000))
  .execute();

// Scan with field selection
const userProfiles = await userRepo.scan()
  .select(['name', 'email', 'status'])
  .execute();
```

### Batch Operations

```ts
// Get multiple users
const users = await userRepo.batchGet([
  { id: "123" },
  { id: "456" },
  { id: "789" }
]).execute();

// Get multiple orders
const orders = await orderRepo.batchGet([
  { userId: "123", orderId: "001" },
  { userId: "123", orderId: "002" },
  { userId: "456", orderId: "003" }
]).execute();
```

## Key Conditions

### Automatic Key Management

```ts
// Entity handles key construction automatically
// No need to manually construct "USER#123" or "ORDER#456"

// Get user profile (pk: "USER#123", sk: "PROFILE")
const user = await userRepo.get({ id: "123" });

// Get specific order (pk: "USER#123", sk: "ORDER#456")
const order = await orderRepo.get({ userId: "123", orderId: "456" });
```

### Range Queries with Semantic Methods

```ts
// Get orders before a specific date (using semantic query)
const oldOrders = await orderRepo.query
  .getUserOrders({ userId: "123" })
  .filter(op => op.lt("createdAt", "2024-06-01T00:00:00Z"))
  .execute();

// Get recent orders (since a date)
const recentOrders = await orderRepo.query
  .getRecentOrdersForUser({
    userId: "123",
    since: "2024-01-01T00:00:00Z"
  })
  .execute();

// Get orders in date range
const ordersInRange = await orderRepo.query
  .getUserOrders({ userId: "123" })
  .filter(op => op.between("createdAt",
    "2024-01-01T00:00:00Z",
    "2024-12-31T23:59:59Z"
  ))
  .execute();
```

### Proper Date Formatting (Automatic with Entities)

```ts
// Entity ensures proper ISO date format for lexical sorting
const user: User = {
  id: "123",
  name: "John Doe",
  email: "john@example.com",
  status: "active",
  createdAt: new Date().toISOString(), // "2024-01-15T10:30:00.000Z"
  credits: 100,
};

await userRepo.put(user);

// Query by date range works correctly with lexical sorting
const recentUsers = await userRepo.query
  .getRecentUsers({ since: "2024-01-01T00:00:00.000Z" })
  .execute();
```

## Filter Conditions

Filters control which items are returned from queries and scans with automatic type safety and schema validation.

**→ For comprehensive condition patterns including conditional writes and duplicate prevention, see [Conditions Guide](./conditions.md)**

### Comparison Operations

```ts
// Equal to - active users only
const activeUsers = await userRepo.scan()
  .filter(op => op.eq("status", "active"))
  .execute();

// Not equal - exclude suspended users
const validUsers = await userRepo.scan()
  .filter(op => op.ne("status", "suspended"))
  .execute();

// Numeric comparisons - users with high credits
const wealthyUsers = await userRepo.scan()
  .filter(op => op.gt("credits", 1000))
  .execute();

// Range filtering - orders in amount range
const moderateOrders = await orderRepo.scan()
  .filter(op => op.between("amount", 50, 500))
  .execute();

// Array membership - orders with specific statuses
const processingOrders = await orderRepo.scan()
  .filter(op => op.inArray("status", ["processing", "shipped"]))
  .execute();
```

### String and Set Operations

```ts
// String begins with - find users by name prefix
const johnsAndJanes = await userRepo.scan()
  .filter(op => op.or(
    op.beginsWith("name", "John"),
    op.beginsWith("name", "Jane")
  ))
  .execute();

// Contains for nested properties
const darkThemeUsers = await userRepo.scan()
  .filter(op => op.eq("settings.theme", "dark"))
  .execute();

// Contains in arrays - orders with specific product
const ordersWithProduct = await orderRepo.scan()
  .filter(op => op.contains("items", { productId: "PROD#123" }))
  .execute();
```

### Attribute Existence

```ts
// Must have settings - configured users
const configuredUsers = await userRepo.scan()
  .filter(op => op.attributeExists("settings"))
  .execute();

// No deletion timestamp - active records
const activeRecords = await userRepo.scan()
  .filter(op => op.attributeNotExists("deletedAt"))
  .execute();
```

### Complex Logical Operations

```ts
// AND conditions - premium active users
const premiumActiveUsers = await userRepo.scan()
  .filter(op => op.and(
    op.eq("status", "active"),
    op.gt("credits", 500),
    op.attributeExists("settings")
  ))
  .execute();

// OR conditions - high-value orders
const importantOrders = await orderRepo.scan()
  .filter(op => op.or(
    op.gt("amount", 1000),
    op.eq("status", "processing"),
    op.attributeExists("rushDelivery")
  ))
  .execute();

// NOT conditions - exclude test users
const realUsers = await userRepo.scan()
  .filter(op => op.not(
    op.beginsWith("email", "test+")
  ))
  .execute();

// Complex nested logic
const targetUsers = await userRepo.scan()
  .filter(op => op.and(
    op.or(
      op.eq("status", "active"),
      op.eq("status", "inactive")
    ),
    op.not(op.beginsWith("email", "temp+")),
    op.gt("credits", 0)
  ))
  .execute();
```

### Advanced AND/OR Business Logic Patterns

Here are comprehensive real-world examples using entities with schema validation:

```ts
// Find VIP candidates
const vipCandidates = await userRepo.scan()
  .filter(op => op.and(
    op.or(
      op.gt("lifetimeValue", 10000),
      op.gt("totalOrders", 100)
    ),
    op.eq("status", "active"),
    op.eq("emailVerified", true),
    op.attributeNotExists("vipStatus")
  ))
  .execute();

// Find priority orders requiring immediate attention
const priorityOrders = await orderRepo.scan()
  .filter(op => op.and(
    op.or(
      op.gt("amount", 1000),
      op.attributeExists("rushDelivery"),
      op.contains("items", { priority: "urgent" })
    ),
    op.or(
      op.eq("status", "pending"),
      op.eq("status", "processing")
    ),
    op.or(
      op.eq("customerTier", "platinum"),
      op.eq("customerTier", "gold")
    )
  ))
  .execute();

// User Engagement: Find users who need re-engagement
// Need re-engagement = (Inactive recently OR low engagement) AND (was active) AND (has value)
const usersNeedingReengagement = await userRepo.scan()
  .filter(op => op.and(
    op.or(
      op.lt("lastLoginAt", "2024-01-01"),   // Haven't logged in recently
      op.lt("sessionCount", 5),             // Low session count
      op.eq("engagementScore", 0)           // No engagement
    ),
    op.or(
      op.eq("status", "inactive"),          // Currently inactive
      op.attributeExists("dormant")         // Marked as dormant
    ),
    op.or(
      op.gt("lifetimeValue", 100),          // Has spent money
      op.gt("credits", 0),                  // Has credits
      op.attributeExists("purchaseHistory") // Has purchase history
    )
  ))
  .execute();

// Multi-tenant SaaS: Find organizations needing account review
// Need review = (Usage anomaly OR payment issues) AND (active subscription) AND (not recently reviewed)
const organizationsNeedingReview = await organizationRepo.scan()
  .filter(op => op.and(
    op.or(
      op.gt("monthlyApiCalls", 1000000),    // High API usage
      op.gt("storageGB", 500),              // High storage usage
      op.gt("failedPayments", 1),           // Payment issues
      op.lt("paymentSuccessRate", 0.8)      // Low payment success rate
    ),
    op.eq("subscriptionStatus", "active"),  // Active subscription
    op.or(
      op.attributeNotExists("lastReviewedAt"), // Never reviewed
      op.lt("lastReviewedAt", "2024-01-01")    // Not reviewed recently
    )
  ))
  .execute();

// E-commerce Inventory: Find products needing attention
// Need attention = (Low stock OR high return rate OR poor reviews) AND (currently active) AND (profitable)
const productsNeedingAttention = await productRepo.scan()
  .filter(op => op.and(
    op.or(
      op.lt("stockQuantity", 10),           // Low stock
      op.gt("returnRate", 0.15),            // High return rate (>15%)
      op.lt("averageRating", 3.0),          // Poor reviews
      op.gt("supportTickets", 10)           // Many support tickets
    ),
    op.eq("status", "active"),              // Currently active
    op.or(
      op.gt("profitMargin", 0.2),           // Good profit margin
      op.gt("salesVolume", 100),            // High sales volume
      op.eq("strategic", true)              // Strategic product
    )
  ))
  .execute();

// Healthcare: Patient priority triage
// High priority = (Critical symptoms OR emergency referral) AND (not seen today) AND (insurance or emergency)
const highPriorityPatients = await patientRepo.scan()
  .filter(op => op.and(
    op.or(
      op.contains("symptoms", "chest pain"),     // Critical symptoms
      op.contains("symptoms", "difficulty breathing"),
      op.contains("symptoms", "severe pain"),
      op.eq("emergencyReferral", true),          // Emergency referral
      op.eq("triageLevel", "immediate")          // Immediate triage
    ),
    op.or(
      op.attributeNotExists("seenToday"),        // Not seen today
      op.ne("lastVisitDate", new Date().toISOString().split('T')[0])  // Not today
    ),
    op.or(
      op.eq("insuranceVerified", true),          // Insurance verified
      op.eq("emergencyCase", true),              // Emergency case
      op.eq("membershipTier", "premium")         // Premium member
    )
  ))
  .execute();

// Financial Services: Risk assessment
// High risk = (Suspicious activity OR high transaction volume) AND (new account OR previous flags) AND (not verified)
const highRiskAccounts = await accountRepo.scan()
  .filter(op => op.and(
    op.or(
      op.gt("dailyTransactionCount", 100),       // High transaction frequency
      op.gt("dailyTransactionVolume", 50000),    // High transaction volume
      op.attributeExists("suspiciousActivityFlag"), // Flagged activity
      op.contains("transactionPatterns", "unusual")  // Unusual patterns
    ),
    op.or(
      op.lt("accountAgeInDays", 30),             // New account
      op.attributeExists("previousFlags"),       // Previous red flags
      op.gt("velocityWarnings", 2)               // Multiple velocity warnings
    ),
    op.or(
      op.ne("kycStatus", "verified"),            // Not KYC verified
      op.attributeNotExists("documentsVerified"), // Documents not verified
      op.eq("manualReviewRequired", true)        // Requires manual review
    )
  ))
  .execute();

// Gaming: Matchmaking system
// Good match = (Similar skill AND region) OR (skill difference compensated by latency) AND availability
const potentialGameMatches = await playerRepo.scan()
  .filter(op => op.and(
    op.or(
      op.and(                                    // Similar skill same region
        op.between("skillRating", 1800, 2200),
        op.eq("region", "us-west")
      ),
      op.and(                                    // Skill difference with good latency
        op.between("skillRating", 1600, 2400),
        op.lt("averageLatency", 30)
      )
    ),
    op.or(
      op.eq("status", "online"),                 // Currently online
      op.eq("status", "looking-for-game"),       // Looking for game
      op.gte("lastActiveAt", "2024-01-20")       // Recently active
    ),
    op.or(
      op.eq("gameMode", "ranked"),               // Ranked player
      op.eq("gameMode", "competitive"),          // Competitive player
      op.and(                                    // Casual but experienced
        op.eq("gameMode", "casual"),
        op.gt("gamesPlayed", 100)
      )
    )
  ))
  .execute();

// Content Moderation: Find content for review
// Needs review = (User reports OR AI detection OR viral content) AND (not reviewed) AND (significant reach)
const contentForModeration = await contentRepo.scan()
  .filter(op => op.and(
    op.or(
      op.gt("userReports", 2),                   // Multiple user reports
      op.attributeExists("aiModerationFlag"),    // AI detected issues
      op.contains("detectedContent", "sensitive"), // Sensitive content detected
      op.gt("viralityScore", 8.0)                // Highly viral content
    ),
    op.or(
      op.attributeNotExists("moderationStatus"), // Not moderated
      op.eq("moderationStatus", "pending")       // Pending moderation
    ),
    op.or(
      op.gt("viewCount", 10000),                 // High view count
      op.gt("shareCount", 1000),                 // High share count
      op.gt("engagementRate", 0.1),              // High engagement
      op.eq("trending", true)                    // Currently trending
    )
  ))
  .execute();

// Real Estate: Property recommendations
// Good match = (Price range OR negotiable) AND (location preferences) AND (feature requirements)
const recommendedProperties = await propertyRepo.scan()
  .filter(op => op.and(
    op.or(
      op.between("price", 400000, 600000),       // In price range
      op.eq("negotiable", true),                 // Price negotiable
      op.eq("auctionProperty", true)             // Auction property
    ),
    op.or(
      op.eq("neighborhood", "downtown"),         // Preferred neighborhoods
      op.eq("neighborhood", "westside"),
      op.eq("neighborhood", "suburb"),
      op.lt("commuteTime", 30)                   // Acceptable commute
    ),
    op.or(
      op.and(                                    // Family requirements
        op.gte("bedrooms", 3),
        op.gte("bathrooms", 2),
        op.eq("schoolDistrict", "excellent")
      ),
      op.and(                                    // Young professional
        op.gte("bedrooms", 1),
        op.attributeExists("publicTransport"),
        op.attributeExists("walkabilityScore")
      ),
      op.and(                                    // Investment property
        op.gt("rentalYield", 0.05),
        op.eq("rentabilityGrade", "A"),
        op.lt("maintenanceScore", 3)
      )
    )
  ))
  .execute();
```

### Entity-Specific Query Patterns

Leverage entity schemas for domain-specific filtering:

```ts
// User lifecycle queries using schema-validated enums
const usersInTransition = await userRepo.scan()
  .filter(op => op.and(
    op.inArray("status", ["pending", "trial", "converting"]),  // Transitional states
    op.or(
      op.gte("trialExpiresAt", new Date().toISOString()),      // Trial not expired
      op.attributeExists("conversionIntent")                    // Shows conversion intent
    ),
    op.gt("engagementScore", 5)                                // Engaged users
  ))
  .execute();

// Order fulfillment optimization
const ordersForOptimization = await orderRepo.scan()
  .filter(op => op.and(
    op.inArray("status", ["pending", "processing"]),           // Processable orders
    op.or(
      op.eq("shippingMethod", "standard"),                     // Standard shipping
      op.eq("shippingMethod", "expedited")                     // Expedited shipping
    ),
    op.or(
      op.eq("warehouseRegion", "west"),                        // Western warehouse
      op.eq("warehouseRegion", "central"),                     // Central warehouse
      op.lt("estimatedShippingDays", 3)                        // Fast shipping available
    )
  ))
  .execute();

// Subscription management with business rules
const subscriptionsForReview = await subscriptionRepo.scan()
  .filter(op => op.and(
    op.or(
      op.eq("autoRenew", false),                               // No auto-renewal
      op.lt("paymentSuccessRate", 0.8),                        // Payment issues
      op.attributeExists("downgradeRequest")                   // Downgrade requested
    ),
    op.or(
      op.gte("daysUntilExpiry", 7),                            // Expiring soon
      op.gte("daysUntilExpiry", 30)                            // Expiring in month
    ),
    op.or(
      op.gt("lifetimeValue", 500),                             // Valuable customers
      op.eq("tier", "enterprise"),                             // Enterprise customers
      op.gt("usageMetrics", 1000)                              // High usage
    )
  ))
  .execute();
```

### Performance-Optimized Complex Queries

```ts
// ❌ Inefficient: Multiple OR conditions for status
const inefficientStatusQuery = await userRepo.scan()
  .filter(op => op.or(
    op.eq("status", "active"),
    op.eq("status", "premium"),
    op.eq("status", "trial"),
    op.eq("status", "vip")
  ))
  .execute();

// ✅ Better: Use inArray for multiple equality checks
const efficientStatusQuery = await userRepo.scan()
  .filter(op => op.inArray("status", ["active", "premium", "trial", "vip"]))
  .execute();

// ✅ Best: Use entity indexes with semantic queries
const optimizedStatusQuery = await userRepo.query
  .getActiveUsers()  // Uses GSI index
  .execute();

// Complex business logic with efficient patterns
const businessOptimizedQuery = await userRepo.scan()
  .filter(op => op.and(
    op.inArray("status", ["active", "premium"]),              // Efficient multi-value
    op.or(
      op.gt("credits", 1000),                                 // High value
      op.attributeExists("vipMembership")                     // VIP status
    ),
    op.attributeNotExists("suspendedAt")                      // Not suspended
  ))
  .execute();
```

### Chaining Filters with Entity Queries

```ts
// Entity queries support chaining additional filters
const advancedUserQuery = await userRepo.query
  .getActiveUsers()                                           // Use semantic query
  .filter(op => op.gt("credits", 500))                       // Add runtime filter
  .filter(op => op.or(                                       // Add complex logic
    op.eq("settings.theme", "dark"),
    op.eq("preferences.notifications", true)
  ))
  .select(["name", "email", "credits", "settings"])          // Type-safe selection
  .limit(50)                                                  // Limit results
  .execute();

// Chain multiple business filters
const targetCustomersQuery = await orderRepo.query
  .getOrdersByStatus({ status: "processing" })               // Semantic query
  .filter(op => op.gt("amount", 100))                        // Minimum value
  .filter(op => op.or(                                       // Shipping preferences
    op.eq("shippingMethod", "express"),
    op.eq("customerTier", "premium")
  ))
  .sortDescending()                                           // Latest first
  .execute();
```

## Query Constraints

### Limiting Results

```ts
// Get first 10 orders for user
const firstTenOrders = await orderRepo.query
  .getUserOrders({ userId: "123" })
  .limit(10)
  .execute();

// Get most recent 5 orders
const recentOrders = await orderRepo.query
  .getUserOrders({ userId: "123" })
  .sortDescending()
  .limit(5)
  .execute();
```

### Consistency Control

```ts
// Eventual consistency (default)
const user = await userRepo.get({ id: "123" });

// Strong consistency for critical data
const criticalUser = await userRepo.get({ id: "123" })
  .consistentRead(true);
```

### Sort Direction

```ts
// Ascending (default) - oldest first
const oldestFirst = await orderRepo.query
  .getUserOrders({ userId: "123" })
  .sortAscending()
  .execute();

// Descending - newest first
const newestFirst = await orderRepo.query
  .getUserOrders({ userId: "123" })
  .sortDescending()
  .execute();
```

### Type-Safe Field Selection

```ts
// Select specific fields - automatically typed
const userSummaries = await userRepo.scan()
  .select(['name', 'email', 'status'])  // Type: { name: string; email: string; status: "active" | "inactive" | "suspended" }
  .execute();

for await (const user of userSummaries) {
  console.log(user.name);    // ✅ Available and typed
  console.log(user.email);   // ✅ Available and typed
  console.log(user.status);  // ✅ Available and typed as union
  // console.log(user.credits); // ❌ TypeScript error - not selected
}

// Nested field selection
const userPreferences = await userRepo.scan()
  .select(['name', 'settings.theme', 'settings.notifications'])
  .execute();

for await (const user of userPreferences) {
  console.log(user.name);                      // ✅ string
  console.log(user.settings.theme);            // ✅ "light" | "dark"
  console.log(user.settings.notifications);    // ✅ boolean
}
```

### Pagination Control

```ts
// Manual pagination with entity queries
let lastKey: Record<string, unknown> | undefined;
const allOrders: Order[] = [];

do {
  const results = await orderRepo.query
    .getUserOrders({ userId: "123" })
    .limit(25)
    .startFrom(lastKey)
    .execute();

  const pageItems = await results.toArray();
  allOrders.push(...pageItems);
  lastKey = results.getLastEvaluatedKey();
} while (lastKey);
```

## Transaction Operations

### Conditional Checks with Entity Validation

```ts
// Ensure inventory before purchase with full validation
await table.transactWrite([
  // Check stock exists
  inventoryRepo.conditionCheck(
    { productId: "123" },
    op => op.gt("quantity", 0)
  ),

  // Reduce inventory
  inventoryRepo.update(
    { productId: "123" },
    { quantity: val => val.add(-1) }
  ),

  // Create order (automatically validated against schema)
  orderRepo.put({
    id: "789",
    userId: "456",
    amount: 29.99,
    status: "processing",
    createdAt: new Date().toISOString(),
    items: [{
      productId: "123",
      quantity: 1,
      price: 29.99
    }]
  })
]).execute();
```

### Conditional Put with Schema Validation

```ts
// Create user only if doesn't exist (with automatic validation)
await userRepo
  .put({
    id: "123",
    name: "John Doe",
    email: "john@example.com",
    status: "active",
    createdAt: new Date().toISOString(),
    credits: 0
  })
  .condition(op => op.attributeNotExists("pk"))
  .execute();

// Schema validation prevents invalid data
try {
  await userRepo.put({
    id: "123",
    name: "",  // ❌ Fails schema validation (min length 1)
    email: "invalid-email",  // ❌ Fails email validation
    status: "unknown" as any,  // ❌ Invalid enum value
    createdAt: new Date().toISOString()
  });
} catch (error) {
  console.error("Schema validation failed:", error);
}
```

### Conditional Updates

```ts
// Update user credits only if active
await userRepo
  .update({ id: "123" }, {
    credits: val => val.add(100),
    lastUpdated: new Date().toISOString()
  })
  .condition(op => op.eq("status", "active"))
  .execute();

// Complex update conditions
await userRepo
  .update({ id: "123" }, {
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
await userRepo
  .delete({ id: "123" })
  .condition(op => op.eq("status", "inactive"))
  .execute();
```

## Pagination & Results

### Automatic Pagination with Entities

```ts
// Create paginator for semantic query
const paginator = orderRepo.query
  .getOrdersByStatus({ status: "processing" })
  .sortDescending()
  .paginate(20);

// Process page by page
while (paginator.hasNextPage()) {
  const page = await paginator.getNextPage();

  console.log(`Page ${page.page}: ${page.items.length} orders`);

  page.items.forEach(order => {
    console.log(`  Order ${order.id}: $${order.amount}`);
  });
}
```

### Load All Pages at Once

```ts
// Get all orders for user (use carefully with large datasets)
const allUserOrders = await orderRepo.query
  .getUserOrders({ userId: "123" })
  .paginate(50)
  .getAllPages();

console.log(`Total orders: ${allUserOrders.length}`);
```

### ResultIterator - Memory Efficient Streaming

```ts
// Process one item at a time (memory efficient)
const orderIterator = await orderRepo.query
  .getUserOrders({ userId: "123" })
  .execute();

let totalAmount = 0;
let orderCount = 0;

for await (const order of orderIterator) {
  totalAmount += order.amount;
  orderCount++;

  // Can break early to save API calls
  if (order.amount > 10000) {
    console.log(`Found high-value order: ${order.id}`);
    break;
  }
}

console.log(`Processed ${orderCount} orders, total: $${totalAmount}`);
```

### Array Loading

```ts
// Load all results into memory (for small datasets)
const results = await orderRepo.query
  .getUserOrders({ userId: "123" })
  .limit(10)
  .execute();

const orders = await results.toArray();
console.log(`Found ${orders.length} orders`);
```

## Type Safety

### Automatic Schema-Based Types

```ts
// Entity automatically provides full type safety
const users = await userRepo.scan().execute();

for await (const user of users) {
  console.log(user.name);           // ✅ string (from schema)
  console.log(user.email);          // ✅ string (validated email)
  console.log(user.status);         // ✅ "active" | "inactive" | "suspended"
  console.log(user.credits);        // ✅ number (with default: 0)
  // console.log(user.invalidField); // ❌ TypeScript error
}
```

### Schema Validation at Runtime

```ts
// Invalid data is caught at runtime
try {
  await userRepo.put({
    id: "123",
    name: "",  // Fails min length validation
    email: "not-an-email",  // Fails email validation
    status: "invalid" as any,  // Invalid enum value
    createdAt: new Date().toISOString()
  });
} catch (error) {
  console.error("Validation failed:", error.issues);
  // Provides detailed validation errors from Zod
}
```

### Input Validation for Queries

```ts
// Query inputs are also validated
try {
  await userRepo.query.getUserByEmail({
    email: "not-an-email"  // ❌ Fails email validation
  }).execute();
} catch (error) {
  console.error("Query input validation failed:", error);
}

// Correct usage
const user = await userRepo.query.getUserByEmail({
  email: "john@example.com"  // ✅ Valid email
}).execute();
```

## Custom Query Methods

### Defining Semantic Query Methods

```ts
// Add business-meaningful query methods to entities
const UserEntityExtended = defineEntity({
  name: "User",
  schema: userSchema,
  primaryKey: createIndex()
    .input(z.object({ id: z.string() }))
    .partitionKey(({ id }) => userPK({ id }))
    .sortKey(() => userSK({})),

  indexes: {
    statusIndex: createIndex()
      .input(userSchema)
      .partitionKey(({ status }) => statusPK({ status }))
      .sortKey(({ createdAt }) => createdAt),
  },

  queries: {
    // Get premium users (high credit balance)
    getPremiumUsers: createQuery
      .input(z.object({}))
      .query(({ entity }) =>
        entity.scan().filter(op => op.gt("credits", 1000))
      ),

    // Get users who joined after a date
    getUsersJoinedAfter: createQuery
      .input(z.object({ date: z.string() }))
      .query(({ input, entity }) =>
        entity.query({ pk: statusPK({ status: "active" }) })
          .useIndex("statusIndex")
          .filter(op => op.gte("createdAt", input.date))
      ),

    // Get users with specific settings
    getUsersWithDarkTheme: createQuery
      .input(z.object({}))
      .query(({ entity }) =>
        entity.scan()
          .filter(op => op.eq("settings.theme", "dark"))
      ),

    // Complex business query - engaged users
    getEngagedUsers: createQuery
      .input(z.object({ minCredits: z.number().optional().default(100) }))
      .query(({ input, entity }) =>
        entity.scan().filter(op => op.and(
          op.eq("status", "active"),
          op.gt("credits", input.minCredits),
          op.attributeExists("settings"),
          op.eq("settings.notifications", true)
        ))
      ),
  },
});

const extendedUserRepo = UserEntityExtended.createRepository(table);
```

### Using Custom Query Methods

```ts
// Use semantic business methods
const premiumUsers = await extendedUserRepo.query
  .getPremiumUsers()
  .execute();

const recentUsers = await extendedUserRepo.query
  .getUsersJoinedAfter({ date: "2024-01-01T00:00:00Z" })
  .execute();

const darkThemeUsers = await extendedUserRepo.query
  .getUsersWithDarkTheme()
  .execute();

const engagedUsers = await extendedUserRepo.query
  .getEngagedUsers({ minCredits: 500 })
  .execute();

// Chain additional filters at runtime
const vipEngagedUsers = await extendedUserRepo.query
  .getEngagedUsers({ minCredits: 1000 })
  .filter(op => op.contains("name", "VIP"))
  .limit(10)
  .execute();
```

## Advanced Examples

### E-commerce Customer Analytics

```ts
// Business intelligence query using entity layer
async function getCustomerInsights(userId: string) {
  const user = await userRepo.get({ id: userId });

  const orders = await orderRepo.query
    .getUserOrders({ userId })
    .execute();

  let totalSpent = 0;
  let orderCount = 0;
  const statusCounts: Record<string, number> = {};
  const monthlySpending: Record<string, number> = {};

  for await (const order of orders) {
    totalSpent += order.amount;
    orderCount++;
    statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;

    const month = order.createdAt.substring(0, 7); // "2024-01"
    monthlySpending[month] = (monthlySpending[month] || 0) + order.amount;
  }

  return {
    customer: {
      name: user.name,
      email: user.email,
      status: user.status,
      credits: user.credits,
    },
    analytics: {
      totalSpent,
      orderCount,
      averageOrderValue: totalSpent / orderCount,
      statusBreakdown: statusCounts,
      monthlySpending,
    }
  };
}
```

### Validated Order Processing

```ts
async function processOrderWithValidation(orderData: {
  userId: string;
  orderId: string;
  items: Array<{productId: string, quantity: number, price: number}>;
}) {
  // Calculate total with validation
  const amount = orderData.items.reduce((sum, item) => {
    if (item.quantity <= 0 || item.price <= 0) {
      throw new Error(`Invalid item: ${item.productId}`);
    }
    return sum + (item.quantity * item.price);
  }, 0);

  // Create order - schema automatically validates structure
  const order: Order = {
    id: orderData.orderId,
    userId: orderData.userId,
    amount,
    status: "pending",
    createdAt: new Date().toISOString(),
    items: orderData.items,
  };

  // Build transaction with validation at each step
  const transactionOps = [];

  // Check inventory for each item
  for (const item of orderData.items) {
    transactionOps.push(
      inventoryRepo.conditionCheck(
        { productId: item.productId },
        op => op.gte("quantity", item.quantity)
      )
    );
  }

  // Update inventory
  for (const item of orderData.items) {
    transactionOps.push(
      inventoryRepo.update(
        { productId: item.productId },
        {
          quantity: val => val.add(-item.quantity),
          lastSold: new Date().toISOString()
        }
      )
    );
  }

  // Create the order with automatic validation
  transactionOps.push(orderRepo.put(order));

  // Execute transaction
  await table.transactWrite(transactionOps).execute();

  return order;
}
```

### User Status Management

```ts
// Business logic for user lifecycle management
class UserService {
  constructor(private userRepo: typeof userRepo) {}

  async activateUser(userId: string) {
    return await this.userRepo
      .update({ id: userId }, {
        status: "active",
        activatedAt: new Date().toISOString()
      })
      .condition(op => op.eq("status", "inactive"))
      .execute();
  }

  async suspendUser(userId: string, reason: string) {
    return await this.userRepo
      .update({ id: userId }, {
        status: "suspended",
        suspendedAt: new Date().toISOString(),
        suspensionReason: reason
      })
      .condition(op => op.eq("status", "active"))
      .execute();
  }

  async getUsersRequiringReview() {
    return await this.userRepo.scan()
      .filter(op => op.and(
        op.eq("status", "active"),
        op.lt("credits", 0),
        op.attributeNotExists("reviewedAt")
      ))
      .execute();
  }

  async promoteToVip(userId: string) {
    const user = await this.userRepo.get({ id: userId });

    if (user.credits < 5000) {
      throw new Error("User does not qualify for VIP status");
    }

    return await this.userRepo
      .update({ id: userId }, {
        vipStatus: true,
        vipSince: new Date().toISOString(),
        credits: val => val.add(1000) // VIP bonus
      })
      .condition(op => op.and(
        op.eq("status", "active"),
        op.gte("credits", 5000)
      ))
      .execute();
  }
}

const userService = new UserService(userRepo);
```

### Efficient Bulk Operations

```ts
// Process large datasets efficiently with entities
async function processAllActiveUsers() {
  const paginator = userRepo.query
    .getActiveUsers()
    .sortAscending()
    .paginate(100);

  let processedCount = 0;
  const results = {
    updated: 0,
    errors: 0,
    skipped: 0
  };

  while (paginator.hasNextPage()) {
    const page = await paginator.getNextPage();

    for (const user of page.items) {
      try {
        // Business logic with validation
        if (user.credits > 10000) {
          await userRepo.update({ id: user.id }, {
            tier: "platinum",
            lastTierUpdate: new Date().toISOString()
          }).execute();
          results.updated++;
        } else {
          results.skipped++;
        }

        processedCount++;

        // Progress reporting
        if (processedCount % 100 === 0) {
          console.log(`Processed ${processedCount} users...`);
        }

      } catch (error) {
        console.error(`Error processing user ${user.id}:`, error);
        results.errors++;
      }
    }

    // Rate limiting
    if (paginator.hasNextPage()) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return {
    totalProcessed: processedCount,
    results
  };
}
```

This comprehensive guide demonstrates how dyno-table's Entity Query Builder provides schema validation, semantic query methods, and business-meaningful abstractions while maintaining all the power and flexibility of the underlying DynamoDB operations.
