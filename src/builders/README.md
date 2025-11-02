# src/builders/ Directory

This directory contains all the fluent builder implementations for DynamoDB operations. Builders provide a type-safe, chainable API for constructing and executing DynamoDB operations.

## Core Builder Files

### Query & Scan Operations
- **`query-builder.ts`** - Type-safe query operations with key conditions and filters
- **`scan-builder.ts`** - Full table scan operations with filtering capabilities
- **`filter-builder.ts`** - Shared filtering logic for queries and scans

### CRUD Operations
- **`get-builder.ts`** - Single item retrieval operations
- **`put-builder.ts`** - Create/replace item operations with conditions
- **`update-builder.ts`** - Atomic update operations with expressions and conditions
- **`delete-builder.ts`** - Delete operations with conditional logic

### Batch & Transaction Operations
- **`batch-builder.ts`** - Batch read/write operations with automatic chunking (25 items for writes, 100 for reads)
- **`transaction-builder.ts`** - ACID transaction operations across multiple items

### Utility & Support
- **`condition-check-builder.ts`** - Conditional checks for transactions
- **`paginator.ts`** - Memory-efficient pagination for large result sets
- **`result-iterator.ts`** - Streaming result processing with async iteration
- **`entity-aware-builders.ts`** - Entity-specific builder extensions
- **`builder-types.ts`** - Common types and interfaces for all builders
- **`types.ts`** - Type definitions specific to builders

## Key Design Patterns

**Fluent Interface**: All builders use method chaining for readable, intuitive operation construction:
```typescript
await table.query({ pk: "USER#123" })
  .filter(op => op.eq("status", "ACTIVE"))
  .limit(50)
  .execute();
```

**Type Safety**: Builders provide compile-time type checking for conditions, expressions, and return types.

**Memory Efficiency**: ResultIterator pattern enables streaming processing of large datasets without loading everything into memory.

**Error Prevention**: Builders validate operations at compile time, preventing common DynamoDB errors like invalid key conditions or missing required fields.

**AWS SDK Integration**: All builders compile down to native AWS SDK v3 operations while providing a more ergonomic developer experience.

## Testing
- **`__tests__/`** - Comprehensive unit tests for all builder functionality
