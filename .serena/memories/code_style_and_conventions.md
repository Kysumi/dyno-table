# Code Style and Conventions

## TypeScript Configuration
- **Strict Mode**: Enabled with `noUncheckedIndexedAccess` and `noImplicitOverride`
- **Target**: ES2022
- **Module System**: ESM with `"type": "module"` in package.json
- **Verbatim Module Syntax**: Enabled for precise import/export handling

## Code Formatting (Biome)
- **Indentation**: 2 spaces
- **Line Width**: 120 characters
- **Quotes**: Double quotes for strings
- **Semicolons**: Always required
- **Trailing Commas**: Always included
- **Import Organization**: Automatic via Biome assist

## Naming Conventions
- **Files**: kebab-case (e.g., `query-builder.ts`, `condition-check-builder.ts`)
- **Classes**: PascalCase (e.g., `Table`, `QueryBuilder`, `UserEntity`)
- **Functions/Methods**: camelCase (e.g., `createRepository`, `getUserByEmail`)
- **Constants**: UPPER_SNAKE_CASE for module-level constants
- **Types/Interfaces**: PascalCase (e.g., `QueryOptions`, `EntityDefinition`)

## Code Organization Patterns
- **Builder Pattern**: Fluent APIs for all DynamoDB operations
- **Repository Pattern**: Entity-based data access layer
- **Standard Schema**: Interface-based schema validation support
- **Dual API Design**: Both low-level (Table) and high-level (Entity) APIs

## File Organization
- One main export per file
- Related types in the same file as implementation
- Test files adjacent to source files with `.test.ts` extension
- Integration tests with `.itest.ts` extension

## Import/Export Conventions
- Use explicit imports/exports (no `export *`)
- Organize imports: external libraries first, then internal modules
- Use type-only imports when appropriate: `import type { ... }`

## Documentation Style
- TSDoc comments for public APIs
- Inline comments sparingly, prefer self-documenting code
- README examples should be practical and runnable