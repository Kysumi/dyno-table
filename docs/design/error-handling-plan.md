# Error Handling Plan for dyno-table

## Current State Analysis

The codebase currently has:
- Generic `Error` usage throughout (45+ instances across all modules)
- One custom error class: `BatchError` with operation context
- Basic error messages without structured context
- Inconsistent error formatting and detail levels
- AWS SDK error handling via try-catch with re-throwing
- Expression building with comprehensive condition validation (15+ scenarios)
- Entity validation integrated with Standard Schema libraries
- Result processing and pagination without structured error handling

## Error Class Hierarchy Design

### Base Error Class
```typescript
export abstract class DynoTableError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown>;
  public readonly isRetryable: boolean;

  constructor(message: string, code: string, context?: Record<string, unknown>, isRetryable = false) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    this.isRetryable = isRetryable;
  }
}
```

### Specific Error Classes

#### 1. Configuration Errors (Non-retryable)
```typescript
export class ConfigurationError extends DynoTableError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIGURATION_ERROR', context, false);
  }
}
```

#### 2. Validation Errors (Non-retryable)
```typescript
export class ValidationError extends DynoTableError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', context, false);
  }
}
```

#### 3. Operation Errors (Potentially retryable)
```typescript
export class OperationError extends DynoTableError {
  public readonly operation: string;

  constructor(message: string, operation: string, context?: Record<string, unknown>, isRetryable = true) {
    super(message, 'OPERATION_ERROR', context, isRetryable);
    this.operation = operation;
  }
}
```

#### 4. Schema/Entity Errors (Non-retryable)
```typescript
export class EntityError extends DynoTableError {
  public readonly entityType?: string;

  constructor(message: string, entityType?: string, context?: Record<string, unknown>) {
    super(message, 'ENTITY_ERROR', context, false);
    this.entityType = entityType;
  }
}
```

#### 5. GSI Template Errors (Non-retryable)
```typescript
export class GSITemplateError extends DynoTableError {
  public readonly indexName: string;
  public readonly entityType?: string;

  constructor(message: string, indexName: string, entityType?: string, context?: Record<string, unknown>) {
    super(message, 'GSI_TEMPLATE_ERROR', context, false);
    this.indexName = indexName;
    this.entityType = entityType;
  }
}
```

#### 6. Result Processing Errors (Non-retryable)
```typescript
export class ResultProcessingError extends DynoTableError {
  public readonly operation: string;

  constructor(message: string, operation: string, context?: Record<string, unknown>) {
    super(message, 'RESULT_PROCESSING_ERROR', context, false);
    this.operation = operation;
  }
}
```

#### 7. Pagination/Iterator Errors (Non-retryable)
```typescript
export class PaginationError extends DynoTableError {
  public readonly operation: 'iteration' | 'pagination' | 'array_conversion';
  public readonly memoryWarning?: boolean;

  constructor(message: string, operation: 'iteration' | 'pagination' | 'array_conversion', context?: Record<string, unknown>, memoryWarning = false) {
    super(message, 'PAGINATION_ERROR', context, false);
    this.operation = operation;
    this.memoryWarning = memoryWarning;
  }
}
```

#### 8. Transaction Errors (Non-retryable)
```typescript
export class TransactionError extends DynoTableError {
  public readonly itemCount?: number;
  public readonly transactionType?: 'read' | 'write';

  constructor(message: string, transactionType?: 'read' | 'write', context?: Record<string, unknown>) {
    super(message, 'TRANSACTION_ERROR', context, false);
    this.transactionType = transactionType;
  }
}
```

#### 9. Template Resolution Errors (Non-retryable)
```typescript
export class TemplateError extends DynoTableError {
  public readonly templateType: 'partition_key' | 'sort_key' | 'gsi_key';
  public readonly template: string;

  constructor(message: string, templateType: 'partition_key' | 'sort_key' | 'gsi_key', template: string, context?: Record<string, unknown>) {
    super(message, 'TEMPLATE_ERROR', context, false);
    this.templateType = templateType;
    this.template = template;
  }
}
```

## Error Categories and Messaging Strategy

### 1. Configuration Errors
- **When**: Invalid table configuration, missing GSI definitions, invalid keys
- **Message Pattern**: "Configuration error: [specific issue] in [location]"
- **Context**: Table name, GSI name, key names, expected vs actual values

