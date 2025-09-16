# src/entity/ Directory

This directory contains the Entity pattern implementation, which provides a higher-level abstraction over the Table layer with schema validation and semantic business methods.

## Files

- **`entity.ts`** - Main Entity class implementation with repository pattern and schema integration
- **`ddb-indexing.ts`** - DynamoDB index management utilities for entity operations
- **`index-utils.ts`** - Helper utilities for working with DynamoDB indexes in entity context

## Entity Pattern Overview

The Entity pattern transforms raw DynamoDB operations into semantic business methods with strong typing and validation:

```typescript
// Instead of cryptic table operations:
await table.query({ pk: "USER", sk: { beginsWith: "EMAIL#" } }).execute();

// Use semantic entity methods:
const users = await UserEntity.query.getUsersByEmail().execute();
```

## Key Features

**Schema Validation**: Integrates with Standard Schema validation libraries (Zod, ArkType, Valibot) to ensure data integrity:
```typescript
const UserEntity = defineEntity({
  schema: z.object({
    id: z.string(),
    email: z.string().email(),
    status: z.enum(['ACTIVE', 'INACTIVE'])
  })
});
```

**Automatic Key Generation**: Entities handle partition key and sort key generation based on entity patterns, removing the need to manually construct DynamoDB keys.

**Repository Pattern**: Each entity creates a repository with typed methods for common operations:
- `create()` - Create new entities with validation
- `get()` - Retrieve by primary key
- `update()` - Atomic updates with optimistic locking
- `delete()` - Safe deletion with conditions
- Custom query methods based on indexes

**Type Safety**: Full TypeScript integration ensures compile-time validation of entity operations and return types.

**Index Management**: Automatic handling of Global Secondary Indexes (GSI) and Local Secondary Indexes (LSI) with proper key construction.

## Design Philosophy

**Business Logic Focus**: Move from thinking about DynamoDB keys to thinking about business entities and operations.

**Validation First**: All data is validated against schemas before persistence, preventing invalid data from reaching DynamoDB.

**Semantic Naming**: Query methods use business terminology rather than technical DynamoDB concepts (e.g., `getUsersByStatus()` vs `gsi1Query()`).

**Standard Schema Compatibility**: Works with any validation library implementing the Standard Schema interface, giving developers flexibility in their choice of validation library.

## Testing
- **`__tests__/`** - Unit tests for entity functionality and schema integration
