import { describe, expect, it } from "vitest";
import { docClient } from "../../../tests/ddb-client";
import { createIndex, defineEntity } from "../../entity/entity";
import type { StandardSchemaV1 } from "../../standard-schema";
import { Table } from "../../table";
import type { DynamoItem } from "../../types";
import { isConditionalCheckFailed } from "../../utils/error-utils";
import { MigrationManager } from "../migration-manager";
import type { MigrationCheckpointRecord } from "../types";

/**
 * These tests force real contention on a single checkpoint record against a real local
 * DynamoDB instance — no mocked timing, no fake conditional-check failures. The point is to
 * prove the version-guarded read/write cycle in checkpoint-store.ts (see MAX_CHECKPOINT_RETRIES)
 * actually survives genuine concurrent writers instead of just passing because the test happened
 * not to overlap.
 */

interface ItemRecord extends DynamoItem {
  id: string;
  touchedByFirst?: boolean;
  touchedBySecond?: boolean;
  migrated?: boolean;
}

const itemSchema: StandardSchemaV1<ItemRecord> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (data: unknown) => ({ value: data as ItemRecord }),
  },
};

const checkpointSchema: StandardSchemaV1<MigrationCheckpointRecord> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (data: unknown) => ({ value: data as MigrationCheckpointRecord }),
  },
};

const idKeySchema: StandardSchemaV1<{ id: string }> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (data: unknown) => ({ value: data as { id: string } }),
  },
};

const nameKeySchema: StandardSchemaV1<{ name: string }> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (data: unknown) => ({ value: data as { name: string } }),
  },
};

function createRepos() {
  const table = new Table({
    client: docClient,
    tableName: "TestTable",
    indexes: { partitionKey: "demoPartitionKey", sortKey: "demoSortKey" },
  });

  const itemEntity = defineEntity({
    name: "RaceItem",
    schema: itemSchema,
    primaryKey: createIndex()
      .input(idKeySchema)
      .partitionKey((item) => `RACEITEM#${item.id}`)
      .sortKey(() => "METADATA"),
    queries: {},
  });

  const checkpointEntity = defineEntity({
    name: "MigrationCheckpoint",
    schema: checkpointSchema,
    primaryKey: createIndex()
      .input(nameKeySchema)
      .partitionKey((item) => `MIGRATION#${item.name}`)
      .sortKey(() => "CHECKPOINT"),
    queries: {},
  });

  return {
    table,
    items: itemEntity.createRepository(table),
    checkpoints: checkpointEntity.createRepository(table),
  };
}

const ITEM_COUNT = 20;
const ITEM_IDS = Array.from({ length: ITEM_COUNT }, (_, i) => `item-${i}`);

async function seedItems(table: Table, items: ReturnType<typeof createRepos>["items"]) {
  const batch = table.batchBuilder();
  for (const id of ITEM_IDS) {
    items.create({ id }).withBatch(batch);
  }
  await batch.execute();
}

/** Counts real version conflicts without changing checkpoint update behavior. */
function countConditionalCheckFailures(repo: ReturnType<typeof createRepos>["checkpoints"]): { count(): number } {
  const realUpdate = repo.update.bind(repo);
  let failures = 0;
  repo.update = ((key, data) => {
    const builder = realUpdate(key, data);
    const realExecute = builder.execute.bind(builder);
    builder.execute = async () => {
      try {
        return await realExecute();
      } catch (error) {
        if (isConditionalCheckFailed(error)) failures += 1;
        throw error;
      }
    };
    return builder;
  }) as typeof repo.update;
  return { count: () => failures };
}

