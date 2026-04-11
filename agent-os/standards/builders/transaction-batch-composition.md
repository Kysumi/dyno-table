# Transaction and Batch Composition

`withTransaction()` and `withBatch()` enqueue operations — they do not execute.

## Pattern

```typescript
// Transaction (atomic, all-or-nothing)
const tx = table.transaction();
repo.create(item1).withTransaction(tx);
repo.update(key2, data).withTransaction(tx);
await tx.execute();                          // executes all at once

// Batch (parallel, not atomic)
const batch = table.batchBuilder();
repo.create(item1).withBatch(batch);
repo.get({ id: '2' }).withBatch(batch);
await batch.execute();                       // executes all at once
```

## Rules

- Call `.execute()` on the **container** (`tx` or `batch`), not on individual builders.
- Entity-aware builders (from `repo.create()`, `repo.get()`, etc.) auto-supply `entityName` to batch — do not pass it manually.
- Transactions are ACID; batches are parallel and can partially fail.
