# dyno-table query builder guide

The dyno-table Query Builder builds complex DynamoDB queries through a chainable, type-safe API. dyno-table offers two approaches to DynamoDB operations, each suited to different situations.

## Table vs entity: which to use

- **Table Query Builder.** Direct control over partition keys, sort keys, and indexes. Best for complex or custom access patterns and for learning DynamoDB concepts. See the [Table Query Builder Guide](./table-query-builder.md).
- **Entity Query Builder.** Schema validation and business-semantic query methods (e.g. `getActiveUsers()` instead of raw key conditions). Best for application development and maintainability. See the [Entity Query Builder Guide](./entity-query-builder.md).

Both are built on the same underlying operations, so you can mix them in the same application.

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

## Side-by-side examples

### Get a user
```ts
// Table approach - direct key specification
const user = await table
  .query<User>({ pk: "USER#123", sk: "PROFILE" })
  .execute();

// Entity approach - semantic method
const { item: user } = await userRepo.get({ id: "123" }).execute();
```

### Query with filters
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

### Complex business query
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

## Documentation structure

Each approach's guide covers:

- **Getting Started** - Setup and basic concepts
- **Query Operations** - All supported operation types
- **Key Conditions** - Sort key operators and range queries
- **Filter Conditions** - Complex filtering with logical operations
- **Query Constraints** - Limits, consistency, sorting, field selection
- **Transaction Operations** - ACID operations with conditions
- **Pagination & Results** - Different result handling strategies
- **Advanced Examples** - Real-world patterns and best practices

## Migration between approaches

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
