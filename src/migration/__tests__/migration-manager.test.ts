import { describe, expect, it, vi } from "vitest";
import { MigrationManager } from "../migration-manager";
import type { MigrationCheckpointRepo } from "../types";

function makeMigrationRepo(): MigrationCheckpointRepo {
  return {
    get: vi.fn().mockReturnValue({ execute: vi.fn().mockResolvedValue({ item: undefined }) }),
    create: vi.fn().mockReturnValue({ execute: vi.fn().mockResolvedValue(undefined) }),
    update: vi.fn().mockReturnValue({
      add: vi.fn().mockReturnThis(),
      remove: vi.fn().mockReturnThis(),
      condition: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    }),
  } as unknown as MigrationCheckpointRepo;
}

/** Like makeMigrationRepo(), but get() reflects a per-name status so runAll()'s preflight scan sees it. */
function makeStatefulMigrationRepo(
  statusesByName: Record<string, "running" | "success" | "error">,
): MigrationCheckpointRepo {
  return {
    get: vi.fn((key: { name: string }) => ({
      execute: vi.fn().mockResolvedValue({
        item: statusesByName[key.name]
          ? { name: key.name, version: 1, status: statusesByName[key.name], cursors: {} }
          : undefined,
      }),
    })),
    create: vi.fn().mockReturnValue({ execute: vi.fn().mockResolvedValue(undefined) }),
    update: vi.fn().mockReturnValue({
      add: vi.fn().mockReturnThis(),
      remove: vi.fn().mockReturnThis(),
      condition: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    }),
  } as unknown as MigrationCheckpointRepo;
}