### 2. Validation Errors
- **When**: Schema validation fails, invalid parameters, constraint violations
- **Message Pattern**: "[Entity/Operation] validation failed: [specific validation issues]"
- **Context**: Field names, validation rules, provided values, expected types

### 3. Operation Errors
- **When**: DynamoDB operation failures, capacity issues, condition failures
- **Message Pattern**: "[Operation] failed: [AWS error or library-specific reason]"
- **Context**: Operation type, table name, keys involved, AWS error code

### 4. Entity Errors
- **When**: Entity definition issues, key generation failures, indexing problems
- **Message Pattern**: "Entity [entityType] error: [specific issue]"
- **Context**: Entity type, field names, index names, key templates

### 5. GSI Template Errors
- **When**: GSI key template construction fails, missing required fields, template parsing errors
- **Message Pattern**: "GSI template error for index [indexName]: [specific issue]"
- **Context**: Index name, entity type, required fields, template patterns, actual data provided
- **Common Scenarios**:
  - Missing required fields for GSI keys
  - Invalid template syntax in partition key or sort key templates
  - Data type mismatches in template substitution
  - Circular dependencies in template resolution

### 6. Result Processing Errors
- **When**: DynamoDB result processing fails, invalid data formats, key extraction failures
- **Message Pattern**: "Result processing failed for [operation]: [specific issue]"
- **Context**: Operation type, table name, expected vs actual data format, processing stage
- **Common Scenarios**:
  - Invalid unprocessed item format from DynamoDB
  - Failed partition key extraction from key conditions
  - Malformed result data structures

### 7. Pagination/Iterator Errors
- **When**: Result iteration fails, memory limits exceeded, pagination state corruption
- **Message Pattern**: "[Iterator/Paginator] error during [operation]: [specific issue]"
- **Context**: Operation type, current page, items processed, memory usage estimates
- **Common Scenarios**:
  - Memory overflow during `toArray()` conversion of large datasets
  - Invalid pagination state during concurrent access
  - Iterator corruption during long-running operations
  - Exceeded recommended limits for in-memory operations

### 8. Transaction Errors
- **When**: Transaction-specific validation fails, item limits exceeded, unsupported operations
- **Message Pattern**: "Transaction [operation] failed: [specific issue]"
- **Context**: Transaction type, item count, operation types, size limits
- **Common Scenarios**:
  - Unsupported transaction item types
  - Transaction item limit exceeded (25 for write, 100 for read)
  - Mixed operation validation failures
  - Primary key validation in transaction context

### 9. Template Resolution Errors
- **When**: Key template resolution fails beyond GSI contexts
- **Message Pattern**: "[Template type] template error: [specific issue]"
- **Context**: Template type, template pattern, required fields, resolution chain
- **Common Scenarios**:
  - Partition key template construction failures
  - Sort key template validation errors
  - Template syntax parsing errors
  - Circular dependency detection in template chains

## Error Context and Debugging Information

### Contextual Information to Include

**Table-level context:**
- Table name
- Partition key and sort key names
- Index names (for GSI operations)

**Operation-level context:**
- Operation type (query, put, update, delete, scan, batch, transaction)
- Key values being operated on
- Condition expressions that failed
- Filter expressions applied

**Entity-level context:**
- Entity type name
- Schema validation details
- Key template patterns
- Index configurations

**GSI Template-level context:**
- Index name and type (GSI/LSI)
- Template patterns for partition and sort keys
- Required fields for template construction
- Actual data provided vs expected format
- Template resolution chain for debugging

**AWS-level context:**
- Original AWS SDK error (as cause)
- AWS error codes (ConditionalCheckFailedException, ValidationException, etc.)
- Request ID when available
- Consumed capacity when relevant
- Retry-specific information (attempt count, backoff strategy)

**Result processing context:**
- Data format expectations vs actual received
- Processing stage where failure occurred
- Item count and position in result set
- Memory usage estimates for large operations

**Pagination context:**
- Current page number and total items processed
- Last evaluated key state
- Memory usage warnings for large datasets
- Iterator state and corruption detection

**Transaction context:**
- Item count and limits (25 write/100 read)
- Operation types within transaction
- Transaction size validation
- Mixed operation compatibility

