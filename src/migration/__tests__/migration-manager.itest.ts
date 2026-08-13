import { describe, expect, it } from "vitest";
import { docClient } from "../../../tests/ddb-client";
import { createIndex, defineEntity } from "../../entity/entity";
import type { StandardSchemaV1 } from "../../standard-schema";
import { Table } from "../../table";
import type { DynamoItem } from "../../types";
import { MigrationManager } from "../migration-manager";
import type { MigrationCheckpointRecord } from "../types";

interface OrderRecord extends DynamoItem {
  id: string;
  amount: number;
  userId?: string;
  total?: number;
  displayName?: string;
  step1?: boolean;
  step2?: boolean;
  step3?: boolean;
}

interface UserRecord extends DynamoItem {
  id: string;
  displayName: string;
}

interface ArchivedOrderRecord extends DynamoItem {
  id: string;
  amount: number;
}

const orderSchema: StandardSchemaV1<OrderRecord> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (data: unknown) => ({ value: data as OrderRecord }),
  },
};

const userSchema: StandardSchemaV1<UserRecord> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (data: unknown) => ({ value: data as UserRecord }),
  },
};

const archivedOrderSchema: StandardSchemaV1<ArchivedOrderRecord> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (data: unknown) => ({ value: data as ArchivedOrderRecord }),
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

  const orderEntity = defineEntity({
    name: "Order",
    schema: orderSchema,
    primaryKey: createIndex()
      .input(idKeySchema)
      .partitionKey((item) => `ORDER#${item.id}`)
      .sortKey(() => "METADATA"),
    queries: {},
  });

  const userEntity = defineEntity({
    name: "User",
    schema: userSchema,
    primaryKey: createIndex()
      .input(idKeySchema)
      .partitionKey((item) => `USER#${item.id}`)
      .sortKey(() => "PROFILE"),
    queries: {},
  });

  const archivedOrderEntity = defineEntity({
    name: "ArchivedOrder",
    schema: archivedOrderSchema,
    primaryKey: createIndex()
      .input(idKeySchema)
      .partitionKey((item) => `ARCHIVED-ORDER#${item.id}`)
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
    orders: orderEntity.createRepository(table),
    users: userEntity.createRepository(table),
    archives: archivedOrderEntity.createRepository(table),
    checkpoints: checkpointEntity.createRepository(table),
  };
}

const ORDER_IDS = ["order-1", "order-2", "order-3", "order-4", "order-5"];

async function seedOrders(table: Table, orders: ReturnType<typeof createRepos>["orders"]) {
  const batch = table.batchBuilder();
  for (const [index, id] of ORDER_IDS.entries()) {
    orders.create({ id, amount: (index + 1) * 10 }).withBatch(batch);
  }
  await batch.execute();
}

const USER_IDS = ["user-1", "user-2"];

/** Seeds two users and assigns every order to one of them round-robin, for cross-repo tests. */
async function seedUsersAndOwnedOrders(
  table: Table,
  users: ReturnType<typeof createRepos>["users"],
  orders: ReturnType<typeof createRepos>["orders"],
) {
  const batch = table.batchBuilder();
  users.create({ id: "user-1", displayName: "Alice" }).withBatch(batch);
  users.create({ id: "user-2", displayName: "Bob" }).withBatch(batch);
  for (const [index, id] of ORDER_IDS.entries()) {
    const userId = USER_IDS[index % USER_IDS.length] as string;
    orders.create({ id, amount: (index + 1) * 10, userId }).withBatch(batch);
  }
  await batch.execute();
}

