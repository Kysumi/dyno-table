# Error handling

Every dyno-table error extends `DynoTableError`, which carries a `code` for programmatic handling and a `context` object for debugging.

## Error class hierarchy

The base class looks like this:

```typescript
class DynoTableError extends Error {
  readonly code: string;           // Error code for programmatic handling
  readonly context: Record<string, unknown>; // Debugging context
  readonly cause?: Error;          // Original error (e.g., from AWS SDK)
}
```

### Error types

#### 1. ValidationError
Thrown when input validation fails, e.g. calling `.execute()` on a builder that has no actions configured, or passing an undefined value where DynamoDB requires one.

**Example:**
```typescript
import { ValidationError } from 'dyno-table';

try {
  // No set()/remove()/add()/delete() calls configured
  await table.update({ pk: "USER#123", sk: "PROFILE" }).execute();
} catch (error) {
  if (error instanceof ValidationError) {
    console.log('Validation failed:', error.message);
    console.log('Error code:', error.code); // "NO_UPDATE_ACTIONS"
    console.log('Context:', error.context);
    // Context includes: tableName, key, suggestion
  }
}
```

Entity schema validation failures (e.g. a missing required field on `userRepo.create()`) throw the `EntityValidationError` subclass instead. See [Entity-specific errors](#7-entity-specific-errors) below.

#### 2. OperationError
Thrown when a DynamoDB operation (query, scan, get, put, update, delete, or a conditional check) fails.

**Example:**
```typescript
import { OperationError, isConditionalCheckFailed, getAwsErrorCode } from 'dyno-table';

try {
  await table.put({ pk: "USER#123", name: "John" })
    .condition(op => op.attributeNotExists("pk"))
    .execute();
} catch (error) {
  if (error instanceof OperationError) {
    console.log('Operation:', error.context.operation); // "put"
    console.log('Table:', error.context.tableName);
    console.log('AWS Error:', getAwsErrorCode(error.cause));

    // Check if it's a conditional check failure
    if (isConditionalCheckFailed(error)) {
      console.log('Item already exists');
    }
  }
}
```

#### 3. TransactionError
Thrown when a transaction fails.

**Common scenarios:**
- Duplicate items in transaction
- Transaction cancellation or DynamoDB rejecting the request (e.g. exceeding the 25-item limit)
- Invalid transaction configuration

**Example:**
```typescript
import { TransactionError, ErrorCodes, getAwsErrorMessage } from 'dyno-table';

try {
  await table.transaction(async (tx) => {
    // DynamoDB rejects transactions with more than 25 items
    for (let i = 0; i < 30; i++) {
      table.put({ pk: `ITEM#${i}`, sk: "DATA", data: "value" }).withTransaction(tx);
    }
  });
} catch (error) {
  if (error instanceof TransactionError && error.code === ErrorCodes.TRANSACTION_FAILED) {
    console.log('Items in transaction:', error.context.itemCount);
    console.log('Underlying AWS error:', getAwsErrorMessage(error.cause));
  }
}
```

#### 4. BatchError
Thrown when an entire batch request fails outright. Ordinary partial failures don't throw; they come back as `unprocessed` items on the result (see [Batch operations](./batch-operations.md)).

**Example:**
```typescript
import { BatchError } from 'dyno-table';

try {
  const batch = table.batchBuilder();
  itemsToWrite.forEach(item => table.put(item).withBatch(batch));
  await batch.execute();
} catch (error) {
  if (error instanceof BatchError) {
    console.log('Unprocessed items:', error.unprocessedItems.length);
    console.log('Context:', error.context);

    // Retry unprocessed items
    const retryBatch = table.batchBuilder();
    for (const item of error.unprocessedItems) {
      table.put(item as Record<string, unknown>).withBatch(retryBatch);
    }
    await retryBatch.execute();
  }
}
```

#### 5. ExpressionError
Thrown when building or validating DynamoDB condition/filter expressions fails, e.g. a logical operator (`and`/`or`) with no conditions passed to it.

**Example:**
```typescript
import { ExpressionError } from 'dyno-table';

try {
  await table.query({ pk: "USER#123" })
    .filter(op => op.and()) // No conditions passed
    .execute();
} catch (error) {
  if (error instanceof ExpressionError) {
    console.log('Expression error:', error.message);
    console.log('Condition type:', error.context.conditionType); // "and"
    console.log('Suggestion:', error.context.suggestion);
  }
}
```

#### 6. ConfigurationError
Thrown when table or entity configuration is invalid (e.g. missing sort key when required, or an unknown GSI name).

**Example:**
```typescript
import { ConfigurationError } from 'dyno-table';