## Implementation Recommendations

### 1. Error Module Structure
Create `/src/errors/` directory with:
- `base.ts` - Base error classes
- `configuration.ts` - Configuration-specific errors
- `validation.ts` - Validation-specific errors
- `operation.ts` - DynamoDB operation errors
- `entity.ts` - Entity-specific errors
- `gsi-template.ts` - GSI template construction errors
- `result-processing.ts` - Result processing errors
- `pagination.ts` - Pagination and iterator errors
- `transaction.ts` - Transaction-specific errors
- `template.ts` - General template resolution errors
- `aws-sdk.ts` - AWS SDK error wrappers and factories
- `index.ts` - Export all error classes

### 2. Error Factory Functions
```typescript
// Helper functions for common error scenarios
export const ConfigurationErrors = {
  missingGSI: (gsiName: string, tableName: string) =>
    new ConfigurationError(
      `GSI "${gsiName}" does not exist on table "${tableName}"`,
      { gsiName, tableName }
    ),

  missingSortKey: (tableName: string) =>
    new ConfigurationError(
      `Sort key required but not provided for table "${tableName}"`,
      { tableName }
    )
};

export const GSITemplateErrors = {
  missingRequiredField: (indexName: string, fieldName: string, entityType?: string) =>
    new GSITemplateError(
      `Required field "${fieldName}" missing for GSI "${indexName}" template construction`,
      indexName,
      entityType,
      { requiredField: fieldName, missingFields: [fieldName] }
    ),

  templateParsingFailed: (indexName: string, template: string, entityType?: string, cause?: Error) =>
    new GSITemplateError(
      `Failed to parse template "${template}" for GSI "${indexName}"`,
      indexName,
      entityType,
      { template, originalError: cause?.message }
    ),

  multipleFieldsMissing: (indexName: string, missingFields: string[], entityType?: string) =>
    new GSITemplateError(
      `Multiple required fields missing for GSI "${indexName}": ${missingFields.join(', ')}`,
      indexName,
      entityType,
      { missingFields, requiredFieldCount: missingFields.length }
    )
};

export const ResultProcessingErrors = {
  invalidFormat: (operation: string, expectedFormat: string, actualFormat: string) =>
    new ResultProcessingError(
      `Invalid data format in ${operation}: expected ${expectedFormat}, got ${actualFormat}`,
      operation,
      { expectedFormat, actualFormat }
    ),

  keyExtractionFailed: (operation: string, keyCondition: string) =>
    new ResultProcessingError(
      `Could not extract partition key value from key condition in ${operation}`,
      operation,
      { keyCondition, extractionStage: 'partition_key' }
    )
};

export const PaginationErrors = {
  memoryOverflow: (operation: 'toArray' | 'getAllPages', itemCount: number, estimatedMemory: string) =>
    new PaginationError(
      `Memory overflow risk during ${operation}: ${itemCount} items (~${estimatedMemory})`,
      'array_conversion',
      { itemCount, estimatedMemory, recommendation: 'Use streaming iteration instead' },
      true // memoryWarning = true
    ),

  stateCorruption: (operation: string, currentPage: number) =>
    new PaginationError(
      `Pagination state corrupted during ${operation}`,
      'pagination',
      { currentPage, recommendation: 'Reinitialize paginator' }
    )
};

export const TransactionErrors = {
  itemLimitExceeded: (itemCount: number, limit: number, transactionType: 'read' | 'write') =>
    new TransactionError(
      `Transaction ${transactionType} limit exceeded: ${itemCount} items > ${limit} limit`,
      transactionType,
      { itemCount, limit, exceeded: itemCount - limit }
    ),

  unsupportedItemType: (itemType: string, transactionType: 'read' | 'write') =>
    new TransactionError(
      `Unsupported transaction item type: ${itemType}`,
      transactionType,
      { unsupportedType: itemType }
    )
};

export const AwsErrorFactories = {
  conditionalCheckFailed: (operation: string, key: Record<string, unknown>) =>
    new OperationError(
      `Conditional check failed for ${operation}`,
      operation,
      { key, awsErrorType: 'ConditionalCheckFailedException' },
      false // Non-retryable
    ),

  provisionedThroughputExceeded: (operation: string, tableName: string) =>
    new OperationError(
      `Provisioned throughput exceeded for ${operation} on ${tableName}`,
      operation,
      { tableName, awsErrorType: 'ProvisionedThroughputExceededException' },
      true // Retryable
    ),

  resourceNotFound: (resourceType: 'table' | 'index', resourceName: string) =>
    new ConfigurationError(
      `${resourceType} '${resourceName}' not found`,
      { resourceType, resourceName, awsErrorType: 'ResourceNotFoundException' }
    ),

  validationException: (operation: string, validationMessage: string) =>
    new ValidationError(
      `AWS validation failed for ${operation}: ${validationMessage}`,
      { operation, awsErrorType: 'ValidationException', awsMessage: validationMessage }
    )
};
```

