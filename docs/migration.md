# Migrations

`dyno-table/migration` provides infrastructure for backfill and data-movement scripts that use
existing entity repositories. Migration functions use `for await` loops and can read from multiple
repositories. Writes default to dry-run mode, and cursors can persist scan or query progress.

```bash
npm install dyno-table
```

```ts
import { MigrationManager } from "dyno-table/migration";
```

## Design constraints

A backfill over a large DynamoDB table typically needs to account for three concerns:

1. Previewing proposed writes before mutating data.
2. Resuming a long-running scan or query after interruption.
3. Reusing repository pagination, validation, and key generation.

`MigrationManager` wraps existing `EntityRepository` instances, uses `Paginator` for pagination,
and captures write-builder `.debug()` output during dry runs. Cursor state is stored through a
repository supplied by the application.

## Defining and running a migration

```ts
import { MigrationManager } from "dyno-table/migration";
import { OrderEntity } from "./entities/order";
import { MigrationCheckpointEntity } from "./entities/migration-checkpoint";

const manager = new MigrationManager({
  repos: {
    orders: OrderEntity.createRepository(table),
  },
  migrationRepo: MigrationCheckpointEntity.createRepository(table),
});

manager.createMigration("backfill-order-totals", async ({ repos, cursor }) => {
  for await (const order of cursor(repos.orders.scan())) {
    if (order.total !== undefined) continue; // already migrated, skip

    const total = order.lineItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    await repos.orders.update({ id: order.id }, { total }).execute();
  }
});

// Dry run: write calls return .debug() output without executing.
const preview = await manager.run("backfill-order-totals");
console.log(`Would write ${preview.writes} updates across ${preview.scanned} scanned orders`);
console.log(preview.samples);

// Apply writes.
await manager.run("backfill-order-totals", { apply: true });
```

When a migration is run again with `apply: true`, it resumes from the last completed page. This
applies after an interrupted run and when processing records created after an earlier run.

## Running every outstanding migration

`runAll()` runs each registered migration whose checkpoint is not marked as successful:

```ts
manager.createMigration("backfill-order-totals", async ({ repos, cursor }) => { /* ... */ });
manager.createMigration("backfill-user-emails", async ({ repos, cursor }) => { /* ... */ });

const results = await manager.runAll({ apply: true });
```

Migrations run in registration order by default. Pass an explicit `order` when migrations are
registered across modules and require a different sequence. Lower values run first; ties use
registration order.

```ts
manager.createMigration("backfill-order-totals", fn, { order: 1 });
manager.createMigration("backfill-user-emails", fn, { order: 2 });
```

For each registered migration, `runAll()` checks its checkpoint `status` (see "Concurrency
control"):

- **`"success"`**: skipped.
- **Absent or `"error"`**: run. A migration with `"error"` resumes from its last checkpoint, as it
  does when called through `run()`.
- **`"running"`** on any registered migration: throw before running any migrations. This can mean
  that another process is running the batch or that a terminated process left a stale lock. The
  caller must determine which case applies before proceeding.

`runAll()` stops when a migration throws because later migrations may depend on earlier ones.
Migrations completed earlier in the same call remain applied. After the failure is resolved,
another `runAll()` call skips those successful migrations and resumes the sequence.

## Dry-run and apply modes

`run()` performs writes only when passed `{ apply: true }`. The manager intercepts every `create`,
`upsert`, `update`, and `delete` call made through the wrapped repositories:

- **Dry run (default)**: captures the write builder's `.debug()` output instead of calling
  `.execute()`. The result includes this output in `samples`. No write request is sent.
- **`{ apply: true }`**: calls `.execute()` for each write.

Reads (`get`, `query`, and `scan`) execute in both modes. A dry run therefore reads current data
while suppressing writes.

Repositories are wrapped separately for each `run()` call. The same `MigrationManager` instance
can therefore run the same migration in dry-run and apply modes without retaining wrapper state
between calls.

## Idempotency requirements

If a process stops while handling a page, the next run fetches and yields that page again.
Migration code must tolerate repeated processing. It can check a completion marker, such as
`order.total !== undefined` above, or use a conditional write.

## Resumability

Pass a `.scan()` or `.query()` builder to `cursor(builder)` to enable checkpointing. `cursor()`:

- stores the DynamoDB `lastEvaluatedKey` before yielding a page, so an interrupted page is fetched
  again rather than skipped;
- persists checkpoints through the supplied repository;
- clears its checkpoint after the scan or query completes.

A migration with more than one cursor must give each cursor an explicit `id`:

```ts
manager.createMigration("multi-stage-move", async ({ repos, cursor }) => {
  for await (const user of cursor(repos.users.scan(), { id: "users" })) {
    // ...
  }
  for await (const order of cursor(repos.orders.scan(), { id: "orders" })) {
    // ...
  }
});
```

Each `id` maps to a separate slot in the checkpoint record. Calling `cursor()` twice with the same
`id`, including using the default for both, throws because independent cursors cannot share a
checkpoint slot.

### Page size

Pass `pageSize` to limit the number of items fetched and checkpointed per DynamoDB request:

```ts
for await (const order of cursor(repos.orders.scan(), { pageSize: 100 })) {
  // ...
}
```

Without `pageSize`, the underlying `Paginator` has no per-request limit and consumes the scan or
query as one logical page before writing a checkpoint. An interruption then requires repeating
that entire page. Set `pageSize` according to the acceptable amount of repeated work.

### Defining your own checkpoint entity

Checkpoints are stored through a regular entity repository. The record must have the following
shape:

```ts
import { defineEntity, createIndex, createQueries } from "dyno-table/entity";
import { z } from "zod";

const checkpointSchema = z.object({
  name: z.string(),
  version: z.number(),
  status: z.enum(["running", "success", "error"]).optional(),
  error: z.string().optional(),
  cursors: z.record(z.object({ lastEvaluatedKey: z.record(z.unknown()).optional() })),
});

export const MigrationCheckpointEntity = defineEntity({
  name: "MigrationCheckpoint",
  schema: checkpointSchema,
  primaryKey: createIndex()
    .input(z.object({ name: z.string() }))
    .partitionKey(({ name }) => `MIGRATION#${name}`)
    .sortKey(() => "CHECKPOINT"),
  queries: createQueries<typeof checkpointSchema._type>(),
});
```

Each `MigrationManager` using this checkpoint entity must reference its table. The manager stores
one checkpoint record per migration name.

## Concurrency control

An `apply: true` run uses the checkpoint record as a lock for the duration of the migration. The
manager sets `status` to `"running"` before invoking the migration function, then to `"success"` or
`"error"` when it settles. On failure, the exception message is stored in `error`.

```ts
await manager.run("backfill-order-totals", { apply: true });
// If another apply:true run of the same migration is already in flight:
// Error: Migration "backfill-order-totals" is already running
```

A concurrent `run(name, { apply: true })` for the same migration sees `"running"` and rejects.
Dry runs do not acquire or modify the lock.

The lock has no staleness check. If the process terminates without handling an error, such as after
an OOM or `SIGKILL`, `status` remains `"running"` until the checkpoint record is manually reset. A
JavaScript exception that reaches `run()` is handled by recording `"error"` and releasing the
lock.

## Error handling

If a migration function throws, `run()` propagates the rejection. Checkpoints persisted before the
error remain in place, so a subsequent `run(name, { apply: true })` resumes from the last stored
position.

`MigrationManager` does not retry failed writes. Migration code can handle a write error locally or
allow it to propagate and rerun the migration. This is consistent with `table.batchWrite`, which
returns `unprocessedItems` to the caller.
