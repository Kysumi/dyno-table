# ResultIterator — Streaming Query Results

`query.execute()` returns `Promise<ResultIterator<T>>`, not `T[]`.

## Pattern

```typescript
// Step 1: await execute() to get the iterator
const iterator = await table.query({ pk: "USER#123" }).execute();

// Step 2: stream items — auto-paginates across DynamoDB pages
for await (const item of iterator) {
  processItem(item);  // one item in memory at a time
}
```

## Rules

- `execute()` must be `await`ed — it returns a Promise.
- The `for await` loop handles DynamoDB pagination automatically. No manual `lastEvaluatedKey` management needed.
- `.limit(n)` on the query builder caps total items yielded across all pages.
- `ResultIterator` is single-pass — once exhausted, it won't re-fetch.