### 3. Error Wrapping Strategy
```typescript
// Wrap AWS SDK errors with context
function wrapAwsError(awsError: Error, operation: string, context: Record<string, unknown>) {
  return new OperationError(
    `${operation} failed: ${awsError.message}`,
    operation,
    { ...context, awsErrorCode: (awsError as any).name },
    isRetryableAwsError(awsError)
  );
}

// Wrap GSI template construction errors with rich context
function wrapGSITemplateError(
  error: Error,
  indexName: string,
  template: string,
  data: Record<string, unknown>,
  entityType?: string
) {
  return new GSITemplateError(
    `GSI template construction failed for index "${indexName}": ${error.message}`,
    indexName,
    entityType,
    {
      template,
      providedData: data,
      originalError: error.message,
      templateType: template.includes('#') ? 'compound' : 'simple'
    }
  );
}
```

### 4. Migration Strategy
- **Phase 1**: Create error classes and factories
- **Phase 2**: Replace high-impact errors (table.ts, entity.ts)
- **Phase 3**: Replace GSI template errors in ddb-indexing.ts
- **Phase 4**: Replace result processing and pagination errors
- **Phase 5**: Replace transaction-specific errors in transaction-builder.ts
- **Phase 6**: Replace builder errors (query-builder.ts, update-builder.ts, etc.)
- **Phase 7**: Replace expression and utility errors
- **Phase 8**: Update BatchError to extend base class
- **Phase 9**: Add AWS SDK error transformation layer

### 5. Consumer-Friendly Features
- **Type Guards**: `isDynoTableError()`, `isRetryable()`, `isConfigurationError()`, `isGSITemplateError()`, `isPaginationError()`, `isTransactionError()`, `isResultProcessingError()`
- **Error Codes**: Consistent error codes for programmatic handling
- **Context Access**: Structured context for logging and debugging
- **Cause Chains**: Preserve original AWS SDK errors as causes
- **Memory Warnings**: Special handling for memory-intensive operations
- **AWS Error Mapping**: Direct mapping from AWS SDK errors to library errors

### 6. Documentation Guidelines
- Include error handling examples in README
- Document all error codes and when they occur
- Provide retry strategies for retryable errors
- Show debugging techniques using error context
- Document common GSI template construction issues and solutions
- Document memory management best practices for large datasets
- Provide transaction error handling patterns
- Include AWS SDK error mapping examples

## Benefits for Library Consumers

This approach provides library consumers with:
- **Clear categorization** of error types
- **Rich debugging context** for troubleshooting
- **Programmatic error handling** via type guards and error codes
- **Consistent error messaging** across the library
- **Backward compatibility** during gradual migration
- **Specific GSI debugging information** to help resolve complex template issues

The error system would be especially valuable for the entity layer where schema validation, GSI template construction, and complex operations can fail in many different ways that need clear explanation to developers.

## Example Usage

```typescript
try {
  await userRepo.query.getActiveUsers().execute();
} catch (error) {
  if (isDynoTableError(error)) {
    console.log('Error code:', error.code);
    console.log('Context:', error.context);

    if (isRetryable(error)) {
      // Implement retry logic
    }

    if (isValidationError(error)) {
      // Handle validation issues
    }

    if (isGSITemplateError(error)) {
      console.log('Failed GSI:', error.indexName);
      console.log('Entity type:', error.entityType);
      console.log('Missing fields:', error.context?.missingFields);
    }

    if (isPaginationError(error) && error.memoryWarning) {
      console.warn('Memory warning during pagination:', error.context?.estimatedMemory);
      console.log('Recommendation:', error.context?.recommendation);
    }

    if (isTransactionError(error)) {
      console.log('Transaction type:', error.transactionType);
      console.log('Item count:', error.context?.itemCount);
    }

    if (isResultProcessingError(error)) {
      console.log('Processing operation:', error.operation);
      console.log('Expected format:', error.context?.expectedFormat);
    }
  }
}
```

