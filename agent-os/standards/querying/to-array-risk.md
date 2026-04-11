# toArray() Memory Risk

`iterator.toArray()` loads every page of results into memory at once.

## Pattern

```typescript
// Safe for small, bounded result sets
const items = await (await table.query({ pk: "USER#123" }).execute()).toArray();

// Safe alternative for large datasets
const iterator = await table.query({ pk: "USER#123" }).execute();
for await (const item of iterator) {
  processItem(item);  // memory-safe streaming
}
```

## Rules

- Use `.toArray()` only when the result set is known to be small (e.g. by pk, with a tight `.limit()`).
- Never use `.toArray()` on scans or unbounded queries — this is an OOM risk.
- When in doubt, stream with `for await`.
