# 🎯 DynamoDB Conditions Guide

Conditions in DynamoDB are powerful expressions that control when operations succeed or fail. They're essential for data integrity, preventing race conditions, and implementing complex business logic atomically.

## 📋 Quick Reference

```typescript
// Prevent duplicate inserts
await table.put(newUser)
  .condition(op => op.attributeNotExists("email"));

// Conditional updates
await table.update({ pk: "USER#123" })
  .set({ status: "PREMIUM" })
  .condition(op => op.and(
    op.eq("status", "ACTIVE"),
    op.gte("credits", 1000)
  ));

// Complex business logic
await table.delete({ pk: "ORDER#456" })
  .condition(op => op.or(
    op.eq("status", "CANCELLED"),
    op.and(
      op.eq("status", "PENDING"),
      op.lt("createdAt", "2024-01-01")
    )
  ));
```

## 🔍 What Are Conditions?

Conditions are boolean expressions that DynamoDB evaluates **before** performing an operation. If the condition evaluates to `false`, the operation is rejected with a `ConditionalCheckFailedException`.

### Key Benefits

- **Data Integrity**: Prevent invalid state transitions
- **Race Condition Prevention**: Ensure atomic operations in concurrent environments
- **Business Logic Enforcement**: Implement complex rules at the database level
- **Optimistic Locking**: Handle concurrent updates safely

## 🎯 When Conditions Are Evaluated

| Operation | When Conditions Are Checked | Impact if Failed |
|-----------|----------------------------|------------------|
| **PUT** | Before writing the item | Item is not created/replaced |
| **UPDATE** | Before applying updates | Item remains unchanged |
| **DELETE** | Before removing the item | Item is not deleted |
| **Transaction** | Before any operation executes | Entire transaction is rolled back |

## 🚀 Comparison Operators

### Equality & Inequality

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

### Numeric & Lexicographic Comparisons

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

### Range & Membership Testing

```typescript
// Range testing (inclusive)
op.between("price", 50, 200)        // price BETWEEN 50 AND 200
op.between("date", "2024-01-01", "2024-12-31")

// List membership (max 100 values)
op.inArray("status", ["ACTIVE", "PENDING", "PROCESSING"])
op.inArray("priority", [1, 2, 3])
```

### String Operations

```typescript
// Prefix matching
op.beginsWith("email", "@company.com")  // begins_with(email, "@company.com")
op.beginsWith("id", "USER#")            // begins_with(id, "USER#")

// Substring/element testing
op.contains("description", "urgent")     // contains(description, "urgent")
op.contains("tags", "featured")          // contains(tags, "featured") - for sets
```

### Attribute Existence

```typescript
// Check if attribute exists
op.attributeExists("phone")              // attribute_exists(phone)
op.attributeExists("profile.avatar")     // attribute_exists(profile.avatar)

// Check if attribute doesn't exist
op.attributeNotExists("deletedAt")       // attribute_not_exists(deletedAt)
op.attributeNotExists("processedAt")     // attribute_not_exists(processedAt)
```

## 🔗 Logical Operators

### AND Logic - All Must Be True

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

### OR Logic - At Least One Must Be True

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

### NOT Logic - Negation

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

## 🛡️ Conditional Inserts - Preventing Duplicates

One of the most common use cases for conditions is preventing duplicate data insertion. Here are comprehensive patterns for different scenarios:

### Prevent Duplicate Primary Keys

```typescript
// Ensure item doesn't already exist
await table.put({
  pk: "USER#john@example.com",
  sk: "PROFILE",
  email: "john@example.com",
  name: "John Doe",
  createdAt: new Date().toISOString()
})
.condition(op => op.attributeNotExists("pk"));
// Fails if any item with this pk already exists
```

## ⚠️ Common Pitfalls & Solutions

### 1. Condition Expression Limitations

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

### 2. Type Mismatches

```typescript
// ❌ Wrong: Comparing string to number
op.gt("stringField", 100) // Runtime error

// ✅ Correct: Ensure type consistency
op.gt("numericField", 100)
op.gt("stringField", "100") // Lexicographic comparison
```

### 3. Complex Condition Readability

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

## 📚 Related Guides

- [Table Query Builder](./table-query-builder.md) - Using conditions in queries and scans
- [Entity Query Builder](./entity-query-builder.md) - Type-safe conditions with entities
- [Transactions](./transactions.md) - Atomic operations with conditions
- [Batch Operations](./batch-operations.md) - Bulk operations with conditional logic
- [Error Handling](./error-handling.md) - Comprehensive error handling strategies
- [Performance](./performance.md) - Optimizing condition performance
