---
type: subsystem guide
title: Resumable entity-repository migrations
description: The dyno-table migration subsystem provides dry-run-first, resumable DynamoDB data migrations over existing entity repositories with checkpoint locking.
tags: [migrations, dynamodb, repositories, resumability]
openwiki:
  roles: [workflow, domain, integration]
  change_kinds: [migration, lifecycle, public-api]
  source_paths: [src/migration.ts, src/migration/migration-manager.ts, src/migration/cursor.ts, src/migration/checkpoint-store.ts, src/migration/repo-proxy.ts]
  symbols: [MigrationManager, MigrationCheckpointRepo, MigrationCheckpointRecord, CursorFn, patchCheckpoint, wrapRepo]
  test_paths: [src/migration/__tests__/migration-manager.test.ts, src/migration/__tests__/cursor.test.ts, src/migration/__tests__/checkpoint-store.test.ts, src/migration/__tests__/migration-manager.itest.ts, src/migration/__tests__/cursor-race.itest.ts]
  invariants: [Writes are dry-run unless apply is explicitly true., Applied cursors checkpoint a page only after its items are consumed., A checkpoint status of running blocks concurrent applied runs of the same migration.]
  validation_commands: [pnpm test -- src/migration/__tests__/migration-manager.test.ts src/migration/__tests__/cursor.test.ts]
---

# Resumable entity-repository migrations

`dyno-table/migration` adds `MigrationManager` for backfills and data moves expressed against existing [entity repositories](entities/repositories.md), rather than a separate persistence abstraction. A manager receives the repositories a migration may use plus a regular entity repository that stores one checkpoint record per migration name. Its cursor delegates pagination to the shared [builder execution](builders/execution.md) layer, and its write proxy uses the builders' existing `.debug()` contract for previews.

Import the public surface from `dyno-table/migration`; its published entrypoint and generated package artifacts are part of the [public API contract](reference/public-api.md).

## Execution model

```mermaid
sequenceDiagram
  participant Runner as Migration caller
  participant Manager as MigrationManager
  participant Checkpoint as Checkpoint repository
  participant Cursor as Cursor and Paginator
  participant Repo as Wrapped entity repository
  participant Ddb as DynamoDBDocument
  Runner->>Manager: run name and options
  Manager->>Checkpoint: acquire running lock when apply is true
  Manager->>Cursor: provide cursor to migration function
  Manager->>Repo: provide wrapped repositories
  Cursor->>Checkpoint: restore saved continuation
  Cursor->>Ddb: query or scan page
  Ddb-->>Cursor: page and continuation
  Cursor->>Checkpoint: persist continuation after page consumption
  Repo->>Ddb: execute direct or deferred writes only when apply is true
  Manager->>Checkpoint: mark success or error when apply is true
  Manager-->>Runner: MigrationRunResult
```

Applied runs acquire the lock before invoking the migration function. Cursor reads and writes, as well as all wrapped repository work, happen inside that function. After the consumer has successfully consumed every item in a page, the cursor persists that page's returned continuation. In a dry run there is no checkpoint or lock traffic, but reads still use DynamoDB so a migration can make decisions from real data.

## Public contract

```ts
const manager = new MigrationManager({ repos, migrationRepo });
manager.createMigration(name, async ({ repos, cursor }) => {
  for await (const item of cursor(repos.items.scan(), { pageSize: 100 })) {
    await repos.items.update({ id: item.id }, { migrated: true }).execute();
  }
});

const preview = await manager.run(name);
const applied = await manager.run(name, { apply: true });
```

- `createMigration(name, fn, { order? })` rejects duplicate names. The default `runAll()` order is registration order; a lower explicit `order` runs first and ties retain registration order.
- `run(name, { apply? })` defaults to dry-run. `MigrationRunResult` reports `name`, `applied`, `scanned`, `writes`, `durationMs`, and, only for dry-runs, `.debug()` `samples` for intercepted writes.
- `runAll(options)` preflights every registered checkpoint. It skips `success`, retries absent/error entries, aborts before starting anything if any is `running`, and stops at the first migration function failure.
- `MigrationCheckpointRepo` is a structural subset of an `EntityRepository`: it needs `get`, `create`, and an update builder with `add`, `remove`, `condition`, and `execute`. A normal checkpoint entity repository satisfies it; its records must include `name`, numeric `version`, and `cursors`.

## Safety and checkpoint invariants

### Dry-run versus applied writes

