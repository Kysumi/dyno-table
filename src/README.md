# src/ Directory

This directory contains the core source code for the dyno-table library. The library provides a dual-layer API for working with DynamoDB in TypeScript.

## Structure

- **`table.ts`** - Main Table class that wraps AWS SDK v3 DynamoDB operations with type-safe fluent builders
- **`conditions.ts`** - Type-safe condition building system that generates proper DynamoDB expressions
- **`expression.ts`** - Expression attribute name/value management for DynamoDB operations
- **`index.ts`** - Main entry point and public API exports
- **`types.ts`** - Core TypeScript type definitions
- **`standard-schema.ts`** - Integration with Standard Schema validation libraries (Zod, ArkType, Valibot)
- **`index-definition.ts`** - DynamoDB index configuration types
- **`operation-types.ts`** - Type definitions for DynamoDB operations

## Subdirectories

- **`builders/`** - Fluent builder pattern implementations for all DynamoDB operations
- **`entity/`** - Higher-level entity abstraction with schema validation and semantic methods
- **`utils/`** - Utility functions and helpers
- **`__tests__/`** - Unit tests for core functionality

## Key Design Patterns

**Type Safety First**: Every operation is fully typed to catch errors at compile time, providing excellent developer experience with autocompletion and compile-time validation.

**Fluent Builder Pattern**: All operations use composable builders that provide an intuitive, chainable API for constructing DynamoDB operations.

**Dual API Surface**:
- Table Layer: Direct DynamoDB operations with fluent builders for granular control
- Entity Layer: Higher-level abstraction with schema validation and business logic

**AWS SDK Compatibility**: Built on AWS SDK v3 with full feature parity to native DynamoDB operations while providing a more ergonomic interface.
