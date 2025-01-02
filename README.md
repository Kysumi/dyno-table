# dyno-table 🚀

A powerful, type-safe, and fluent DynamoDB table abstraction layer for Node.js applications.

## Features ✨
- 🔄 **Fluent API**: Intuitive builder pattern for constructing DynamoDB operations
- 🎯 **Smart Retries**: Built-in exponential backoff with configurable retry strategies
- 🏗️ **Expression Builder**: Automatically handles complex DynamoDB expressions and attribute mappings
- 🔍 **Query Builder**: Powerful and flexible query construction with support for GSIs
- 📦 **Repository Pattern**: Easily create and manage data repositories with type-safe schemas
- 🧪 **Type Safety**: Utilizes Zod for runtime schema validation and TypeScript type inference

## Quick Start 🚀

```typescript
import { Table } from 'dyno-table';
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";

// Initialize your DynamoDB client
const client = DynamoDBDocument.from(/* your DynamoDB client config */);

// Create a table instance
const table = new Table({
  client,
  tableName: 'your-table-name',
  gsiIndexes: {
    base: { pkName: 'PK', skName: 'SK' },
    GSI1: { pkName: 'GSI1PK', skName: 'GSI1SK' }
  }
});
```

## Basic Operations 💫

### Querying Data

```typescript
// Simple query
const result = await table
  .query({ pk: 'USER#123', sk: 'PROFILE#' })
  .where('status', '=', 'active')
  .limit(10)
  .execute();

// Query with GSI
const gsiResult = await table
  .query({ pk: 'ORG#123', sk: { operator: 'begins_with', value: 'USER#' }})
  .useIndex('GSI1')
  .where('role', '=', 'admin')
  .execute();
```

### Writing Data

```typescript
// Put item with condition
await table
  .put({ id: '123', name: 'John', status: 'active' })
  .whereNotExists('id')
  .execute();

// Update with conditions
await table
  .update({ pk: 'USER#123', sk: 'PROFILE#1' })
  .set('name', 'John Doe')
  .set('status', 'active')
  .remove('oldField')
  .whereExists('id')
  .execute();
```

## Repository Pattern 🏗️

```typescript
import { z } from 'zod';
import { BaseRepository } from 'dyno-table';

// Define your schema
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  status: z.enum(['active', 'inactive']),
  createdAt: z.string()
});

class UserRepository extends BaseRepository<typeof UserSchema> {
  constructor(table: Table) {
    super(table, UserSchema);
  }

  protected createPrimaryKey(data: z.infer<typeof UserSchema>) {
    return {
      pk: `USER#${data.id}`,
      sk: `PROFILE#${data.id}`
    };
  }

  protected getIndexKeys() {
    return {
      pk: 'USER#',
      sk: 'PROFILE#'
    };
  }

  /**
  * Applies a filter to the query to only return models with this type
  */
  protected getType() {
    return 'USER';
  }
}
```

## Contributing 🤝

### Developing

```bash
# Installing the dependencies
pnpm i

# Installing the peerDependencies manually
pnpm i @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb zod
```


### Testing

```bash
docker run -p 8000:8000 amazon/dynamodb-local
```