try {
  await table.query({ pk: "USER#123" })
    .useIndex("nonexistent-gsi")
    .execute();
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.log('Configuration error:', error.message);
    console.log('Table:', error.context.tableName);
    console.log('Available indexes:', error.context.availableIndexes);
  }
}
```

#### 7. Entity-specific errors

##### EntityError
General entity-related errors.

##### KeyGenerationError
Thrown when entity key generation fails.

**Example:**
```typescript
import { KeyGenerationError, ErrorCodes } from 'dyno-table';

try {
  await userRepo.create({
    // Missing fields required for key generation
    name: "John"
  }).execute();
} catch (error) {
  if (error instanceof KeyGenerationError) {
    console.log('Entity:', error.context.entityName);
    console.log('Required attributes:', error.context.requiredAttributes);
    console.log('Provided data:', error.context.providedData);
  }
}
```

##### IndexGenerationError
Thrown when entity index generation fails.

**Example:**
```typescript
import { IndexGenerationError } from 'dyno-table';

try {
  await userRepo.update(
    { userId: "123" },
    { status: "ACTIVE" } // Missing fields to regenerate index
  ).execute();
} catch (error) {
  if (error instanceof IndexGenerationError) {
    console.log('Index:', error.context.indexName);
    console.log('Operation:', error.context.operation);
    console.log('Suggestion:', error.context.suggestion);
  }
}
```

##### EntityValidationError
Thrown when entity schema validation fails.

**Example:**
```typescript
import { EntityValidationError } from 'dyno-table';

const UserEntity = defineEntity({
  name: "User",
  schema: z.object({
    userId: z.string(),
    email: z.string().email(),
    age: z.number().min(18)
  }),
  // ... other config
});

try {
  await userRepo.create({
    userId: "123",
    email: "invalid-email",
    age: 15
  }).execute();
} catch (error) {
  if (error instanceof EntityValidationError) {
    console.log('Validation issues:', error.context.validationIssues);
  }
}
```

## Error codes

Every error includes a `code` property. Use the `ErrorCodes` constant to check codes without hardcoding strings:

```typescript
import { ErrorCodes } from 'dyno-table';

// Available error codes:
ErrorCodes.VALIDATION_FAILED
ErrorCodes.SCHEMA_VALIDATION_FAILED
ErrorCodes.INVALID_PARAMETER
ErrorCodes.MISSING_REQUIRED_FIELD

ErrorCodes.QUERY_FAILED
ErrorCodes.SCAN_FAILED
ErrorCodes.GET_FAILED
ErrorCodes.PUT_FAILED
ErrorCodes.UPDATE_FAILED
ErrorCodes.DELETE_FAILED
ErrorCodes.CONDITIONAL_CHECK_FAILED

ErrorCodes.TRANSACTION_FAILED
ErrorCodes.TRANSACTION_ITEM_LIMIT
ErrorCodes.TRANSACTION_DUPLICATE_ITEM
ErrorCodes.TRANSACTION_CANCELLED

ErrorCodes.BATCH_UNPROCESSED_ITEMS
ErrorCodes.BATCH_SIZE_EXCEEDED

ErrorCodes.EXPRESSION_INVALID
ErrorCodes.EXPRESSION_MISSING_ATTRIBUTE
ErrorCodes.EXPRESSION_INVALID_OPERATOR

ErrorCodes.CONFIGURATION_INVALID
ErrorCodes.CONFIGURATION_MISSING_SORT_KEY
ErrorCodes.CONFIGURATION_INVALID_GSI

ErrorCodes.ENTITY_VALIDATION_FAILED
ErrorCodes.KEY_GENERATION_FAILED
ErrorCodes.KEY_INVALID_FORMAT
ErrorCodes.INDEX_GENERATION_FAILED
ErrorCodes.INDEX_MISSING_ATTRIBUTES
ErrorCodes.INDEX_UNDEFINED_VALUES
ErrorCodes.INDEX_NOT_FOUND
```

## Type guards

Use these to narrow an unknown `catch` error to a specific dyno-table error type:

```typescript
import {
  isDynoTableError,
  isValidationError,
  isOperationError,
  isTransactionError,
  isBatchError,
  isExpressionError,
  isConfigurationError,
  isEntityError,
  isKeyGenerationError,
  isIndexGenerationError,
  isEntityValidationError
} from 'dyno-table';

