import { isConditionalCheckFailed } from "../utils/error-utils.js";
import type { MigrationCheckpointRecord, MigrationCheckpointRepo } from "./types.js";

const MAX_CHECKPOINT_RETRIES = 5;

export async function ensureCheckpointRecordExists(repo: MigrationCheckpointRepo, name: string): Promise<void> {
  try {
    await repo.create({ name, version: 0, cursors: {} }).execute();
  } catch (err) {
    if (!isConditionalCheckFailed(err)) throw err;
    // already created by an earlier run or a sibling cursor — fine
  }
}

/**
 * Version-guarded read-modify-write against a migration's checkpoint record — the one retry
 * mechanism shared by cursor checkpointing (cursor.ts) and run-lock acquire/release
 * (migration-manager.ts), so there's a single place that knows how to safely mutate this record
 * under concurrent writers.
 *
 * `computePatch` receives the current record (undefined if not yet created) and returns the
 * fields to merge in — a field set to `undefined` is removed (e.g. clearing a stale `error`)
 * rather than written literally, since DynamoDB can't store `undefined`. `computePatch` may also
 * throw instead of returning a patch — e.g. to reject an update because a lock is already held —
 * and that error propagates immediately, with no retry.
 */
export async function patchCheckpoint(
  repo: MigrationCheckpointRepo,
  name: string,
  computePatch: (record: MigrationCheckpointRecord | undefined) => Partial<MigrationCheckpointRecord>,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const { item: record } = await repo.get({ name }).execute();
    const version = record?.version ?? 0;
    const patch = computePatch(record);

    const setFields: Partial<MigrationCheckpointRecord> = {};
    const removeFields: Array<"error"> = [];
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) removeFields.push(key as "error");
      else Object.assign(setFields, { [key]: value });
    }

    try {
      let builder = repo
        .update({ name }, setFields)
        .add("version", 1)
        .condition((op) => op.eq("version", version));
      for (const field of removeFields) builder = builder.remove(field);
      await builder.execute();
      return;
    } catch (err) {
      if (!isConditionalCheckFailed(err) || attempt >= MAX_CHECKPOINT_RETRIES) throw err;
      // lost the race to a concurrent writer — reload the fresh version + record and retry
    }
  }
}