## Error Codes Reference

| Code | Class | Description | Retryable |
|------|-------|-------------|-----------|
| `CONFIGURATION_ERROR` | ConfigurationError | Invalid table/GSI configuration | No |
| `VALIDATION_ERROR` | ValidationError | Schema or parameter validation failed | No |
| `OPERATION_ERROR` | OperationError | DynamoDB operation failed | Maybe |
| `ENTITY_ERROR` | EntityError | Entity definition or processing error | No |
| `GSI_TEMPLATE_ERROR` | GSITemplateError | GSI key template construction failed | No |
| `RESULT_PROCESSING_ERROR` | ResultProcessingError | Result data processing failed | No |
| `PAGINATION_ERROR` | PaginationError | Iterator/paginator operation failed | No |
| `TRANSACTION_ERROR` | TransactionError | Transaction-specific error | No |
| `TEMPLATE_ERROR` | TemplateError | General template resolution failed | No |
| `BATCH_ERROR` | BatchError | Batch operation specific error | Maybe |

## Common Error Scenarios by Category

### GSI Template Errors

### Missing Required Fields
```typescript
// Entity data missing required field for GSI
const userData = { id: 'user123', name: 'John' }; // missing 'email' required for EmailIndex
// Throws: GSITemplateError with context showing missing 'email' field
```

### Template Parsing Failures
```typescript
// Invalid template syntax
const invalidTemplate = 'USER#{invalid_syntax}';
// Throws: GSITemplateError with template parsing details
```

### Data Type Mismatches
```typescript
// Template expects string but gets number
const template = 'ORDER#{status}#{date}';
const data = { status: 'PENDING', date: 1234567890 }; // date should be string
// Throws: GSITemplateError with type mismatch information
```

### Result Processing Errors

### Invalid Data Format
```typescript
// DynamoDB returns unexpected format
// Table.ts:708 - Invalid unprocessed item format returned from DynamoDB
// Throws: ResultProcessingError with format details
```

### Key Extraction Failures
```typescript
// Failed to extract partition key from query conditions
// Table.ts:285 - Could not extract partition key value from key condition
// Throws: ResultProcessingError with extraction context
```

### Pagination Errors

### Memory Overflow Warning
```typescript
// Attempting to load large dataset into memory
const query = table.query({ pk: "LARGE_DATASET" });
const results = await query.execute();
const allItems = await results.toArray(); // Potential memory overflow
// Throws: PaginationError with memory warning and recommendation to use streaming
```

### State Corruption
```typescript
// Paginator state becomes invalid during concurrent access
const paginator = query.paginate(100);
// ... concurrent modifications ...
const page = await paginator.getNextPage(); // State may be corrupted
// Throws: PaginationError with state corruption details
```

### Transaction Errors

### Item Limit Exceeded
```typescript
// Attempting to exceed transaction limits
const transaction = table.createTransaction();
for (let i = 0; i < 30; i++) { // Exceeds 25 item limit for write transactions
  transaction.put({ pk: `item${i}`, data: 'value' });
}
await transaction.execute();
// Throws: TransactionError with item count and limit details
```

### Unsupported Item Types
```typescript
// Using unsupported transaction item type
// Transaction-builder.ts:825 - Unsupported transaction item type
// Throws: TransactionError with unsupported type information
```

### Template Resolution Errors

### Partition Key Template Failures
```typescript
// Template construction fails for partition keys
const pkTemplate = 'USER#{userId}#{region}';
const data = { userId: 'user123' }; // missing 'region'
// Throws: TemplateError with missing field details
```

### Sort Key Template Validation
```typescript
// Sort key template validation fails
const skTemplate = 'DATA#{type}#{timestamp}';
const data = { type: 'log', timestamp: null }; // null timestamp
// Throws: TemplateError with validation failure details
```
