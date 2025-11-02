# dyno-table Query Builder Guide

The dyno-table Query Builder provides a powerful, type-safe API for creating complex DynamoDB queries with a fluent, chainable interface. dyno-table offers two complementary approaches to DynamoDB operations, each optimized for different use cases.

## Choose Your Approach

dyno-table provides two ways to work with DynamoDB, each with distinct advantages:

### 🔧 Table Query Builder
**Direct control with full DynamoDB flexibility**

- **When to use**: You need direct control over partition keys, sort keys, and indexes
- **Best for**: Complex queries, custom access patterns, learning DynamoDB concepts
- **Approach**: Manual key management, explicit index usage, direct DynamoDB operations

**→ [Complete Table Query Builder Guide](./table-query-builder.md)**

### 🎯 Entity Query Builder
**High-level abstraction with business semantics**

- **When to use**: You want schema validation, semantic queries, and business-focused methods
- **Best for**: Application development, team productivity, maintainable code
- **Approach**: Schema-first design, automatic validation, business-meaningful query names

**→ [Complete Entity Query Builder Guide](./entity-query-builder.md)**

## Quick Comparison

| Feature | Table Approach | Entity Approach |
|---------|---------------|-----------------|
| **Query Syntax** | `table.query({ pk: "USER#123" })` | `userRepo.get({ id: "123" })` |
| **Key Management** | Manual (`"USER#123"`, `"ORDER#456"`) | Automatic (handled by entity) |
| **Type Safety** | Generic types (`<User>`) | Schema-inferred (automatic) |
| **Validation** | Manual/None | Automatic (Zod, ArkType, etc.) |
| **Query Names** | Direct DynamoDB terms | Business semantics |
| **Index Usage** | Explicit (`.useIndex("gsi1")`) | Abstracted (handled internally) |
| **Learning Curve** | Higher (DynamoDB knowledge required) | Lower (focus on business logic) |
| **Flexibility** | Maximum | High (within entity constraints) |

## Side-by-Side Examples

### Get a User
```ts
// Table approach - direct key specification
const user = await table
  .query<User>({ pk: "USER#123", sk: "PROFILE" })
  .execute();

// Entity approach - semantic method
const user = await userRepo.get({ id: "123" });
```

### Query with Filters
```ts
// Table approach - explicit structure
const activeUsers = await table
  .scan<User>()
  .filter(op => op.and(
    op.eq("status", "active"),
    op.beginsWith("sk", "PROFILE")
  ))
  .execute();

// Entity approach - semantic query
const activeUsers = await userRepo.query
  .getActiveUsers()
  .execute();
```

### Complex Business Query
```ts
// Table approach - direct conditions
const premiumUsers = await table
  .query({ pk: "STATUS#active" })
  .useIndex("status-index")
  .filter(op => op.gt("credits", 1000))
  .execute();

// Entity approach - business method
const premiumUsers = await userRepo.query
  .getPremiumUsers()
  .execute();
```

## Supported Features

Both approaches support the complete feature set of dyno-table:

### Core Operations
- ✅ Query, Scan, BatchGet, Transactions
- ✅ All DynamoDB condition operators (`eq`, `gt`, `between`, `beginsWith`, etc.)
- ✅ Complex logical operations (`and`, `or`, `not`)
- ✅ Global Secondary Index support
- ✅ Pagination with multiple strategies
- ✅ Memory-efficient streaming with `ResultIterator`

### Type Safety & Validation
- ✅ Full TypeScript integration
- ✅ Union type support for enums
- ✅ Nested property access
- ✅ Runtime schema validation (Entity approach)
- ✅ Compile-time type checking

### Advanced Features
- ✅ Conditional operations for all CRUD operations
- ✅ Transaction support with condition checks
- ✅ Consistent reads
- ✅ Sort direction control
- ✅ Manual and automatic pagination
- ✅ Performance optimization patterns

## Documentation Structure

Each approach has comprehensive documentation covering:

- **Getting Started** - Setup and basic concepts
- **Query Operations** - All supported operation types
- **Key Conditions** - Sort key operators and range queries
- **Filter Conditions** - Complex filtering with logical operations
- **Query Constraints** - Limits, consistency, sorting, field selection
- **Transaction Operations** - ACID operations with conditions
- **Pagination & Results** - Different result handling strategies
- **Advanced Examples** - Real-world patterns and best practices

## Migration Between Approaches

You can start with one approach and migrate to the other, or even use both in the same application:

```ts
// Start with Table approach for learning
const orders = await table
  .query<Order>({ pk: "USER#123" })
  .filter(op => op.beginsWith("sk", "ORDER#"))
  .execute();

// Migrate to Entity approach for maintainability
const orders = await orderRepo.query
  .getUserOrders({ userId: "123" })
  .execute();

// Or use both approaches together
const tableResults = await table.scan().execute();
const entityResults = await userRepo.scan().execute();
```

## Next Steps

Choose the approach that best fits your needs:

- **Learning DynamoDB?** → Start with [Table Query Builder](./table-query-builder.md)
- **Building applications?** → Jump to [Entity Query Builder](./entity-query-builder.md)
- **Need maximum flexibility?** → Use [Table Query Builder](./table-query-builder.md)
- **Want productivity & validation?** → Use [Entity Query Builder](./entity-query-builder.md)

Both approaches provide the same powerful, type-safe foundation with different levels of abstraction to match your specific use case.
