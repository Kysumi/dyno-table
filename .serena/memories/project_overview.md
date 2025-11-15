# Dyno-Table Project Overview

## Purpose
dyno-table is a **TypeScript library published to npm** that simplifies working with DynamoDB. It's designed as a type-safe DynamoDB ORM for external developers and applications, providing both low-level table operations and high-level entity patterns.

## Key Features
- **Type Safety First**: Complete TypeScript integration with automatic type inference
- **Schema Validation**: Built-in support for Zod, ArkType, Valibot, and other Standard Schema libraries
- **Dual API**: Table layer for direct operations, Entity layer for schema validation and semantic methods
- **Single-Table Design**: Built for DynamoDB best practices
- **Repository Pattern**: Clean separation between data access and business logic

## Tech Stack
- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js (ES2022 target)
- **Build Tool**: tsup (modern TypeScript bundler)
- **Package Manager**: pnpm
- **Testing**: Vitest (unit tests) + Docker for local DynamoDB integration tests
- **Linting/Formatting**: Biome
- **AWS SDK**: AWS SDK v3 (peer dependency)
- **Schema Validation**: Zod (included), supports Standard Schema interface

## Library Architecture
- **Dual Export Strategy**: Supports both ESM and CommonJS
- **Tree-shakable**: Multiple entry points (table, entity, conditions, etc.)
- **AWS SDK v3**: Built on DynamoDBDocument from @aws-sdk/lib-dynamodb
- **Builder Pattern**: Fluent API for all operations (query, put, update, delete, etc.)
- **Memory-efficient**: ResultIterator pattern for streaming large datasets