try {
  await someOperation();
} catch (error) {
  if (isDynoTableError(error)) {
    console.log('Library error:', error.code);
    console.log('Context:', error.context);

    if (isValidationError(error)) {
      // Handle validation errors
    } else if (isOperationError(error)) {
      // Handle operation errors
    }
  } else {
    // Handle non-library errors
    console.error('Unexpected error:', error);
  }
}
```

## Common error handling patterns

### 1. Conditional check failures

```typescript
import { OperationError, ErrorCodes, isConditionalCheckFailed } from 'dyno-table';

try {
  await table.put({ pk: "USER#123", name: "John" })
    .condition(op => op.attributeNotExists("pk"))
    .execute();
} catch (error) {
  if (isConditionalCheckFailed(error)) {
    console.log('Item already exists');
    // Handle accordingly
  } else {
    throw error;
  }
}
```

### 2. Transaction cancellations

Transaction failures are wrapped in a `TransactionError`, with the original AWS SDK error preserved as `.cause`. `isTransactionCanceled()` checks an error's `name`, so pass it the `.cause`. dyno-table doesn't parse cancellation reasons itself, but the AWS SDK's `TransactionCanceledException` carries a `CancellationReasons` array:

```typescript
import { TransactionError, isTransactionCanceled } from 'dyno-table';

try {
  await table.transaction(async (tx) => {
    // ...operations...
  });
} catch (error) {
  if (error instanceof TransactionError && isTransactionCanceled(error.cause)) {
    console.log('Transaction was cancelled');
    console.log('Cancellation reasons:', (error.cause as { CancellationReasons?: unknown }).CancellationReasons);
    // Handle transaction conflicts
  }
}
```

### 3. Validation errors with schema details

```typescript
import { EntityValidationError } from 'dyno-table';

try {
  await userRepo.create(userData).execute();
} catch (error) {
  if (error instanceof EntityValidationError) {
    const issues = error.context.validationIssues;

    for (const issue of issues) {
      console.log(`Field ${issue.path}: ${issue.message}`);
    }

    // Show user-friendly error messages
    displayValidationErrors(issues);
  }
}
```

### 4. Key generation errors with missing attributes

```typescript
import { KeyGenerationError } from 'dyno-table';

try {
  await userRepo.create(incompleteData).execute();
} catch (error) {
  if (error instanceof KeyGenerationError) {
    const missing = error.context.requiredAttributes;
    console.log(`Missing required fields: ${missing.join(', ')}`);

    // Prompt user to provide missing fields
    return {
      success: false,
      missingFields: missing
    };
  }
}
```

### 5. Batch operations with partial failures

`table.batchWrite()` doesn't throw for ordinary partial failures. It returns any `unprocessedItems` for you to retry:

```typescript
async function batchWriteWithRetry(
  operations: Array<{ type: "put"; item: Record<string, unknown> } | { type: "delete"; key: { pk: string; sk?: string } }>,
  maxRetries = 3,
) {
  let attempt = 0;
  let remaining = operations;

  while (attempt < maxRetries && remaining.length > 0) {
    const { unprocessedItems } = await table.batchWrite(remaining);
    remaining = unprocessedItems;

    if (remaining.length === 0) {
      return { success: true };
    }

    console.log(`Attempt ${attempt + 1}: ${remaining.length} unprocessed items`);
    attempt++;

    // Exponential backoff
    await new Promise(resolve =>
      setTimeout(resolve, Math.pow(2, attempt) * 1000)
    );
  }

  return {
    success: remaining.length === 0,
    unprocessedCount: remaining.length
  };
}
```

### 6. Expression building errors

```typescript
import { ExpressionError } from 'dyno-table';

try {
  const results = await table.query({ pk: "USER#123" })
    .filter(op => {
      // Complex filter building that might fail
      return op.and(
        op.eq("status", "ACTIVE"),
        op.between("age", 18, 65)
      );
    })
    .execute();
} catch (error) {
  if (error instanceof ExpressionError) {
    console.log('Expression error:', error.message);
    console.log('Condition type:', error.context.conditionType);
    console.log('Suggestion:', error.context.suggestion);

    // Fall back to simpler query
    return await table.query({ pk: "USER#123" }).execute();
  }
}
```

### 7. Index generation failures during updates

```typescript
import { IndexGenerationError, ErrorCodes } from 'dyno-table';

