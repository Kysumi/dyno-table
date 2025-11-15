# Error Handling

dyno-table provides comprehensive error handling with rich context to help you debug and handle failures gracefully. All errors extend a base `DynoTableError` class and include structured context for debugging.

## Error Class Hierarchy

All dyno-table errors extend the base `DynoTableError` class:

```typescript
class DynoTableError extends Error {
  readonly code: string;           // Error code for programmatic handling
  readonly context: Record<string, unknown>; // Rich debugging context
  readonly cause?: Error;          // Original error (e.g., from AWS SDK)
}
```

### Error Types

#### 1. ValidationError
Thrown when input validation fails, including schema validation and parameter validation.

**Common scenarios:**
- Schema validation failure
- Missing required fields
- Invalid parameter types
- Constraint violations

**Example:**
```typescript
import { ValidationError, ErrorCodes } from 'dyno-table';

try {
  await userRepo.create({
    // missing required 'email' field
    name: "John Doe"
  }).execute();
} catch (error) {
  if (error instanceof ValidationError) {
    console.log('Validation failed:', error.message);
    console.log('Error code:', error.code); // "VALIDATION_FAILED"
    console.log('Context:', error.context);
    // Context includes: entityName, operation, validationIssues
  }
}
```

#### 2. OperationError
Thrown when a DynamoDB operation fails.

**Common scenarios:**
- Query/scan failures
- Put/update/delete failures
- Conditional check failures
- Throughput exceeded
- Item not found

**Example:**
```typescript
import { OperationError } from 'dyno-table';

try {
  await table.put({ pk: "USER#123", name: "John" })
    .condition(op => op.attributeNotExists("pk"))
    .execute();
} catch (error) {
  if (error instanceof OperationError) {
    console.log('Operation:', error.context.operation); // "put"
    console.log('Table:', error.context.tableName);
    console.log('AWS Error:', error.context.awsErrorCode);

    // Check if it's a conditional check failure
    if (error.code === ErrorCodes.CONDITIONAL_CHECK_FAILED) {
      console.log('Item already exists');
    }
  }
}
```

#### 3. TransactionError
Thrown when transaction operations fail.

**Common scenarios:**
- Too many items in transaction (>25 for writes, >100 for reads)
- Duplicate items in transaction
- Transaction cancellation
- Invalid transaction configuration

**Example:**
```typescript
import { TransactionError, ErrorCodes } from 'dyno-table';

try {
  const transaction = table.createTransaction();

  // Add too many items...
  for (let i = 0; i < 30; i++) {
    transaction.put({ pk: `ITEM#${i}`, data: "value" });
  }

  await transaction.execute();
} catch (error) {
  if (error instanceof TransactionError) {
    if (error.code === ErrorCodes.TRANSACTION_ITEM_LIMIT) {
      console.log('Too many items:', error.context.itemCount);
      console.log('Limit:', error.context.limit);
    }
  }
}
```

#### 4. BatchError
Thrown when batch operations encounter unprocessed items.

**Common scenarios:**
- Partial batch failures
- Throughput exceeded during batch
- Batch size limits exceeded

**Example:**
```typescript
import { BatchError } from 'dyno-table';

try {
  await table.batchWrite()
    .put([/* ... items ... */])
    .execute();
} catch (error) {
  if (error instanceof BatchError) {
    console.log('Unprocessed items:', error.unprocessedItems.length);
    console.log('Context:', error.context);

    // Retry unprocessed items
    const retryBatch = table.batchWrite();
    for (const item of error.unprocessedItems) {
      retryBatch.put(item);
    }
    await retryBatch.execute();
  }
}
```

#### 5. ExpressionError
Thrown when building or validating DynamoDB expressions fails.

**Common scenarios:**
- Invalid condition operators
- Missing required attributes
- Invalid expression syntax
- Unsupported operations

**Example:**
```typescript
import { ExpressionError } from 'dyno-table';

try {
  await table.query({ pk: "USER#123" })
    .filter(op => op.between("age", 18)) // Missing upper bound
    .execute();
} catch (error) {
  if (error instanceof ExpressionError) {
    console.log('Expression error:', error.message);
    console.log('Condition type:', error.context.conditionType);
    console.log('Suggestion:', error.context.suggestion);
  }
}
```

#### 6. ConfigurationError
Thrown when table or entity configuration is invalid.

**Common scenarios:**
- Missing sort key when required
- Invalid GSI configuration
- Table configuration mismatch
- Invalid entity definition

**Example:**
```typescript
import { ConfigurationError } from 'dyno-table';

