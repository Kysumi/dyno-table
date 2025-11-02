# src/utils/ Directory

This directory contains utility functions and helpers used throughout the dyno-table library. These utilities provide common functionality for DynamoDB operations, debugging, and data processing.

## Files

- **`index.ts`** - Main exports for utility functions
- **`chunk-array.ts`** - Array chunking utilities for batch operations (respects DynamoDB limits: 25 items for writes, 100 for reads)
- **`debug-expression.ts`** - Debug utilities for DynamoDB expressions and attribute handling
- **`debug-transaction.ts`** - Transaction debugging and inspection utilities
- **`partition-key-template.ts`** - Template system for generating consistent partition keys
- **`sort-key-template.ts`** - Template system for generating consistent sort keys with proper lexical sorting

## Key Utilities

**Array Chunking**: Critical for batch operations since DynamoDB has strict limits on batch sizes. Automatically handles chunking for optimal performance.

**Key Templates**: Provide consistent, predictable key generation patterns:
```typescript
// Partition key templates ensure consistent formatting
const userPK = partitionKeyTemplate("USER#{id}");

// Sort key templates handle lexical sorting requirements
const dateSK = sortKeyTemplate("DATE#{date}"); // Ensures ISO format for proper sorting
```

**Debug Tools**: Help developers understand what's happening under the hood:
- Expression debugging shows attribute names and values
- Transaction debugging reveals the actual DynamoDB operations being performed

**DynamoDB Best Practices**: Utilities encode DynamoDB best practices:
- Proper lexical sorting for numeric values (zero-padding)
- Consistent key formatting patterns
- Optimal batch sizing for performance

## Design Philosophy

**DynamoDB Expertise Encoded**: These utilities capture years of DynamoDB experience and best practices, so library users don't need to become DynamoDB experts.

**Lexical Sorting Awareness**: Key template utilities ensure proper lexical sorting behavior, which is critical for range queries but often overlooked by developers.

**Performance Optimization**: Chunking and batching utilities optimize for DynamoDB's performance characteristics and limitations.

**Debugging Support**: Debug utilities make it easier to troubleshoot DynamoDB operations, which can be opaque without proper tooling.

## Testing
- **`__tests__/`** - Unit tests for all utility functions