describe("MigrationManager Integration Tests", () => {
  it("dry run computes writes/samples but never touches real data or checkpoint state", async () => {
    const { table, orders, checkpoints } = createRepos();
    await seedOrders(table, orders);

    const manager = new MigrationManager({ repos: { orders }, migrationRepo: checkpoints });
    manager.createMigration("compute-totals", async ({ repos, cursor }) => {
      for await (const order of cursor(repos.orders.scan())) {
        await repos.orders.update({ id: order.id }, { total: order.amount * 2 }).execute();
      }
    });

    const result = await manager.run("compute-totals");

    expect(result.applied).toBe(false);
    expect(result.scanned).toBe(ORDER_IDS.length);
    expect(result.writes).toBe(ORDER_IDS.length);
    expect(result.samples).toHaveLength(ORDER_IDS.length);
    for (const sample of result.samples ?? []) {
      expect(sample.raw).toBeDefined();
      expect(sample.readable).toBeDefined();
    }

    // Real items must be completely untouched.
    for (const id of ORDER_IDS) {
      const { item } = await orders.get({ id }).execute();
      expect(item?.total).toBeUndefined();
    }

    // Dry run must not create a checkpoint record at all.
    const { item: checkpoint } = await checkpoints.get({ name: "compute-totals" }).execute();
    expect(checkpoint).toBeUndefined();
  });

  it("apply: true performs the real writes and clears the checkpoint on completion", async () => {
    const { table, orders, checkpoints } = createRepos();
    await seedOrders(table, orders);

    const manager = new MigrationManager({ repos: { orders }, migrationRepo: checkpoints });
    manager.createMigration("compute-totals", async ({ repos, cursor }) => {
      for await (const order of cursor(repos.orders.scan())) {
        await repos.orders.update({ id: order.id }, { total: order.amount * 2 }).execute();
      }
    });

    const result = await manager.run("compute-totals", { apply: true });

    expect(result.applied).toBe(true);
    expect(result.samples).toBeUndefined();
    expect(result.writes).toBe(ORDER_IDS.length);

    for (const id of ORDER_IDS) {
      const { item } = await orders.get({ id }).execute();
      expect(item?.total).toBe((item?.amount as number) * 2);
    }

    const { item: checkpoint } = await checkpoints.get({ name: "compute-totals" }).execute();
    expect(checkpoint).toBeDefined();
    expect(checkpoint?.cursors).toEqual({});
    expect(checkpoint?.status).toBe("success");
    expect(checkpoint?.error).toBeUndefined();
  });

  it("running twice with apply: true is idempotent and re-clears the checkpoint", async () => {
    const { table, orders, checkpoints } = createRepos();
    await seedOrders(table, orders);

    const manager = new MigrationManager({ repos: { orders }, migrationRepo: checkpoints });
    manager.createMigration("compute-totals", async ({ repos, cursor }) => {
      for await (const order of cursor(repos.orders.scan())) {
        await repos.orders.update({ id: order.id }, { total: order.amount * 2 }).execute();
      }
    });

    await manager.run("compute-totals", { apply: true });
    const second = await manager.run("compute-totals", { apply: true });

    expect(second.writes).toBe(ORDER_IDS.length);
    for (const id of ORDER_IDS) {
      const { item } = await orders.get({ id }).execute();
      expect(item?.total).toBe((item?.amount as number) * 2);
    }
  });

  it("resumes from the last checkpoint after the migration function throws mid-run", async () => {
    const { table, orders, checkpoints } = createRepos();
    await seedOrders(table, orders);

    const manager = new MigrationManager({ repos: { orders }, migrationRepo: checkpoints });

    let shouldThrow = true;
    manager.createMigration("flaky-backfill", async ({ repos, cursor }) => {
      // pageSize: 1 forces one checkpoint write per item, so the crash below lands mid-scan
      // with a real, partially-advanced checkpoint already persisted.
      for await (const order of cursor(repos.orders.scan(), { pageSize: 1 })) {
        await repos.orders.update({ id: order.id }, { total: order.amount * 2 }).execute();
        if (order.id === "order-2" && shouldThrow) {
          throw new Error("simulated crash mid-migration");
        }
      }
    });

    await expect(manager.run("flaky-backfill", { apply: true })).rejects.toThrow("simulated crash mid-migration");

    // Checkpoint from the pages completed before the throw must survive the rejection.
    const { item: checkpointAfterCrash } = await checkpoints.get({ name: "flaky-backfill" }).execute();
    expect(checkpointAfterCrash).toBeDefined();
    expect(checkpointAfterCrash?.cursors.default?.lastEvaluatedKey).toBeDefined();

    // The lock is released (not stuck at "running") and the failure is recorded for diagnosis.
    expect(checkpointAfterCrash?.status).toBe("error");
    expect(checkpointAfterCrash?.error).toBe("simulated crash mid-migration");

    const migratedBeforeCrash = await Promise.all(ORDER_IDS.map((id) => orders.get({ id }).execute()));
    const migratedCount = migratedBeforeCrash.filter(({ item }) => item?.total !== undefined).length;
    expect(migratedCount).toBeGreaterThan(0);
    expect(migratedCount).toBeLessThan(ORDER_IDS.length);

    // Resume: let it run to completion this time.
    shouldThrow = false;
    const finalResult = await manager.run("flaky-backfill", { apply: true });
    expect(finalResult.applied).toBe(true);

    for (const id of ORDER_IDS) {
      const { item } = await orders.get({ id }).execute();
      expect(item?.total).toBe((item?.amount as number) * 2);
    }

    const { item: finalCheckpoint } = await checkpoints.get({ name: "flaky-backfill" }).execute();
    expect(finalCheckpoint?.cursors).toEqual({});
    expect(finalCheckpoint?.status).toBe("success");
    expect(finalCheckpoint?.error).toBeUndefined();
  });

  it("rejects a second apply:true run started while one is still in flight", async () => {
    const { table, orders, checkpoints } = createRepos();
    await seedOrders(table, orders);

    const manager = new MigrationManager({ repos: { orders }, migrationRepo: checkpoints });

    let releaseFirstRun: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseFirstRun = resolve;
    });

    manager.createMigration("slow-backfill", async ({ repos, cursor }) => {
      for await (const order of cursor(repos.orders.scan(), { pageSize: 1 })) {
        if (order.id === "order-1") await gate; // hold the lock open until the test says so
        await repos.orders.update({ id: order.id }, { total: order.amount * 2 }).execute();
      }
    });

    const firstRun = manager.run("slow-backfill", { apply: true });

    // Give the first run a moment to actually acquire the lock before the second attempts to.
    await new Promise((resolve) => setTimeout(resolve, 50));

    await expect(manager.run("slow-backfill", { apply: true })).rejects.toThrow(/already running/);

    releaseFirstRun();
    const result = await firstRun;
    expect(result.applied).toBe(true);
  });

  it("reads from one repo to enrich writes to a different repo, in both dry-run and apply modes", async () => {
    const { table, orders, users, checkpoints } = createRepos();
    await seedUsersAndOwnedOrders(table, users, orders);

    const manager = new MigrationManager({ repos: { orders, users }, migrationRepo: checkpoints });
    manager.createMigration("denormalize-owner-name", async ({ repos, cursor }) => {
      for await (const order of cursor(repos.orders.scan())) {
        const { item: owner } = await repos.users.get({ id: order.userId as string }).execute();
        await repos.orders.update({ id: order.id }, { displayName: owner?.displayName }).execute();
      }
    });

    const dryRun = await manager.run("denormalize-owner-name");
    expect(dryRun.writes).toBe(ORDER_IDS.length);
    for (const id of ORDER_IDS) {
      const { item } = await orders.get({ id }).execute();
      expect(item?.displayName).toBeUndefined();
    }

    const applied = await manager.run("denormalize-owner-name", { apply: true });
    expect(applied.applied).toBe(true);
    for (const [index, id] of ORDER_IDS.entries()) {
      const expectedOwner = index % 2 === 0 ? "Alice" : "Bob";
      const { item } = await orders.get({ id }).execute();
      expect(item?.displayName).toBe(expectedOwner);
    }
  });

  it("creates and deletes real items across the proxy in both dry-run and apply modes", async () => {
    const { table, orders, archives, checkpoints } = createRepos();
    await seedOrders(table, orders);

    const manager = new MigrationManager({ repos: { orders, archives }, migrationRepo: checkpoints });
    manager.createMigration("archive-orders", async ({ repos, cursor }) => {
      for await (const order of cursor(repos.orders.scan())) {
        await repos.archives.create({ id: order.id, amount: order.amount }).execute();
        await repos.orders.delete({ id: order.id }).execute();
      }
    });

    const dryRun = await manager.run("archive-orders");
    expect(dryRun.writes).toBe(ORDER_IDS.length * 2);
    for (const sample of dryRun.samples ?? []) {
      expect(sample.raw).toBeDefined();
      expect(sample.readable).toBeDefined();
    }
    for (const id of ORDER_IDS) {
      const { item: archived } = await archives.get({ id }).execute();
      expect(archived).toBeUndefined();
      const { item: order } = await orders.get({ id }).execute();
      expect(order).toBeDefined();
    }

    const applied = await manager.run("archive-orders", { apply: true });
    expect(applied.applied).toBe(true);
    for (const id of ORDER_IDS) {
      const { item: archived } = await archives.get({ id }).execute();
      expect(archived?.id).toBe(id);
      expect(archived?.amount).toEqual(expect.any(Number));
      const { item: order } = await orders.get({ id }).execute();
      expect(order).toBeUndefined();
    }
  });

  describe("runAll()", () => {
    it("runs only outstanding migrations, in order, and leaves already-succeeded ones untouched", async () => {
      const { table, orders, checkpoints } = createRepos();
      await seedOrders(table, orders);

      const executed: string[] = [];
      const manager = new MigrationManager({ repos: { orders }, migrationRepo: checkpoints });
      manager.createMigration("step-1", async ({ repos, cursor }) => {
        executed.push("step-1");
        for await (const order of cursor(repos.orders.scan())) {
          await repos.orders.update({ id: order.id }, { step1: true }).execute();
        }
      });
      manager.createMigration("step-2", async ({ repos, cursor }) => {
        executed.push("step-2");
        for await (const order of cursor(repos.orders.scan())) {
          await repos.orders.update({ id: order.id }, { step2: true }).execute();
        }
      });
      manager.createMigration("step-3", async ({ repos, cursor }) => {
        executed.push("step-3");
        for await (const order of cursor(repos.orders.scan())) {
          await repos.orders.update({ id: order.id }, { step3: true }).execute();
        }
      });

      // step-1 already ran and succeeded in an earlier deploy.
      await manager.run("step-1", { apply: true });
      executed.length = 0;

      const results = await manager.runAll({ apply: true });

      expect(executed).toEqual(["step-2", "step-3"]);
      expect(results.map((r) => r.name)).toEqual(["step-2", "step-3"]);

      for (const id of ORDER_IDS) {
        const { item } = await orders.get({ id }).execute();
        expect(item?.step1).toBe(true);
        expect(item?.step2).toBe(true);
        expect(item?.step3).toBe(true);
      }

      for (const name of ["step-1", "step-2", "step-3"]) {
        const { item: checkpoint } = await checkpoints.get({ name }).execute();
        expect(checkpoint?.status).toBe("success");
      }
    });

    it("throws immediately and runs nothing if a migration's checkpoint is stuck in running status", async () => {
      const { table, orders, checkpoints } = createRepos();
      await seedOrders(table, orders);

      const executed: string[] = [];
      const manager = new MigrationManager({ repos: { orders }, migrationRepo: checkpoints });
      manager.createMigration("step-a", async ({ repos, cursor }) => {
        executed.push("step-a");
        for await (const order of cursor(repos.orders.scan())) {
          await repos.orders.update({ id: order.id }, { step1: true }).execute();
        }
      });
      manager.createMigration("step-b", async ({ repos, cursor }) => {
        executed.push("step-b");
        for await (const order of cursor(repos.orders.scan())) {
          await repos.orders.update({ id: order.id }, { step2: true }).execute();
        }
      });

      // Simulate a crashed process: step-b's checkpoint was left stuck at "running".
      await checkpoints.create({ name: "step-b", version: 0, status: "running", cursors: {} }).execute();

      await expect(manager.runAll({ apply: true })).rejects.toThrow(/"step-b" is already running/);
      expect(executed).toEqual([]);

      // Nothing was touched — not even step-a, which had nothing wrong with it.
      for (const id of ORDER_IDS) {
        const { item } = await orders.get({ id }).execute();
        expect(item?.step1).toBeUndefined();
        expect(item?.step2).toBeUndefined();
      }
    });

    it("recovers after an operator manually resets a stuck running checkpoint", async () => {
      const { table, orders, checkpoints } = createRepos();
      await seedOrders(table, orders);

      const executed: string[] = [];
      const manager = new MigrationManager({ repos: { orders }, migrationRepo: checkpoints });
      manager.createMigration("step-a", async ({ repos, cursor }) => {
        executed.push("step-a");
        for await (const order of cursor(repos.orders.scan())) {
          await repos.orders.update({ id: order.id }, { step1: true }).execute();
        }
      });
      manager.createMigration("step-b", async ({ repos, cursor }) => {
        executed.push("step-b");
        for await (const order of cursor(repos.orders.scan())) {
          await repos.orders.update({ id: order.id }, { step2: true }).execute();
        }
      });

      // Simulate a crashed process: step-b's checkpoint was left stuck at "running".
      await checkpoints.create({ name: "step-b", version: 0, status: "running", cursors: {} }).execute();
      await expect(manager.runAll({ apply: true })).rejects.toThrow(/"step-b" is already running/);
      expect(executed).toEqual([]);

      // Operator investigates, confirms nothing is actually still running, and manually clears
      // the lock directly on the checkpoint record — this bypasses MigrationManager entirely,
      // exactly as documented ("fixed manually" — not something the library does for you).
      await checkpoints.update({ name: "step-b" }, { status: "error" }).execute();

      const results = await manager.runAll({ apply: true });

      expect(executed).toEqual(["step-a", "step-b"]);
      expect(results.map((r) => r.name)).toEqual(["step-a", "step-b"]);
      for (const id of ORDER_IDS) {
        const { item } = await orders.get({ id }).execute();
        expect(item?.step1).toBe(true);
        expect(item?.step2).toBe(true);
      }
      for (const name of ["step-a", "step-b"]) {
        const { item: checkpoint } = await checkpoints.get({ name }).execute();
        expect(checkpoint?.status).toBe("success");
      }
    });

    it("composes with resumability: a batch that dies mid-migration picks up correctly on the next runAll()", async () => {
      const { table, orders, checkpoints } = createRepos();
      await seedOrders(table, orders);

      let step2ShouldThrow = true;
      const executed: string[] = [];
      const manager = new MigrationManager({ repos: { orders }, migrationRepo: checkpoints });
      manager.createMigration("step-1", async ({ repos, cursor }) => {
        executed.push("step-1");
        for await (const order of cursor(repos.orders.scan(), { pageSize: 1 })) {
          await repos.orders.update({ id: order.id }, { step1: true }).execute();
        }
      });
      manager.createMigration("step-2", async ({ repos, cursor }) => {
        executed.push("step-2");
        for await (const order of cursor(repos.orders.scan(), { pageSize: 1 })) {
          await repos.orders.update({ id: order.id }, { step2: true }).execute();
          if (order.id === "order-2" && step2ShouldThrow) {
            throw new Error("simulated crash in step-2");
          }
        }
      });
      manager.createMigration("step-3", async ({ repos, cursor }) => {
        executed.push("step-3");
        for await (const order of cursor(repos.orders.scan())) {
          await repos.orders.update({ id: order.id }, { step3: true }).execute();
        }
      });

      await expect(manager.runAll({ apply: true })).rejects.toThrow("simulated crash in step-2");

      // step-1 completed fully; step-2 crashed partway; step-3 was never even attempted.
      expect(executed).toEqual(["step-1", "step-2"]);
      const { item: step1Checkpoint } = await checkpoints.get({ name: "step-1" }).execute();
      expect(step1Checkpoint?.status).toBe("success");
      const { item: step2Checkpoint } = await checkpoints.get({ name: "step-2" }).execute();
      expect(step2Checkpoint?.status).toBe("error");
      expect(step2Checkpoint?.error).toBe("simulated crash in step-2");
      const { item: step3Checkpoint } = await checkpoints.get({ name: "step-3" }).execute();
      expect(step3Checkpoint).toBeUndefined();

      for (const id of ORDER_IDS) {
        const { item } = await orders.get({ id }).execute();
        expect(item?.step1).toBe(true); // step-1 fully applied to everything
        expect(item?.step3).toBeUndefined(); // step-3 never ran
      }
      const step2Progress = await Promise.all(ORDER_IDS.map((id) => orders.get({ id }).execute()));
      const step2Count = step2Progress.filter(({ item }) => item?.step2 === true).length;
      expect(step2Count).toBeGreaterThan(0);
      expect(step2Count).toBeLessThan(ORDER_IDS.length);

      // Fix the bug and redeploy: a second runAll() should skip step-1 (already done),
      // resume step-2 from its checkpoint, and finally get to step-3.
      step2ShouldThrow = false;
      executed.length = 0;

      const results = await manager.runAll({ apply: true });

      expect(executed).toEqual(["step-2", "step-3"]);
      expect(results.map((r) => r.name)).toEqual(["step-2", "step-3"]);

      for (const id of ORDER_IDS) {
        const { item } = await orders.get({ id }).execute();
        expect(item?.step1).toBe(true);
        expect(item?.step2).toBe(true);
        expect(item?.step3).toBe(true);
      }
      for (const name of ["step-1", "step-2", "step-3"]) {
        const { item: checkpoint } = await checkpoints.get({ name }).execute();
        expect(checkpoint?.status).toBe("success");
        expect(checkpoint?.cursors).toEqual({});
      }
    });
  });
});