try {
  await userRepo.update(
    { userId: "123" },
    { status: "ACTIVE" }
  ).execute();
} catch (error) {
  if (error instanceof IndexGenerationError) {
    if (error.context.isReadOnly) {
      // This is a readonly index, need to force rebuild
      console.log('Readonly index requires full data');
      console.log('Suggestion:', error.context.suggestion);

      // Option 1: Provide all required fields
      // Option 2: Use forceIndexRebuild
      await userRepo.update(
        { userId: "123" },
        { /* ... full data ... */ }
      ).forceIndexRebuild(error.context.indexName).execute();
    } else {
      // Regular index, provide missing attributes
      console.log('Missing attributes for index:',
        error.context.indexName);
    }
  }
}
```

## Debugging with error context

Every error includes a `context` object with details about what failed:

```typescript
try {
  await table.update({ pk: "USER#123", sk: "PROFILE" })
    .set("status", "ACTIVE")
    .condition(op => op.eq("version", 1))
    .execute();
} catch (error) {
  if (error instanceof OperationError) {
    console.log('Operation failed with context:');
    console.log(JSON.stringify(error.context, null, 2));

    // Context includes:
    // - tableName: "Users"
    // - operation: "update"
    // - key: { pk: "USER#123", sk: "PROFILE" }

    // The underlying AWS SDK error is preserved as `.cause`. See
    // "AWS SDK error wrapping" below to pull its code/message out of it.
  }
}
```

## AWS SDK error wrapping

dyno-table wraps AWS SDK errors and preserves the original error in the `cause` property:

```typescript
import { getAwsErrorCode, getAwsErrorMessage } from 'dyno-table';

try {
  await table.query({ pk: "USER#123" }).execute();
} catch (error) {
  if (error instanceof OperationError) {
    // Access AWS SDK error details
    const awsCode = getAwsErrorCode(error.cause);
    const awsMessage = getAwsErrorMessage(error.cause);

    console.log('AWS Error Code:', awsCode);
    console.log('AWS Error Message:', awsMessage);

    // Original AWS SDK error is preserved
    console.log('Original error:', error.cause);
  }
}
```

## Retryable errors

Some errors are retryable (e.g., throughput exceeded). Use the `isRetryableError` helper:

```typescript
import { isRetryableError } from 'dyno-table';

async function executeWithRetry(operation: () => Promise<any>, maxRetries = 3) {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      if (isRetryableError(error)) {
        console.log(`Retry attempt ${attempt + 1}`);
        attempt++;

        // Exponential backoff
        await new Promise(resolve =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      } else {
        throw error;
      }
    }
  }

  throw new Error(`Operation failed after ${maxRetries} retries`);
}

// Usage
const result = await executeWithRetry(() =>
  table.put({ pk: "USER#123", data: "value" }).execute()
);
```

## Best practices

- **Branch on `error.code`, not `error.message`.** Messages aren't a stable API across versions.
- **Most type guards expect the raw AWS error, not the dyno-table wrapper.** `isTransactionCanceled()` and `isRetryableError()` check `error.name`, but transaction and operation failures wrap the AWS error as `.cause`. Pass `error.cause` in most cases. `isConditionalCheckFailed()` is the exception. It checks both.
- **Batch retries have two different shapes.** `table.batchWrite()` returns `unprocessedItems` for you to retry, and that isn't an exception. `BatchError.unprocessedItems` only shows up if the whole batch call throws (see [BatchError](#4-batcherror)).

## Error summary helper

`getErrorSummary()` takes a `DynoTableError` and returns a formatted multi-line string for logging (not a structured object), so narrow to a `DynoTableError` first:

```typescript
import { getErrorSummary, isDynoTableError } from 'dyno-table';

try {
  await someOperation();
} catch (error) {
  if (isDynoTableError(error)) {
    logger.error(getErrorSummary(error));

    // Produces something like:
    // Error: KeyGenerationError
    // Code: KEY_GENERATION_FAILED
    // Message: Failed to generate primary key for entity "User"
    // Context:
    //   entityName: "User"
    //   operation: "create"
    //   requiredAttributes: ["email"]
    // Caused by: ValidationException: One or more parameter values were invalid
  }
}
```

## Next steps

- See [Entities](./entities.md) for entity-specific error handling
- See [Transactions](./transactions.md) for transaction error handling
- See [Batch Operations](./batch-operations.md) for batch error handling
- See [Query Builder](./query-builder.md) for query-specific errors
