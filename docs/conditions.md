# DynamoDB conditions guide

A condition is an expression DynamoDB checks before an operation runs. If it's false, the operation fails instead of silently succeeding. That's how you prevent duplicate writes, avoid race conditions, and enforce business rules atomically.

## Quick reference

```typescript
// Prevent duplicate inserts
await table.put(newUser)
  .condition(op => op.attributeNotExists("email"))
  .execute();

// Conditional updates
await table.update({ pk: "USER#123" })
  .set({ status: "PREMIUM" })
  .condition(op => op.and(
    op.eq("status", "ACTIVE"),
    op.gte("credits", 1000)
  ))
  .execute();

// Complex business logic
await table.delete({ pk: "ORDER#456" })
  .condition(op => op.or(
    op.eq("status", "CANCELLED"),
    op.and(
      op.eq("status", "PENDING"),
      op.lt("createdAt", "2024-01-01")
    )
  ))
  .execute();
```

## What are conditions?

Conditions are boolean expressions that DynamoDB evaluates before it performs an operation. If a condition evaluates to `false`, DynamoDB rejects the request with a `ConditionalCheckFailedException` instead of applying the change. Use them for optimistic locking as well as the cases above.

## When conditions are evaluated

| Operation | When conditions are checked | Impact if failed |
|-----------|----------------------------|------------------|
| **PUT** | Before writing the item | Item is not created/replaced |
| **UPDATE** | Before applying updates | Item remains unchanged |
| **DELETE** | Before removing the item | Item is not deleted |
| **Transaction** | Before any operation executes | Entire transaction is rolled back |

## Comparison operators

### Equality and inequality

```typescript
interface User {
  id: string;
  status: "ACTIVE" | "INACTIVE" | "BANNED";
  role: "admin" | "user" | "guest";
  credits: number;
}

// Exact match
op.eq("status", "ACTIVE") // status = "ACTIVE"

// Not equal
op.ne("status", "BANNED") // status <> "BANNED"
```

### Numeric and lexicographic comparisons

```typescript
// Numeric comparisons
op.lt("credits", 100)    // credits < 100
op.lte("credits", 1000)  // credits <= 1000
op.gt("age", 18)         // age > 18
op.gte("score", 85)      // score >= 85

// String comparisons (lexicographic)
op.lt("name", "M")       // Names starting with A-L
op.gte("version", "2.0") // Version 2.0 and above

// Date comparisons (ISO strings)
op.gt("createdAt", "2024-01-01T00:00:00Z")
```

### Range and membership testing

```typescript
// Range testing (inclusive)
op.between("price", 50, 200)        // price BETWEEN 50 AND 200
op.between("date", "2024-01-01", "2024-12-31")

// List membership (max 100 values)
op.inArray("status", ["ACTIVE", "PENDING", "PROCESSING"])
op.inArray("priority", [1, 2, 3])
```

### String operations

```typescript
// Prefix matching
op.beginsWith("email", "@company.com")  // begins_with(email, "@company.com")
op.beginsWith("id", "USER#")            // begins_with(id, "USER#")

// Substring/element testing
op.contains("description", "urgent")     // contains(description, "urgent")
op.contains("tags", "featured")          // contains(tags, "featured") - for sets
```

### Attribute existence

```typescript
// Check if attribute exists
op.attributeExists("phone")              // attribute_exists(phone)
op.attributeExists("profile.avatar")     // attribute_exists(profile.avatar)

// Check if attribute doesn't exist
op.attributeNotExists("deletedAt")       // attribute_not_exists(deletedAt)
op.attributeNotExists("processedAt")     // attribute_not_exists(processedAt)
```

## Logical operators

### AND logic: all must be true

```typescript
// Multiple criteria must all be met
op.and(
  op.eq("status", "ACTIVE"),
  op.gt("credits", 100),
  op.attributeExists("email"),
  op.ne("role", "banned")
)
// Evaluates to: status = "ACTIVE" AND credits > 100 AND attribute_exists(email) AND role <> "banned"

// Business rule enforcement
op.and(
  op.eq("accountType", "PREMIUM"),
  op.gte("subscriptionEnd", new Date().toISOString()),
  op.attributeNotExists("suspendedAt")
)
```

### OR logic: at least one must be true

```typescript
// Alternative conditions - any can be satisfied
op.or(
  op.eq("role", "admin"),
  op.eq("role", "moderator"),
  op.and(
    op.eq("role", "user"),
    op.eq("verified", true)
  )
)

// Status-based processing
op.or(
  op.eq("status", "READY_FOR_PROCESSING"),
  op.and(
    op.eq("status", "PENDING"),
    op.lt("createdAt", "2024-01-01")
  )
)
```

### NOT logic: negation

```typescript
// Exclude specific conditions
op.not(op.eq("status", "DELETED"))

// Complex negation
op.not(
  op.and(
    op.eq("role", "guest"),
    op.attributeNotExists("verificationToken")
  )
)

// Exclude multiple values
op.not(op.inArray("status", ["DELETED", "ARCHIVED", "SUSPENDED"]))
```

## Conditional inserts: preventing duplicates

One of the most common uses for conditions is preventing duplicate writes.

### Prevent duplicate primary keys

```typescript
// Ensure item doesn't already exist
await table.put({
  pk: "USER#john@example.com",
  sk: "PROFILE",
  email: "john@example.com",
  name: "John Doe",
  createdAt: new Date().toISOString()
})
.condition(op => op.attributeNotExists("pk"))
.execute();
// Fails if any item with this pk already exists
```

## Common pitfalls and solutions

### 1. Condition expression limitations

```typescript
// ❌ Wrong: Referencing non-existent attributes in comparison
op.gt("nonExistentField", 100) // Fails if field doesn't exist

// ✅ Correct: Check existence first
op.and(
  op.attributeExists("optionalField"),
  op.gt("optionalField", 100)
)

// ✅ Alternative: Use attribute_not_exists for inverse logic
op.or(
  op.attributeNotExists("optionalField"),
  op.lte("optionalField", 100)
)
```

### 2. Type mismatches

```typescript
// ❌ Wrong: Comparing string to number
op.gt("stringField", 100) // Runtime error

// ✅ Correct: Ensure type consistency
op.gt("numericField", 100)
op.gt("stringField", "100") // Lexicographic comparison
```

### 3. Complex condition readability

```typescript
// ❌ Hard to read and maintain
op.and(
  op.or(op.eq("status", "A"), op.eq("status", "B")),
  op.and(op.gt("score", 80), op.lt("score", 100)),
  op.or(op.attributeExists("premium"), op.gt("level", 5))
)

// ✅ Better: Break down into logical chunks
import { and, or, inArray, between, attributeExists, gt } from "dyno-table/conditions";

const validStatuses = inArray("status", ["A", "B"]);
const goodScore = between("score", 80, 100);
const eligibleUser = or(
  attributeExists("premium"),
  gt("level", 5)
);

const finalCondition = and(validStatuses, goodScore, eligibleUser);
```

## Related guides

- [Table query builder](./table-query-builder.md) - Using conditions in queries and scans
- [Entity query builder](./entity-query-builder.md) - Type-safe conditions with entities
- [Transactions](./transactions.md) - Atomic operations with conditions
- [Batch operations](./batch-operations.md) - Bulk operations with conditional logic
- [Error handling](./error-handling.md) - What a failed condition throws and how to catch it
