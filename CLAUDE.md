# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About This Project

This is **dyno-table** - an external TypeScript library published to npm that simplifies working with DynamoDB. It's designed to be used by external developers and applications, not an internal application codebase.

## Essential Commands for Library Development

### Development Workflow
- `pnpm install` - Install dependencies
- `pnpm build` - Build the library for distribution using tsup
- `pnpm clean` - Remove dist directory

### Testing (Critical for External Library)
- `pnpm test` - Run unit tests (excludes integration tests)
- `pnpm test:w` - Run tests in watch mode
- `pnpm test:int` - Run integration tests (requires local DynamoDB)

### Local DynamoDB for Testing
- `pnpm run ddb:start` - Start local DynamoDB in Docker
- `pnpm run local:setup` - Create test table for integration tests
- `pnpm run local:teardown` - Delete test table

### Code Quality (Important for Public Library)
- `pnpm run lint` - Run Biome linter
- `pnpm run check-types` - TypeScript type checking
- `pnpm run format` - Format code using Biome
- `pnpm run format:check` - Check code formatting and linting
- `pnpm run precommit` - Format and lint src/tests (used by Husky)
- `pnpm run circular` - Check for circular dependencies using madge

## Library Architecture (for External Developers)

### Public API Surface

This library provides a **dual-layer API** that external developers can choose from:

**Table Layer** (`dyno-table/table`): Direct DynamoDB operations with fluent builders:
```typescript
import { Table } from 'dyno-table/table';
await table.query({ pk: "USER#123" })
  .filter(op => op.eq("status", "ACTIVE"))
  .execute();
```

**Entity Layer** (`dyno-table/entity`): Higher-level abstraction with schema validation and semantic business methods:
```typescript
import { defineEntity } from 'dyno-table/entity';
const userRepo = UserEntity.createRepository(table);
const activeUsers = await userRepo.query.getActiveUsers().execute();
```

### Query Builder Architecture

The library's query builder provides type-safe, fluent API for DynamoDB operations with several key patterns:

**ResultIterator Pattern**: Memory-efficient streaming approach for large datasets:
```typescript
// Streaming - processes items as they arrive, minimal memory usage
const iterator = await table.query({ pk: "USER#123" }).execute();
for await (const item of iterator) {
  processItem(item); // Only one item in memory at a time
}
```

**Batch Loading Pattern**: Load all results when dataset size is known to be small:
```typescript
// Batch loading - loads all items into memory at once
const items = await iterator.toArray(); // Use only for small datasets
```

**Pagination Patterns**: Multiple approaches for handling large result sets:
```typescript
// Explicit pagination with page control
const paginator = table.query({ pk: "DATA" }).paginate(50);
while (paginator.hasNextPage()) {
  const page = await paginator.getNextPage();
  // Process page.items
}
```

### Core Library Components

**Table Class** (`src/table.ts`): Main entry point that wraps AWS SDK v3 DynamoDB operations with type-safe fluent builders.

**Entity System** (`src/entity/entity.ts`): Provides schema validation, automatic key generation, and semantic query methods. Supports Standard Schema validation libraries (Zod, ArkType, Valibot).

**Builder Pattern** (`src/builders/`): All operations use composable builders:
- `QueryBuilder` - Type-safe queries with conditions
- `PutBuilder` - Create/replace operations
- `UpdateBuilder` - Atomic updates with conditions
- `DeleteBuilder` - Delete operations
- `TransactionBuilder` - Multi-operation ACID transactions
- `BatchBuilder` - Batch read/write with automatic chunking

**Conditions System** (`src/conditions.ts`): Type-safe condition building that generates proper DynamoDB expressions.

### Design Philosophy for External Use

**Type Safety First**: Every operation is fully typed to catch errors at compile time.

**Semantic Naming**: Entity pattern encourages meaningful method names like `getUserByEmail()` instead of cryptic `gsi1` references.

**Standard Schema Integration**: Works with any validation library implementing the Standard Schema interface.

**Flexible Usage**: Developers can use direct table operations for simple cases or entities for complex business logic.

**AWS SDK Compatibility**: Built on AWS SDK v3 with full feature parity to native DynamoDB operations.

### DynamoDB Best Practices (Critical for Library Users)