`wrapRepo` intercepts only `create`, `upsert`, `update`, and `delete`. Each intercepted direct `.execute()` increments `writes`; dry-runs collect `builder.debug()` and do not call the real executor, whereas `{ apply: true }` delegates to it. It also intercepts `withBatch` and `withTransaction`: dry-runs count and sample the source builder, replace the supplied deferred command's `.execute()` with a no-op, and do not attach it; applied runs delegate attachment to the real builder. `get`, `query`, and `scan` pass through unchanged in both modes. Do not rely on a write result in a dry run: either direct or deferred execution resolves `undefined`.

### Resuming a cursor

Use the supplied `cursor` around query or scan builders. In applied mode it restores `cursors[id].lastEvaluatedKey` with `builder.startFrom`, then uses `Paginator` with optional `pageSize`. It yields and counts each item in a page first; only after the consumer advances beyond the page does it persist that page's continuation key. If the consumer throws partway through a page, no continuation for that page is stored. Consequently an interruption or handled failure can reprocess the current page but should not skip it; migration bodies must be idempotent or make their writes conditional.

A completed cursor removes only its own checkpoint slot. Multiple cursors require distinct `id` values; the default is `default`, and calling `cursor()` twice with the same id throws before pagination. Set `pageSize` for a large migration: without it, `Paginator` can drain the source as one logical page before the first checkpoint, making the replay window unbounded.

### Lock and checkpoint lifecycle

```mermaid
stateDiagram-v2
  [*] --> absent
  absent --> running: applied run acquires lock
  running --> success: migration completes
  running --> error: migration throws
  error --> running: later applied run
  success --> running: direct applied run
  success --> success: runAll skips
```

Checkpoint `status` is a mutual-exclusion and outcome marker; `cursors` hold resumability state independently. Both cursor patches and status updates use a version-guarded read-modify-write. `patchCheckpoint` retries only `ConditionalCheckFailedException` conflicts, waiting a randomized exponential backoff before reloading the record, for at most five retries after the initial attempt. It may remove only the optional `error` field; a patch that sets another checkpoint field to `undefined` fails before writing. The conditional classifier recognizes either a raw AWS error or the `OperationError.cause` produced by Table execution; see [errors and validation](reference/errors-and-validation.md).

There is deliberately no stale-lock timeout. A hard process termination can leave `status: "running"`; inspect and repair that checkpoint record before retrying. A normally thrown migration error is persisted as `status: "error"` with its message, is rethrown to the caller, and leaves already completed page checkpoints in place. If that failure-status write itself fails, `run()` rejects with an error identifying the checkpoint-write failure and retains the original migration error as its `cause`; inspect the record before deciding how to retry.

## Change guide and validation

Consult this page when changing migration behavior, the checkpoint record schema, cursor timing, or the `dyno-table/migration` API.

- Preserve the ordering **acquire lock -> invoke migration -> mark success/error** for applied runs. Dry-runs must not lock or mutate checkpoints.
- Preserve yield-before-checkpoint and per-id isolation. A consumer error within a page must leave that page uncheckpointed; altering the order changes crash replay and data-loss behavior.
- If changing the proxy, retain the read/write boundary and direct plus `withBatch`/`withTransaction` interception. Validate that supported entity write builders expose `.debug()` and that dry-run deferred commands are suppressed. The proxy intentionally does not add retry policy for user writes.
- For checkpoint changes, retain the `version` conditional update, randomized bounded conflict retry, and the rule that only `error` may be removed. Checkpoint creation accepts an already-existing record only when the error is a conditional-check failure.
- For a public type or new migration subpath, update `src/migration/index.ts`, `src/migration.ts`, `tsdown.config.ts`, and `package.json` exports/typesVersions as applicable; then verify the consumer-facing build as described in [public API](reference/public-api.md). Generated `dist/` files are build output, not hand-edited sources.

Focused unit checks are:

```bash
pnpm test -- src/migration/__tests__/migration-manager.test.ts src/migration/__tests__/cursor.test.ts src/migration/__tests__/checkpoint-store.test.ts src/migration/__tests__/repo-proxy.test.ts
```

These cover dry-run interception (including `withBatch`/`withTransaction`), applied writes, lock statuses, ordering, cursor resume and post-consumption checkpoint timing, conflict backoff, field-removal constraints, and id isolation. In `cursor.test.ts`, start with `does not checkpoint a page when its consumer fails partway through`; in `migration-manager.test.ts`, start with `preserves the migration error if its failed checkpoint cannot be written`. Run `pnpm test:int -- src/migration/__tests__/migration-manager.itest.ts src/migration/__tests__/cursor-race.itest.ts` only when changing real DynamoDB behavior, concurrency, or repository integration; it requires the DynamoDB Local setup documented in [testing](development/testing.md). A published surface change additionally requires `pnpm run check-types && pnpm run build`.
