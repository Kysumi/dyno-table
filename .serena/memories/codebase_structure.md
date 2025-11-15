# Codebase Structure

## Root Directory
- `package.json` - NPM package configuration with complex multi-entry exports
- `tsconfig.json` - TypeScript config (strict mode, ES2022, preserve modules)
- `biome.json` - Biome linting and formatting configuration
- `tsup.config.ts` - Build configuration for multiple entry points
- `vitest.config.ts` - Unit test configuration (excludes .itest.ts files)
- `vitest.integration.ts` - Integration test configuration
- `docker-compose.yml` - Local DynamoDB setup
- `README.md` - Library documentation
- `CLAUDE.md` - Project instructions for Claude Code

## Source Code Structure (`/src/`)

### Core Files
- `index.ts` - Main library entry point
- `table.ts` - Main Table class (core DynamoDB wrapper)
- `types.ts` - Core TypeScript type definitions
- `conditions.ts` - Type-safe condition building system
- `expression.ts` - DynamoDB expression utilities
- `standard-schema.ts` - Standard Schema interface support

### Directories
- `/builders/` - All operation builders (query, put, update, delete, transaction, batch, etc.)
  - Query builders with type-safe fluent API
  - Result iterators for memory-efficient processing
  - Pagination support
  - Projected query/scan builders for type-safe field selection
- `/entity/` - Entity pattern implementation (schema validation, repositories)
- `/utils/` - Utility functions and helpers
- `/errors/` - Custom error types
- `/__tests__/` - Unit tests (.test.ts files)

## Test Structure
- Unit tests: `.test.ts` files (run with `pnpm test`)
- Integration tests: `.itest.ts` files (run with `pnpm test:int`, requires local DynamoDB)
- `/tests/` - Test utilities and setup helpers

## Build Output (`/dist/`)
- Multiple entry points with both ESM (.js) and CommonJS (.cjs) formats
- TypeScript declaration files (.d.ts, .d.cts)
- Tree-shakable exports for individual modules