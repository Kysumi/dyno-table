# createQueries Pattern

## Pattern

```typescript
const queryBuilder = createQueries<MyEntity>();

const queries = {
  byId: queryBuilder
    .input(byIdSchema)                           // attach input validation schema
    .query(({ input, entity }) =>                // handler receives validated input + entity
      entity.query({ pk: `MY#${input.id}` })    // MUST return a builder — do not call .execute()
    ),
};
```

## Rules

- The `.query()` handler must **return a builder**, never call `.execute()` inside it.
- Input validation runs lazily — only when the caller calls `.execute()` on the returned builder.
- Use `entity.query({ pk })` for known partition keys (efficient). Use `entity.scan()` for full-table searches (expensive).
- Always use `createQueries<T>()` — inline query functions bypass input schema validation.
