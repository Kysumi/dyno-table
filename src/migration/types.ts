import type { QueryBuilderInterface } from "../builders/builder-types.js";
import type { Condition } from "../conditions.js";
import type { DynamoItem } from "../types.js";

export interface MigrationCheckpointRecord extends DynamoItem {
  /** pk — one record per migration, not per cursor */
  name: string;
  /** optimistic-concurrency guard for checkpoint writes, see checkpoint-store.ts */
  version: number;
  /**
   * Mutual-exclusion lock plus last-run outcome for `apply: true` runs. Absent until the first
   * `apply: true` run ever starts. MigrationManager.run() sets this to "running" before invoking
   * the migration function, then "success" or "error" once it settles — so a second concurrent
   * `run()` of the same migration name sees "running" and fails fast instead of racing.
   *
   * Not staleness-checked: if the process holding the lock is killed outright (not a caught
   * throw), this stays "running" until manually reset on the checkpoint record.
   */
  status?: "running" | "success" | "error";
  /** Exception message from the most recently failed run. Cleared on the next successful run. */
  error?: string;
  cursors: Record<string, { lastEvaluatedKey?: Record<string, unknown> }>;
}

/**
 * Minimal shape MigrationManager needs from a user-supplied checkpoint repo.
 * Anything returned by `SomeEntity.createRepository(table)` already satisfies this —
 * it's a structural subset of EntityRepository, not a new interface users implement by hand.
 */
export interface MigrationCheckpointUpdateBuilder {
  add(path: "version", value: number): MigrationCheckpointUpdateBuilder;
  remove(path: "error"): MigrationCheckpointUpdateBuilder;
  // biome-ignore lint/suspicious/noExplicitAny: structural subset of EntityUpdateBuilder, generic over caller's condition operator
  condition(fn: (op: any) => Condition): MigrationCheckpointUpdateBuilder;
  execute(): Promise<unknown>;
}

export interface MigrationCheckpointRepo {
  get(key: { name: string }): { execute(): Promise<{ item?: MigrationCheckpointRecord }> };
  create(data: MigrationCheckpointRecord): { execute(): Promise<unknown> };
  update(key: { name: string }, data: Partial<MigrationCheckpointRecord>): MigrationCheckpointUpdateBuilder;
}

/** Any object with `.execute()` — put/upsert/update/delete/get/query/scan builders all qualify. */
export interface ExecutableBuilder<T = unknown> {
  execute(): Promise<T>;
}

/** Builders that also expose `.debug()` — every entity-aware write builder already does. */
export interface DebuggableBuilder<T = unknown> extends ExecutableBuilder<T> {
  debug(): { raw: unknown; readable: unknown };
}

export interface MigrationManagerOptions<TRepos extends Record<string, unknown>> {
  repos: TRepos;
  migrationRepo: MigrationCheckpointRepo;
}

export interface MigrationRunOptions {
  /** Must be explicitly `true` to perform real writes. Default (or `false`) = dry run. */
  apply?: boolean;
}

export interface CreateMigrationOptions {
  /**
   * Where this migration runs relative to others when `runAll()` is used. Defaults to
   * registration order (the order `createMigration()` calls happened in) — set this explicitly
   * only when registration order doesn't match the order migrations are defined across modules.
   * Ties break by registration order.
   */
  order?: number;
}

export interface MigrationRunResult {
  name: string;
  applied: boolean;
  /** Items yielded across all cursor() loops in this run. */
  scanned: number;
  /** Write-builder .execute() calls intercepted (real writes if applied, would-be writes if not). */
  writes: number;
  /** Present only when applied === false — captured .debug() output per intercepted write. */
  samples?: Array<{ raw: unknown; readable: unknown }>;
  /** Wall-clock ms, for reporting on large backfills. */
  durationMs: number;
}

export type MigrationFn<TRepos extends Record<string, unknown>> = (ctx: {
  repos: TRepos;
  cursor: CursorFn;
}) => Promise<void>;

export type CursorFn = <T extends DynamoItem>(
  builder: QueryBuilderInterface<T>,
  options?: {
    id?: string;
    /**
     * Items fetched per DynamoDB request/checkpoint, same semantics as `builder.paginate(pageSize)`.
     * Without this, `Paginator` has no per-request cap and drains the entire scan/query as a single
     * page before any checkpoint is written — defeating resumability on a large table. Set this to
     * whatever chunk size makes a crash mid-migration lose an acceptable amount of re-work.
     */
    pageSize?: number;
  },
) => AsyncIterable<T>;

/** Per-run mutable state shared between the repo proxy and the cursor. */
export interface RunContext {
  apply: boolean;
  writes: number;
  scanned: number;
  samples: Array<{ raw: unknown; readable: unknown }>;
}
