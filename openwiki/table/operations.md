---
type: API guide
title: Table operations
description: The low-level Table API for direct DynamoDBDocument operations, configured physical keys and GSIs, request builders, and safe change boundaries.
tags: [table, dynamodb, api]
---

# Table operations

`Table` in `src/table.ts` is the low-level public facade. It is appropriate when callers own item layout and DynamoDB key strings, need direct control over filters/projections/conditions, or are composing several entity types. For schema validation, automatic key generation, entity isolation, and semantic queries, use [entity repositories](../entities/repositories.md) instead.

## Construction contract

```ts
const table = new Table({
  client: docClient,
  tableName: "MyTable",
  indexes: {
    partitionKey: "pk",
    sortKey: "sk",
    gsis: { byStatus: { partitionKey: "gsi1pk", sortKey: "gsi1sk" } },
  },
});
```

The `indexes` configuration describes an already-provisioned table. It is both runtime metadata and a generic type surface: `GSINames<TConfig>` lets `QueryBuilder` constrain `.useIndex()` names for typed configurations. It does not create a table or validate cloud infrastructure.

## API families

| Intent | Entry point | Important methods / behavior |
|---|---|---|
| Create without overwrite | `create(item)` | Produces a `PutBuilder` with an `attribute_not_exists` condition on the physical partition key and `INPUT` result behavior. |
| Put/replace | `put(item)` | Use `condition`, `returnValues`, `withBatch`, `withTransaction`, `debug`, then `execute`. |
| Read one | `get({ pk, sk })` | Use `select`, `consistentRead`, `includeIndexes`, or `withBatch`; composite tables require `sk`. |
| Query partition | `query({ pk, sk? })` | `sk` accepts key-condition operators; chain filter, select, index, sort, limit, continuation, iterator/paginator APIs. |
| Scan | `scan()` | Same shared filtering, projection, index, limit, continuation, iterator/paginator APIs; `.segments(totalSegments)` runs DynamoDB segmented scans and merges them; no key condition. |
| Delete | `delete({ pk, sk })` | Optional condition/return old item; supports batch and transaction attachment. |
| Update | `update({ pk, sk })` | Compose `set`, `remove`, `add`, set-element deletion, conditions, returns, and transaction attachment. |
| Atomic guard | `conditionCheck({ pk, sk })` | Produces a condition-check builder for a transaction only. |
| Bulk/atomic groups | `batchBuilder`, `transactionBuilder`, `transaction` | See [builder execution](../builders/execution.md). |

## Query and scan rules

`query` constructs an equality condition on the configured primary partition-key attribute. If a sort-key callback is supplied, it may use `eq`, comparisons, `between`, `beginsWith`, or `and`; it is invalid to ask for a sort condition if the table lacks a sort key. `useIndex(name)` changes the request to the configured GSI attributes and fails fast for an unknown name.

`filter` is a post-key-condition DynamoDB filter, not a substitute for an access pattern. Chained filters are combined with `AND`; logical combinations and nested attribute paths compile through the shared [condition system](../expressions/conditions.md). `select` creates a projection. Query/get results hide configured GSI key attributes by default; call `includeIndexes()` to retain them, including in a specified projection.

For a full-table or index scan that can safely use parallel DynamoDB capacity, chain `.segments(totalSegments)` after scan configuration and consume the returned `ParallelScanIterator`:

```ts
const items = await table
  .scan<MyItem>()
  .useIndex("byStatus")
  .filter((op) => op.eq("status", "active"))
  .limit(100)
  .segments(4)
  .toArray();
```

Each segment receives the configured filter/index/projection and its own DynamoDB cursor; the merge emits whichever segment produces an item first, so no ordering is promised. The `limit(100)` applies across merged output, not once per segment. `.paginate(pageSize)` provides in-memory logical pages only, with no cross-process resume token. The execution and change invariants are canonical in [builder execution](../builders/execution.md#parallel-scans-independent-cursors-merged-results).

## Direct-operation lifecycle

Fluent methods mutate their builder. Work occurs at `.execute()` except query/scan page fetching, which begins only while consuming the returned async iterator. Use `.debug()` on supported write builders to inspect the raw generated command and readable expressions; utility behavior lives in [utilities](../reference/utilities.md).

Table catches service exceptions per operation and wraps them with context-rich errors. It deliberately preserves DynamoDB semantics such as conditional failures and unprocessed batch work rather than inventing retries or migrations.

## Extension and change surface

Adding a Table operation requires more than a method: provide a builder/executor contract under `src/builders/`, compose it in `src/table.ts`, expose it via the relevant entrypoint(s) (`src/index.ts`, `src/table.ts`, or `src/builders.ts`), and test both command construction and DynamoDB Local behavior where it calls the service. Maintain the `{ pk, sk }` to configured-key conversion consistently for get/update/delete/batch/transaction paths.

Focused checks:

```bash
pnpm test
pnpm test:int
pnpm run check-types
```

Use the integration preparation steps in [testing](../development/testing.md).