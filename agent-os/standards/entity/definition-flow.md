# Entity Definition Flow

Define all entities using the 4-step chain. No shortcuts.

## Pattern

```typescript
import { createIndex, createQueries, defineEntity } from "dyno-table/entity";

// Step 1: Define key input schema (only fields needed to generate keys)
const primaryKeySchema: StandardSchemaV1<{ id: string }> = { ... };

// Step 2: Create index — input schema first, then key templates
const primaryKey = createIndex()
  .input(primaryKeySchema)
  .partitionKey((item) => `USER#${item.id}`)
  .sortKey(() => "METADATA#");

// Step 3: Define typed query builders
const queryBuilder = createQueries<UserEntity>();

// Step 4: Define entity
// Generics: <OutputType, InputType, KeyInputType>
const UserEntity = defineEntity<UserEntity, UserInput, { id: string }>({
  name: "User",
  schema: userSchema,        // validates TInput → T
  primaryKey,
  queries: {
    byId: queryBuilder.input(byIdSchema).query(({ input, entity }) =>
      entity.query({ pk: `USER#${input.id}`, sk: (op) => op.beginsWith("METADATA#") })
    ),
  },
});

// Step 5: Create repository bound to a table (at runtime)
const repo = UserEntity.createRepository(table);
```

## Rules

- Always use `createQueries<T>()` — never define query functions inline. Inline queries skip input schema validation entirely.
- `createIndex()` must call `.input(schema)` before `.partitionKey()` — no schema, no key validation.
- The `I` type param (3rd generic on `defineEntity`) is the key input shape — only fields needed to generate keys, not the full entity.
- `createRepository(table)` is called at runtime, not at module level.
