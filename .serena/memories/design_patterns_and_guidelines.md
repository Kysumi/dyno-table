# Design Patterns and Guidelines

## Core Design Principles

### 1. Type Safety First
- All operations must be fully typed
- Automatic type inference wherever possible
- Compile-time error detection for DynamoDB operations
- Never use `any` or unsafe type assertions

### 2. Dual API Architecture
- **Table Layer**: Direct DynamoDB operations with fluent builders
- **Entity Layer**: Schema validation and semantic business methods
- Both layers must maintain feature parity
- Users can choose the appropriate abstraction level

### 3. Builder Pattern Implementation
- All operations use fluent builder APIs
- Immutable builder chain (each method returns new instance)
- Type-safe method chaining with conditional availability
- Terminal `.execute()` method for all operations

### 4. Memory Management Patterns
- **ResultIterator**: Stream large datasets efficiently
- **Batch Loading**: `.toArray()` for small known datasets
- **Pagination**: Explicit page control for large result sets
- Avoid loading large datasets into memory simultaneously

## DynamoDB Best Practices

### 1. Lexical Sorting Awareness
- All sort keys must consider DynamoDB's lexical (string) sorting
- Zero-pad numeric values for proper ordering
- Use ISO date formats for chronological sorting
- Document sorting behavior in schema definitions

### 2. Single-Table Design Support
- Composite key patterns (e.g., `USER#123`, `PROFILE`)
- GSI access patterns
- Entity type discrimination
- Overloaded GSI usage patterns

### 3. Query vs Scan Optimization
- Default to Query operations when possible
- Provide Scan as explicit opt-in
- Filter early to reduce data transfer
- Document performance implications

## Schema Integration

### 1. Standard Schema Interface
- Support any validation library implementing Standard Schema
- Zod included as primary example
- ArkType, Valibot, and others supported via interface
- Never lock users into specific validation library

### 2. Entity Definition Patterns
- Primary key generation from input data
- GSI key generation patterns
- Automatic timestamp management (`createdAt`, `updatedAt`)
- Type-safe query method definitions

## Error Handling

### 1. AWS SDK Error Preservation
- Pass through native DynamoDB errors
- Add context without losing original error information
- Type-safe error handling patterns
- Clear error messages for common mistakes

### 2. Validation Error Patterns
- Schema validation errors from chosen library
- Condition check failures
- Key constraint violations
- Clear, actionable error messages

## Performance Guidelines

### 1. Bundle Size Optimization
- Tree-shakable exports for all modules
- Avoid unnecessary dependencies
- Lazy loading for optional features
- Multiple entry points for granular imports

### 2. Runtime Performance
- Minimal overhead over AWS SDK
- Efficient expression building
- Memory-conscious result iteration
- Batch operation optimization

## Testing Patterns

### 1. Unit Testing
- Mock DynamoDB client for unit tests
- Test builder pattern chains
- Validate expression generation
- Type safety verification

### 2. Integration Testing
- Local DynamoDB via Docker
- Real AWS SDK integration
- End-to-end operation testing
- Performance and memory testing