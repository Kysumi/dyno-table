# docs/ Directory

This directory contains comprehensive documentation for the dyno-table library, focusing on practical usage patterns and DynamoDB best practices.

## Files

- **`query-builder.md`** - Comprehensive guide to the query builder system with DynamoDB best practices
- **`conditions.md`** - Detailed guide to DynamoDB conditions, conditional operations, and duplicate prevention patterns
- **`geoff-the-dyno.png`** - Library mascot and visual branding
- **`images/`** - Directory for documentation images and diagrams

## Documentation Philosophy

**Progressive Disclosure**: Documentation starts with basic concepts and builds to advanced patterns, making it accessible to developers with varying DynamoDB experience.

**Practical Examples**: Every feature is demonstrated with runnable code examples that solve real-world problems rather than toy scenarios.

**DynamoDB Education**: Documentation teaches critical DynamoDB concepts that often trip up developers:
- **Lexical Sorting**: How DynamoDB sorts all data as strings and why this matters for key design
- **Query vs Scan**: Performance implications and when to use each approach
- **Memory Management**: Streaming vs batch loading patterns for different dataset sizes
- **Index Design**: GSI and LSI patterns for efficient access patterns
- **Conditional Operations**: How to use conditions for data integrity, duplicate prevention, and race condition handling

**Performance Guidance**: Clear guidance on:
- When to use streaming (`for await`) vs batch loading (`.toArray()`)
- Memory usage implications of different result handling patterns
- Query efficiency and early termination strategies
- Pagination strategies for large datasets

## Key Documentation Insights

**Real-World Scenarios**: Examples use realistic domains like e-commerce, user management, and analytics rather than contrived examples.

**Anti-Patterns**: Documentation explicitly calls out common mistakes and provides better alternatives:
```typescript
// ❌ Wrong: Numeric values sort incorrectly
sk: "ITEM#1", "ITEM#10", "ITEM#2"

// ✅ Correct: Zero-pad for proper lexical sorting
sk: "ITEM#001", "ITEM#010", "ITEM#002"
```

**Type Safety Benefits**: Shows how TypeScript integration catches errors at compile time that would otherwise surface at runtime.

**Error Handling**: Different approaches to error handling and their tradeoffs in various scenarios.

## Target Audiences

**Library Users**: Developers using dyno-table in their applications who need to understand patterns and best practices.

**DynamoDB Newcomers**: Developers new to DynamoDB who need to understand fundamental concepts alongside library usage.

**Experienced DynamoDB Users**: Advanced users who want to understand how the library handles edge cases and optimizations.

## Documentation Standards

- All code examples are tested and runnable
- Performance implications are clearly stated
- Memory usage patterns are explained
- Links to relevant AWS documentation for deeper understanding
