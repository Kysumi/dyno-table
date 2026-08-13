# Migrations

`dyno-table/migration` gives you a structured way to write backfill / data-movement scripts
against your own entity repos — plain `for await` loops, arbitrary joins across repos, safe by
default, and resumable if the process dies partway through a large table.

```bash
npm install dyno-table
```

```ts
import { MigrationManager } from "dyno-table/migration";
```

## Why this exists

A one-off backfill script against a huge DynamoDB table has three recurring problems:

1. **It's easy to accidentally write for real** while you're still checking what a script would do.
2. **A crash halfway through a multi-million-item scan means starting over** unless you build your
   own resume logic.
3. **Ad-hoc scripts reimplement pagination, validation, and key generation** that your entity repos
   already handle correctly.

`MigrationManager` solves all three without introducing a parallel system: it wraps the
`EntityRepository` you already have, reuses `Paginator` for pagination, and reuses your own
`.debug()` output for dry-run previews.

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

// Preview first — no writes happen, and you get back .debug() output for every write
// the migration would have made.
const preview = await manager.run("backfill-order-totals");
console.log(`Would write ${preview.writes} updates across ${preview.scanned} scanned orders`);
console.log(preview.samples);

// Looks right — run it for real.
await manager.run("backfill-order-totals", { apply: true });
```

Run the same migration name again later (say, after a crash, or just to catch new orders created
since the last run) — `apply: true` resumes from the last completed page instead of rescanning the
whole table from the start.

## Running every outstanding migration

Instead of calling `run()` migration-by-migration, `runAll()` runs every registered migration that
hasn't already succeeded:

```ts
manager.createMigration("backfill-order-totals", async ({ repos, cursor }) => { /* ... */ });
manager.createMigration("backfill-user-emails", async ({ repos, cursor }) => { /* ... */ });

const results = await manager.runAll({ apply: true });
```

Migrations run in **registration order** by default — the order your `createMigration()` calls
happened in. Pass an explicit `order` when that doesn't match how they're defined across modules
(lower runs first; ties break by registration order):

```ts
manager.createMigration("backfill-order-totals", fn, { order: 1 });
manager.createMigration("backfill-user-emails", fn, { order: 2 });
```

For each registered migration, `runAll()` checks its checkpoint `status` (see "Preventing
concurrent runs" below) and:

- **`"success"`** — skipped, nothing to do.
- **absent, or `"error"`** — outstanding, gets run (an errored migration resumes from its last
  checkpoint, same as calling `run()` on it directly).
- **`"running"`** on *any* registered migration — `runAll()` throws immediately, before running a
  single one. Either another process is already working through the same batch, or a previous run
  crashed and left that migration's lock stuck — either way, it isn't safe to guess which and
  proceed, so the whole call aborts for you (or your caller) to investigate.

`runAll()` also stops at the first migration that throws, rather than continuing past it — later
migrations may assume earlier ones already succeeded. Whatever already completed earlier in the
same `runAll()` call stays applied; re-running `runAll()` picks up from there once the failure is
fixed.

## Safe by default

`run()` never performs a real write unless you pass `{ apply: true }`. Every `create`, `upsert`,
`update`, and `delete` call inside your migration function is intercepted:

- **Dry run (default)** — the write builder's `.debug()` output is captured instead of calling
  `.execute()`. No network call happens. You get back `samples` in the result so you can inspect
  exactly what would have been written.
- **`{ apply: true }`** — the real `.execute()` runs.

Reads (`get`, `query`, `scan`) are never intercepted — they always execute for real in both modes,
because enrichment lookups (reading related data to decide what to write) depend on seeing real
data even during a dry run.

Because the wrapping happens fresh inside each `run()` call, the same `MigrationManager` can safely
preview a migration and then apply it — or run it in dry-run mode repeatedly — without any state
leaking between runs.

## Idempotency is on you

If the process crashes mid-page, resuming re-fetches and re-yields that same page. Write your
migration body so re-processing an already-migrated item is harmless — check a "done" marker (like
`order.total !== undefined` above) before writing, or use a conditional write.

## Resumability

Pass a `cursor(builder)` around any `.scan()` or `.query()` builder instead of iterating it
directly. `cursor()`:

- checkpoints the DynamoDB `lastEvaluatedKey` **before** yielding each page's items to your loop
  (so a crash mid-page re-fetches, not skips, that page on resume),
- persists checkpoints via a repo you supply — a plain entity, no new storage mechanism,
- clears its own checkpoint automatically once the scan/query completes.

A migration that drives more than one cursor (sequential backfills, multi-stage moves) gives each
one an explicit `id`:

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

Each `id` gets its own slot in the checkpoint record, so the two cursors don't clobber each other.
Calling `cursor()` twice with the same `id` (including leaving both at the default) throws
immediately — sharing one checkpoint slot between two independent cursors would corrupt both.

### Page size

Pass `pageSize` to control how many items are fetched — and checkpointed — per DynamoDB request:

```ts
for await (const order of cursor(repos.orders.scan(), { pageSize: 100 })) {
  // ...
}
```

Without it, the underlying `Paginator` has no per-request cap and drains the entire scan/query as
a single logical page before the first checkpoint is ever written — on a huge table, that means a
crash loses all progress, not just the current page. Pick a `pageSize` that bounds how much
re-work an interrupted run would repeat.

### Defining your own checkpoint entity

Checkpoints are stored through a regular entity repo — there's nothing migration-specific about
the storage layer beyond the shape of the record:

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

Point every `MigrationManager` at the same table this entity is defined against, and checkpoints
for all your migrations live in one place, one record per migration name.

## Preventing concurrent runs

An `apply: true` run holds a lock on its checkpoint record for its whole duration. `status` goes
to `"running"` before your migration function is invoked, then `"success"` or `"error"` once it
settles — with the exception message persisted to `error` on failure, for diagnosing a stuck or
failed migration without digging through logs.

```ts
await manager.run("backfill-order-totals", { apply: true });
// If another apply:true run of the same migration is already in flight:
// Error: Migration "backfill-order-totals" is already running
```

A second concurrent `run(name, { apply: true })` for the same migration name sees `"running"` and
rejects immediately instead of racing with the first. Dry runs never touch this lock — only
`apply: true` runs can conflict.

This is a plain mutual-exclusion flag, not staleness-checked: if the process holding the lock is
killed outright (not a caught error — an actual crash, OOM, or `SIGKILL`), `status` stays
`"running"` forever until you manually reset it on the checkpoint record. A migration function
that throws a normal JavaScript error is fine — the lock is released and `status`/`error` are
recorded correctly in that case; it's only a hard process kill that leaves it stuck.

## Error handling

If your migration function throws, `run()` lets the rejection propagate — it isn't swallowed. Any
checkpoints already persisted from pages that completed *before* the throw stay in place, so a
subsequent `run(name, { apply: true })` resumes from there rather than restarting.

There's no retry logic inside `MigrationManager` itself, matching how `table.batchWrite` returns
`unprocessedItems` for you to handle rather than silently retrying forever — if a write throws
inside your loop, handle it there (or let it propagate and re-run the migration).