try {
  await table.query({ pk: "USER#123" })
    .index("nonexistent-gsi")
    .execute();
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.log('Configuration error:', error.message);
    console.log('Table:', error.context.tableName);
    console.log('Available indexes:', error.context.availableIndexes);
  }
}
```

#### 7. Entity-Specific Errors

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

## Error Codes

All errors include a `code` property for programmatic handling. Use the `ErrorCodes` constant for type-safe error code checking:

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

## Type Guards

Use type guards to check error types:

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
} from 'dyno-table/utils/error-utils';

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

## Common Error Handling Patterns

### 1. Conditional Check Failures

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

### 2. Transaction Cancellations

```typescript
import { TransactionError, isTransactionCanceled } from 'dyno-table';

try {
  await transaction.execute();
} catch (error) {
  if (isTransactionCanceled(error)) {
    console.log('Transaction was cancelled');
    console.log('Cancellation reasons:', error.context.cancellationReasons);
    // Handle transaction conflicts
  }
}
```

### 3. Validation Errors with Schema Details

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

### 4. Key Generation Errors with Missing Attributes

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

### 5. Batch Operations with Partial Failures

```typescript
import { BatchError } from 'dyno-table';

async function batchWriteWithRetry(items: any[], maxRetries = 3) {
  let attempt = 0;
  let itemsToWrite = items;

  while (attempt < maxRetries) {
    try {
      const batch = table.batchWrite();
      for (const item of itemsToWrite) {
        batch.put(item);
      }
      await batch.execute();
      return { success: true };
    } catch (error) {
      if (error instanceof BatchError) {
        console.log(`Attempt ${attempt + 1}: ${error.unprocessedItems.length} unprocessed items`);
        itemsToWrite = error.unprocessedItems;
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

  return {
    success: false,
    unprocessedCount: itemsToWrite.length
  };
}
```

### 6. Expression Building Errors

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

### 7. Index Generation Failures During Updates

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

## Debugging with Error Context

Every error includes a `context` object with relevant debugging information:

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
    // - updateExpression: "SET #0 = :0"
    // - conditionExpression: "#1 = :1"
    // - awsErrorCode: "ConditionalCheckFailedException"
    // - awsErrorMessage: "The conditional request failed"
  }
}
```

## AWS SDK Error Wrapping

dyno-table wraps AWS SDK errors and preserves the original error in the `cause` property:

```typescript
import { getAwsErrorCode, getAwsErrorMessage } from 'dyno-table/utils/error-utils';

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

## Retryable Errors

Some errors are retryable (e.g., throughput exceeded). Use the `isRetryableError` helper:

```typescript
import { isRetryableError } from 'dyno-table/utils/error-utils';

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

## Best Practices

1. **Always check error types**: Use `instanceof` or type guards to handle specific error types
2. **Log error context**: Include `error.context` in logs for debugging
3. **Handle validation errors gracefully**: Show user-friendly messages from validation errors
4. **Preserve error causes**: Don't lose the original AWS SDK error information
5. **Use error codes for logic**: Use `error.code` for programmatic error handling instead of parsing messages
6. **Implement retry logic**: Use `isRetryableError()` to implement smart retry strategies
7. **Handle partial failures**: Always handle `BatchError` and retry unprocessed items
8. **Provide missing fields**: For `KeyGenerationError`, prompt users for required attributes

## Error Summary Helper

Get a formatted error summary for logging:

```typescript
import { getErrorSummary } from 'dyno-table/utils/error-utils';

try {
  await someOperation();
} catch (error) {
  const summary = getErrorSummary(error);
  logger.error('Operation failed', summary);

  // Summary includes:
  // - errorType: "KeyGenerationError"
  // - code: "KEY_GENERATION_FAILED"
  // - message: "Failed to generate primary key..."
  // - context: { entityName, operation, requiredAttributes }
  // - awsError: { code, message } (if applicable)
}
```

## Next Steps

- See [Entities](./entities.md) for entity-specific error handling
- See [Transactions](./transactions.md) for transaction error handling
- See [Batch Operations](./batch-operations.md) for batch error handling
- See [Query Builder](./query-builder.md) for query-specific errors