describe("MigrationManager", () => {
  it("throws when registering the same migration name twice", () => {
    const manager = new MigrationManager({ repos: {}, migrationRepo: makeMigrationRepo() });
    manager.createMigration("backfill", async () => {});

    expect(() => manager.createMigration("backfill", async () => {})).toThrow(/already registered/);
  });

  it("throws when running an unregistered migration name", async () => {
    const manager = new MigrationManager({ repos: {}, migrationRepo: makeMigrationRepo() });

    await expect(manager.run("nope")).rejects.toThrow(/No migration registered/);
  });

  it("default run() never invokes a wrapped write builder's real execute()", async () => {
    const realExecute = vi.fn().mockImplementation(() => {
      throw new Error("real execute must not be called without { apply: true }");
    });
    const writeBuilder = { execute: realExecute, debug: vi.fn().mockReturnValue({ raw: "r", readable: "r" }) };
    const repos = { users: { create: vi.fn().mockReturnValue(writeBuilder) } };

    const manager = new MigrationManager({ repos, migrationRepo: makeMigrationRepo() });
    manager.createMigration("backfill", async ({ repos: r }) => {
      await r.users.create({ id: "1" }).execute();
    });

    const result = await manager.run("backfill");

    expect(realExecute).not.toHaveBeenCalled();
    expect(result.applied).toBe(false);
    expect(result.writes).toBe(1);
    expect(result.samples).toEqual([{ raw: "r", readable: "r" }]);
  });

  it("run(name, { apply: true }) does invoke real writes", async () => {
    const realExecute = vi.fn().mockResolvedValue({ item: { id: "1" } });
    const writeBuilder = { execute: realExecute, debug: vi.fn() };
    const repos = { users: { create: vi.fn().mockReturnValue(writeBuilder) } };

    const manager = new MigrationManager({ repos, migrationRepo: makeMigrationRepo() });
    manager.createMigration("backfill", async ({ repos: r }) => {
      await r.users.create({ id: "1" }).execute();
    });

    const result = await manager.run("backfill", { apply: true });

    expect(realExecute).toHaveBeenCalledOnce();
    expect(writeBuilder.debug).not.toHaveBeenCalled();
    expect(result.applied).toBe(true);
    expect(result.samples).toBeUndefined();
  });

  it("reports scanned/writes counts matching a scripted migration", async () => {
    async function* items() {
      yield { id: "1" };
      yield { id: "2" };
    }
    const writeBuilder = { execute: vi.fn(), debug: vi.fn().mockReturnValue({ raw: "r", readable: "r" }) };
    const repos = { things: { update: vi.fn().mockReturnValue(writeBuilder) } };

    // A fake query builder that yields two items via a single page, for cursor() to drive.
    const fakeBuilder = {
      clone(): unknown {
        return fakeBuilder;
      },
      limit(): unknown {
        return fakeBuilder;
      },
      getLimit: () => undefined,
      startFrom(): unknown {
        return fakeBuilder;
      },
      execute: async () =>
        Object.assign(items(), { getContinuationKey: () => undefined, getLastEvaluatedKey: () => undefined }),
      findOne: async () => undefined,
    };

    const manager = new MigrationManager({ repos, migrationRepo: makeMigrationRepo() });
    manager.createMigration("backfill", async ({ repos: r, cursor }) => {
      for await (const item of cursor(fakeBuilder as never)) {
        void item;
      }
      await r.things.update({}, {}).execute();
    });

    const result = await manager.run("backfill");

    expect(result.scanned).toBe(2);
    expect(result.writes).toBe(1);
  });

  it("wraps and intercepts writes across multiple distinct repos in the same migration", async () => {
    const userWrite = { execute: vi.fn(), debug: vi.fn().mockReturnValue({ raw: "u", readable: "u" }) };
    const orderWrite = { execute: vi.fn(), debug: vi.fn().mockReturnValue({ raw: "o", readable: "o" }) };
    const repos = {
      users: { create: vi.fn().mockReturnValue(userWrite) },
      orders: { update: vi.fn().mockReturnValue(orderWrite) },
    };

    const manager = new MigrationManager({ repos, migrationRepo: makeMigrationRepo() });
    manager.createMigration("cross-repo", async ({ repos: r }) => {
      const user = await r.users.create({ id: "1" }).execute();
      await r.orders.update({ id: "1" }, { ownerName: user }).execute();
    });

    const dryRun = await manager.run("cross-repo");

    // Both repos' writes were intercepted for the dry run — neither real execute() fired.
    expect(userWrite.execute).not.toHaveBeenCalled();
    expect(orderWrite.execute).not.toHaveBeenCalled();
    expect(userWrite.debug).toHaveBeenCalledOnce();
    expect(orderWrite.debug).toHaveBeenCalledOnce();
    expect(dryRun.writes).toBe(2);
    expect(dryRun.samples).toEqual([
      { raw: "u", readable: "u" },
      { raw: "o", readable: "o" },
    ]);

    const applied = await manager.run("cross-repo", { apply: true });

    // Same migration, apply mode: both repos' real writes now fire.
    expect(userWrite.execute).toHaveBeenCalledOnce();
    expect(orderWrite.execute).toHaveBeenCalledOnce();
    expect(applied.writes).toBe(2);
  });

  it("throws immediately if the migration is already marked running, without calling the migration function", async () => {
    const migrationRepo = makeMigrationRepo();
    (migrationRepo.get as ReturnType<typeof vi.fn>).mockReturnValue({
      execute: vi.fn().mockResolvedValue({ item: { name: "backfill", version: 1, status: "running", cursors: {} } }),
    });
    const fn = vi.fn().mockResolvedValue(undefined);
    const manager = new MigrationManager({ repos: {}, migrationRepo });
    manager.createMigration("backfill", fn);

    await expect(manager.run("backfill", { apply: true })).rejects.toThrow(/already running/);
    expect(fn).not.toHaveBeenCalled();
  });

  it("does not check or acquire the lock for a dry run", async () => {
    const migrationRepo = makeMigrationRepo();
    (migrationRepo.get as ReturnType<typeof vi.fn>).mockReturnValue({
      execute: vi.fn().mockResolvedValue({ item: { name: "backfill", version: 1, status: "running", cursors: {} } }),
    });
    const fn = vi.fn().mockResolvedValue(undefined);
    const manager = new MigrationManager({ repos: {}, migrationRepo });
    manager.createMigration("backfill", fn);

    const result = await manager.run("backfill");

    expect(result.applied).toBe(false);
    expect(fn).toHaveBeenCalledOnce();
    expect(migrationRepo.update).not.toHaveBeenCalled();
  });

  it("marks the checkpoint status success and clears any stale error on a clean completion", async () => {
    const migrationRepo = makeMigrationRepo();
    const manager = new MigrationManager({ repos: {}, migrationRepo });
    manager.createMigration("backfill", async () => {});

    await manager.run("backfill", { apply: true });

    const updateCalls = (migrationRepo.update as ReturnType<typeof vi.fn>).mock.calls;
    const [lastKey, lastData] = updateCalls.at(-1) ?? [];
    expect(lastKey).toEqual({ name: "backfill" });
    expect(lastData).toEqual({ status: "success" });
  });

  it("marks the checkpoint status error with the exception message when the migration throws", async () => {
    const migrationRepo = makeMigrationRepo();
    const manager = new MigrationManager({ repos: {}, migrationRepo });
    manager.createMigration("backfill", async () => {
      throw new Error("boom");
    });

    await expect(manager.run("backfill", { apply: true })).rejects.toThrow("boom");

    const updateCalls = (migrationRepo.update as ReturnType<typeof vi.fn>).mock.calls;
    const [, lastData] = updateCalls.at(-1) ?? [];
    expect(lastData).toEqual({ status: "error", error: "boom" });
  });

  it("preserves the migration error if its failed checkpoint cannot be written", async () => {
    const migrationRepo = makeMigrationRepo();
    const originalError = new Error("migration failed");
    const checkpointError = new Error("checkpoint write failed");
    const execute = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(checkpointError);
    (migrationRepo.update as ReturnType<typeof vi.fn>).mockReturnValue({
      add: vi.fn().mockReturnThis(),
      remove: vi.fn().mockReturnThis(),
      condition: vi.fn().mockReturnThis(),
      execute,
    });
    const manager = new MigrationManager({ repos: {}, migrationRepo });
    manager.createMigration("backfill", async () => {
      throw originalError;
    });

    await expect(manager.run("backfill", { apply: true })).rejects.toMatchObject({
      message: expect.stringContaining("checkpoint write failed"),
      cause: originalError,
    });
  });

  describe("runAll()", () => {
    it("runs migrations in registration order by default", async () => {
      const order: string[] = [];
      const manager = new MigrationManager({ repos: {}, migrationRepo: makeMigrationRepo() });
      manager.createMigration("b", async () => {
        order.push("b");
      });
      manager.createMigration("a", async () => {
        order.push("a");
      });
      manager.createMigration("c", async () => {
        order.push("c");
      });

      await manager.runAll();

      expect(order).toEqual(["b", "a", "c"]);
    });

    it("honors an explicit order override across registration order", async () => {
      const order: string[] = [];
      const manager = new MigrationManager({ repos: {}, migrationRepo: makeMigrationRepo() });
      manager.createMigration(
        "second",
        async () => {
          order.push("second");
        },
        { order: 2 },
      );
      manager.createMigration(
        "first",
        async () => {
          order.push("first");
        },
        { order: 1 },
      );
      manager.createMigration(
        "third",
        async () => {
          order.push("third");
        },
        { order: 3 },
      );

      await manager.runAll();

      expect(order).toEqual(["first", "second", "third"]);
    });

    it("skips migrations whose checkpoint status is already success", async () => {
      const migrationRepo = makeStatefulMigrationRepo({ a: "success" });
      const fnA = vi.fn().mockResolvedValue(undefined);
      const fnB = vi.fn().mockResolvedValue(undefined);
      const manager = new MigrationManager({ repos: {}, migrationRepo });
      manager.createMigration("a", fnA);
      manager.createMigration("b", fnB);

      const results = await manager.runAll();

      expect(fnA).not.toHaveBeenCalled();
      expect(fnB).toHaveBeenCalledOnce();
      expect(results.map((r) => r.name)).toEqual(["b"]);
    });

    it("retries a migration whose checkpoint status is error", async () => {
      const migrationRepo = makeStatefulMigrationRepo({ a: "error" });
      const fnA = vi.fn().mockResolvedValue(undefined);
      const manager = new MigrationManager({ repos: {}, migrationRepo });
      manager.createMigration("a", fnA);

      const results = await manager.runAll();

      expect(fnA).toHaveBeenCalledOnce();
      expect(results.map((r) => r.name)).toEqual(["a"]);
    });

    it("throws immediately and runs nothing if any registered migration is already marked running", async () => {
      const migrationRepo = makeStatefulMigrationRepo({ b: "running" });
      const fnA = vi.fn().mockResolvedValue(undefined);
      const fnB = vi.fn().mockResolvedValue(undefined);
      const fnC = vi.fn().mockResolvedValue(undefined);
      const manager = new MigrationManager({ repos: {}, migrationRepo });
      manager.createMigration("a", fnA);
      manager.createMigration("b", fnB);
      manager.createMigration("c", fnC);

      await expect(manager.runAll({ apply: true })).rejects.toThrow(/"b" is already running/);
      expect(fnA).not.toHaveBeenCalled();
      expect(fnB).not.toHaveBeenCalled();
      expect(fnC).not.toHaveBeenCalled();
    });

    it("stops at the first migration that throws, without running the rest", async () => {
      const order: string[] = [];
      const manager = new MigrationManager({ repos: {}, migrationRepo: makeMigrationRepo() });
      manager.createMigration("a", async () => {
        order.push("a");
      });
      manager.createMigration("b", async () => {
        order.push("b");
        throw new Error("boom");
      });
      manager.createMigration("c", async () => {
        order.push("c");
      });

      await expect(manager.runAll()).rejects.toThrow("boom");
      expect(order).toEqual(["a", "b"]);
    });
  });
});
