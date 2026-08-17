import { ensureCheckpointRecordExists, patchCheckpoint } from "./checkpoint-store.js";
import { makeCursor } from "./cursor.js";
import { wrapRepo } from "./repo-proxy.js";
import type {
  CreateMigrationOptions,
  MigrationCheckpointRepo,
  MigrationFn,
  MigrationManagerOptions,
  MigrationRunOptions,
  MigrationRunResult,
  RunContext,
} from "./types.js";

interface RegisteredMigration<TRepos extends Record<string, unknown>> {
  fn: MigrationFn<TRepos>;
  order: number;
}

/**
 * Registers and runs backfill/data-movement migrations against user-supplied entity repos.
 *
 * `run()` never performs real writes unless called with `{ apply: true }` — by default every
 * intercepted write is captured via `.debug()` instead of executed.
 *
 * An `apply: true` run holds a lock on the checkpoint record for its whole duration (see
 * checkpoint-store.ts): `status` goes to "running" before the migration function is invoked, then
 * "success" or "error" once it settles, with the exception message persisted to `error` on
 * failure. A second concurrent `run(name, { apply: true })` for the same migration sees "running"
 * and rejects immediately instead of racing. Not staleness-checked — if the process holding the
 * lock is killed outright (not a caught error), `status` stays "running" until the checkpoint
 * record is fixed manually. Dry runs never touch this lock.
 *
 * If the migration function throws, the rejection propagates without being swallowed. Any
 * checkpoints already persisted from completed pages remain in place, so a subsequent
 * `run(name, { apply: true })` resumes from the last completed page instead of restarting.
 */
export class MigrationManager<TRepos extends Record<string, unknown>> {
  private readonly repos: TRepos;
  private readonly migrationRepo: MigrationCheckpointRepo;
  private readonly registry = new Map<string, RegisteredMigration<TRepos>>();

  constructor(options: MigrationManagerOptions<TRepos>) {
    this.repos = options.repos;
    this.migrationRepo = options.migrationRepo;
  }

  createMigration(name: string, fn: MigrationFn<TRepos>, options: CreateMigrationOptions = {}): void {
    if (this.registry.has(name)) throw new Error(`Migration "${name}" is already registered`);
    this.registry.set(name, { fn, order: options.order ?? this.registry.size });
  }

  async run(name: string, options: MigrationRunOptions = {}): Promise<MigrationRunResult> {
    const registered = this.registry.get(name);
    if (!registered) throw new Error(`No migration registered with name "${name}"`);

    const apply = options.apply === true;
    const ctx: RunContext = { apply, writes: 0, scanned: 0, samples: [] };

    const wrappedRepos = Object.fromEntries(
      Object.entries(this.repos).map(([key, repo]) => [key, wrapRepo(repo as Record<string, unknown>, ctx)]),
    ) as TRepos;

    const cursor = makeCursor(ctx, this.migrationRepo, name);

    if (apply) await this.acquireLock(name);

    const start = Date.now();
    try {
      await registered.fn({ repos: wrappedRepos, cursor });
    } catch (err) {
      if (apply) {
        try {
          await this.markFailed(name, err);
        } catch (checkpointErr) {
          throw new Error(
            `Migration "${name}" failed, and the checkpoint could not be marked as failed: ${String(checkpointErr)}`,
            { cause: err },
          );
        }
      }
      throw err;
    }
    if (apply) await this.markSucceeded(name);

    return {
      name,
      applied: apply,
      scanned: ctx.scanned,
      writes: ctx.writes,
      samples: apply ? undefined : ctx.samples,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Runs every registered migration that hasn't already succeeded, in order (registration order,
   * or the explicit `order` passed to `createMigration()`), skipping ones whose checkpoint
   * `status` is already "success".
   *
   * Before running anything, checks every registered migration's checkpoint status: if any is
   * currently "running", the whole call throws immediately without running a single migration —
   * either another process is genuinely mid-run, or a previous run crashed and left that
   * migration's lock stuck, and either way it isn't safe to guess which and barrel ahead.
   *
   * Stops at the first migration that throws — later migrations in the batch are not attempted,
   * since they may assume earlier ones already succeeded. Already-completed migrations from
   * earlier in this same `runAll()` call remain applied.
   */
  async runAll(options: MigrationRunOptions = {}): Promise<MigrationRunResult[]> {
    const entries = [...this.registry.entries()].sort((a, b) => a[1].order - b[1].order);

    const statuses = await Promise.all(
      entries.map(async ([name]) => {
        const { item } = await this.migrationRepo.get({ name }).execute();
        return item?.status;
      }),
    );

    const runningIndex = statuses.indexOf("running");
    if (runningIndex !== -1) {
      const runningName = entries[runningIndex]?.[0];
      throw new Error(
        `Migration "${runningName}" is already running — refusing to run all migrations. ` +
          "Either another process is mid-run, or a previous run crashed and left this migration's " +
          "checkpoint stuck; check its status before retrying.",
      );
    }

    const results: MigrationRunResult[] = [];
    for (const [index, [name]] of entries.entries()) {
      if (statuses[index] === "success") continue;
      results.push(await this.run(name, options));
    }
    return results;
  }

  private async acquireLock(name: string): Promise<void> {
    await ensureCheckpointRecordExists(this.migrationRepo, name);
    await patchCheckpoint(this.migrationRepo, name, (record) => {
      if (record?.status === "running") {
        throw new Error(`Migration "${name}" is already running`);
      }
      return { status: "running" };
    });
  }

  private async markSucceeded(name: string): Promise<void> {
    await patchCheckpoint(this.migrationRepo, name, () => ({ status: "success", error: undefined }));
  }

  private async markFailed(name: string, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    await patchCheckpoint(this.migrationRepo, name, () => ({ status: "error", error: message }));
  }
}