**Lexical Sorting Awareness**: DynamoDB sorts all data lexically (as strings), which affects sort key design:
```typescript
// ❌ Wrong: Numeric values sort incorrectly
// Sorts as: "1", "10", "11", "2", "20", "3"
sk: "ITEM#1", "ITEM#10", "ITEM#2"

// ✅ Correct: Zero-pad numbers for proper lexical sorting
// Sorts as: "001", "002", "003", "010", "020"
sk: "ITEM#001", "ITEM#002", "ITEM#010"

// ✅ Correct: Use ISO date format for chronological sorting
// Sorts chronologically: "2024-01-01", "2024-01-02", "2024-12-01"
sk: "DATE#2024-01-01", "DATE#2024-01-02"
```

**Memory Management Patterns**: Choose appropriate result handling based on dataset size:
```typescript
// ✅ Large datasets: Use streaming
for await (const item of iterator) { /* process */ }

// ✅ Small datasets: Batch loading is fine
const items = await iterator.toArray();

// ❌ Avoid: Loading large datasets into memory
const allOrders = await hugeQuery.toArray(); // Could cause OOM
```

**Query vs Scan Efficiency**:
- **Query**: Fast, efficient - use when you know partition key
- **Scan**: Slow, expensive - avoid when possible, use filters to reduce data transfer

### File Structure

- `/src/` - Main source code
  - `/builders/` - Operation builders (query, put, update, delete, etc.)
  - `/entity/` - Entity pattern implementation
  - `/utils/` - Utility functions and helpers
  - `/conditions.ts` - Condition building logic
  - `/table.ts` - Main Table class
  - `/types.ts` - Core TypeScript types

- `/tests/` - Test utilities and setup
- `/examples/` - Usage examples including entity pattern demo

### Testing Strategy

- **Unit Tests** (`.test.ts`): Test individual components in isolation
- **Integration Tests** (`.itest.ts`): Test against real local DynamoDB instance
- Use `pnpm run ddb:start` and `pnpm run local:setup` before running integration tests
- Test utilities in `/tests/` directory handle DynamoDB table setup

### Build System

- **tsup**: Modern TypeScript bundler with multiple entry points
- **Dual Format**: Outputs both ESM and CommonJS
- **Multiple Exports**: Individual modules can be imported separately (e.g., `dyno-table/entity`)
- **Tree Shaking**: Optimized for minimal bundle size

### Code Style

- **Biome**: Used for linting and formatting (configured in `biome.json`)
- **TypeScript**: Strict mode enabled with comprehensive type checking
- **Husky**: Pre-commit hooks ensure code quality before commits

## Important Notes for External Library Development

### For Library Contributors
- **Breaking Changes**: This is a public library - any API changes must consider backward compatibility
- **Testing**: Always run both unit tests (`pnpm test`) and integration tests (`pnpm test:int`) before changes
- **Documentation**: Update README.md examples when adding new features
- **Type Safety**: Maintain strict TypeScript - external developers rely on compile-time error detection
- **Performance**: Consider bundle size impact - use tree-shaking friendly exports

### For Users of This Library
- **Entity Pattern**: Recommended for production applications - provides schema validation and semantic method names
- **Table Pattern**: Good for simple use cases or when you need direct DynamoDB operation control
- **Integration Tests**: Require local DynamoDB (`pnpm run ddb:start` + `pnpm run local:setup`)
- **Schema Libraries**: Supports any Standard Schema validation library (Zod, ArkType, Valibot)
- **Batch Operations**: Automatically handle chunking (25 items for writes, 100 for reads)
- **AWS SDK**: Built on AWS SDK v3 - ensure peer dependencies are installed

## Documentation Structure

The library documentation is organized for different user needs:

### Core Documentation
- **README.md**: Quick start guide following open source conventions
- **docs/query-builder.md**: Comprehensive query builder documentation with DynamoDB best practices
- **examples/**: Working code examples for common patterns

### Documentation Best Practices
- **Progressive Disclosure**: Start with basics, build to advanced concepts
- **Practical Examples**: Every feature shown with runnable code
- **Performance Guidance**: Memory usage, efficiency patterns, and anti-patterns
- **Type Safety Examples**: Demonstrate TypeScript integration benefits
- **DynamoDB Education**: Explain lexical sorting, query vs scan, pagination strategies

### Key Documentation Insights
- **Lexical Sorting**: Critical concept that trips up many DynamoDB users
- **Memory Management**: ResultIterator vs .toArray() has significant implications
- **Performance Patterns**: Query efficiency, early termination, streaming processing
- **Error Handling**: Different approaches have different error behavior
- **Real-world Examples**: E-commerce, analytics, user management scenarios

## NEVER make parallel systems.
- If a new breaking change is required, ensure it's communicated clearly and planned for. Make the change. DO NOT Make a new system.