describe("Cursor race-condition integration tests", () => {
  it("rejects the loser when two apply:true runs of the same migration overlap, and the winner completes cleanly", async () => {
    const { table, items, checkpoints } = createRepos();
    await seedItems(table, items);

    const manager = new MigrationManager({ repos: { items }, migrationRepo: checkpoints });

    // Keep the winner inside the migration until the loser has failed to acquire the lock.
    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    manager.createMigration("race-backfill", async ({ repos, cursor }) => {
      await gate;
      for await (const item of cursor(repos.items.scan(), { pageSize: 1 })) {
        await repos.items.update({ id: item.id }, { migrated: true }).execute();
      }
    });

    const run1 = manager.run("race-backfill", { apply: true });
    const run2 = manager.run("race-backfill", { apply: true });
    await expect(Promise.race([run1, run2])).rejects.toThrow(/already running/);
    releaseGate();

    const results = await Promise.allSettled([run1, run2]);

    // Real mutual exclusion under real contention: exactly one run wins the lock, the other is
    // rejected outright rather than both racing through to completion.
    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<Awaited<typeof run1>> => r.status === "fulfilled",
    );
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(Error);
    expect(rejected[0]?.reason).toMatchObject({ message: expect.stringMatching(/already running/) });
    expect(fulfilled[0]?.value.applied).toBe(true);

    // The winner's migration genuinely ran to completion — every item was migrated.
    for (const id of ITEM_IDS) {
      const { item } = await items.get({ id }).execute();
      expect(item?.migrated).toBe(true);
    }

    // Lock released, no leftover cursor state, outcome recorded.
    const { item: checkpoint } = await checkpoints.get({ name: "race-backfill" }).execute();
    expect(checkpoint?.status).toBe("success");
    expect(checkpoint?.cursors).toEqual({});
  });

  it("keeps two distinct cursor ids racing concurrently within one run from corrupting each other", async () => {
    const { table, items, checkpoints } = createRepos();
    await seedItems(table, items);
    const conditionalCheckFailures = countConditionalCheckFailures(checkpoints);

    const manager = new MigrationManager({ repos: { items }, migrationRepo: checkpoints });

    manager.createMigration("dual-cursor-backfill", async ({ repos, cursor }) => {
      await Promise.all([
        (async () => {
          for await (const item of cursor(repos.items.scan(), { id: "first", pageSize: 1 })) {
            await repos.items.update({ id: item.id }, { touchedByFirst: true }).execute();
          }
        })(),
        (async () => {
          for await (const item of cursor(repos.items.scan(), { id: "second", pageSize: 1 })) {
            await repos.items.update({ id: item.id }, { touchedBySecond: true }).execute();
          }
        })(),
      ]);
    });

    const result = await manager.run("dual-cursor-backfill", { apply: true });

    expect(result.applied).toBe(true);
    for (const id of ITEM_IDS) {
      const { item } = await items.get({ id }).execute();
      expect(item?.touchedByFirst).toBe(true);
      expect(item?.touchedBySecond).toBe(true);
    }

    // Both cursor ids must have fully cleared their own slot — neither clobbered the other's.
    const { item: checkpoint } = await checkpoints.get({ name: "dual-cursor-backfill" }).execute();
    expect(checkpoint?.cursors).toEqual({});

    expect(conditionalCheckFailures.count()).toBeGreaterThan(0);
  });

  it("rejects the loser when two runAll() calls over the same batch overlap, and the winner runs everything", async () => {
    const { table, items, checkpoints } = createRepos();
    await seedItems(table, items);

    const manager = new MigrationManager({ repos: { items }, migrationRepo: checkpoints });

    // Gated on the FIRST migration in the batch, same technique as the run()-level test above:
    // whoever wins the lock for "race-step-1" holds it open, so the loser reliably observes
    // "running" during its own attempt instead of racing to complete before the loser even tries.
    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    manager.createMigration("race-step-1", async ({ repos, cursor }) => {
      await gate;
      for await (const item of cursor(repos.items.scan(), { pageSize: 1 })) {
        await repos.items.update({ id: item.id }, { touchedByFirst: true }).execute();
      }
    });
    manager.createMigration("race-step-2", async ({ repos, cursor }) => {
      for await (const item of cursor(repos.items.scan(), { pageSize: 1 })) {
        await repos.items.update({ id: item.id }, { touchedBySecond: true }).execute();
      }
    });

    const runAll1 = manager.runAll({ apply: true });
    const runAll2 = manager.runAll({ apply: true });
    releaseGate();

    const results = await Promise.allSettled([runAll1, runAll2]);

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<Awaited<typeof runAll1>> => r.status === "fulfilled",
    );
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ message: expect.stringMatching(/already running/) });
    expect(fulfilled[0]?.value.map((r) => r.name)).toEqual(["race-step-1", "race-step-2"]);

    // The winner's batch fully completed both migrations — no corruption, no lost updates.
    for (const id of ITEM_IDS) {
      const { item } = await items.get({ id }).execute();
      expect(item?.touchedByFirst).toBe(true);
      expect(item?.touchedBySecond).toBe(true);
    }
    for (const name of ["race-step-1", "race-step-2"]) {
      const { item: checkpoint } = await checkpoints.get({ name }).execute();
      expect(checkpoint?.status).toBe("success");
      expect(checkpoint?.cursors).toEqual({});
    }
  });
});
