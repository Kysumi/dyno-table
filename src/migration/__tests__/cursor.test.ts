import { describe, expect, it, vi } from "vitest";
import type { QueryBuilderInterface } from "../../builders/builder-types";
import type { DynamoItem } from "../../types";
import { makeCursor } from "../cursor";
import type { MigrationCheckpointRecord, MigrationCheckpointRepo, RunContext } from "../types";

function makeCtx(apply: boolean): RunContext {
  return { apply, writes: 0, scanned: 0, samples: [] };
}

function conditionalCheckFailedError() {
  const err = new Error("conditional check failed");
  err.name = "ConditionalCheckFailedException";
  return err;
}

type Page = { items: DynamoItem[]; lastEvaluatedKey?: Record<string, unknown> };

function makeQueryBuilder(pages: Page[]) {
  let index = 0;
  const startFrom = vi.fn();
  const builder = {
    startFrom: (key: Record<string, unknown>) => {
      startFrom(key);
      return builder;
    },
    clone: () => builder,
    limit: () => builder,
    getLimit: () => undefined,
    execute: async () => {
      const page = pages[index++] ?? { items: [] };
      async function* gen() {
        for (const item of page.items) yield item;
      }
      return Object.assign(gen(), {
        getContinuationKey: () => page.lastEvaluatedKey,
        getLastEvaluatedKey: () => page.lastEvaluatedKey,
      });
    },
    findOne: async () => undefined,
  } as unknown as QueryBuilderInterface<DynamoItem>;
  return { builder, startFrom };
}

/** Bare-bones fake MigrationCheckpointRepo — each test configures get/create/update directly. */
function makeMigrationRepo(): MigrationCheckpointRepo {
  return {
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  } as unknown as MigrationCheckpointRepo;
}

async function drain<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iterable) out.push(item);
  return out;
}

describe("makeCursor", () => {
  it("dry run: never touches migrationRepo, still yields all pages", async () => {
    const repo = makeMigrationRepo();
    const ctx = makeCtx(false);
    const cursor = makeCursor(ctx, repo, "my-migration");
    const { builder } = makeQueryBuilder([
      { items: [{ id: "1" }], lastEvaluatedKey: { pk: "1" } },
      { items: [{ id: "2" }] },
    ]);

    const items = await drain(cursor(builder));

    expect(items).toEqual([{ id: "1" }, { id: "2" }]);
    expect(repo.get).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
    expect(ctx.scanned).toBe(2);
  });

  it("apply run, no prior checkpoint: creates the record, never resumes via startFrom, checkpoints completion", async () => {
    const repo = makeMigrationRepo();
    (repo.create as ReturnType<typeof vi.fn>).mockReturnValue({ execute: vi.fn().mockResolvedValue(undefined) });
    (repo.get as ReturnType<typeof vi.fn>).mockReturnValue({ execute: vi.fn().mockResolvedValue({ item: undefined }) });
    const updateChain = {
      add: vi.fn().mockReturnThis(),
      condition: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    };
    (repo.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain);

    const ctx = makeCtx(true);
    const cursor = makeCursor(ctx, repo, "my-migration");
    // Single page with no lastEvaluatedKey — no continuation, so Paginator itself never calls startFrom either.
    const { builder, startFrom } = makeQueryBuilder([{ items: [{ id: "1" }] }]);

    await drain(cursor(builder));

    expect(repo.create).toHaveBeenCalledOnce();
    expect(startFrom).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledOnce();
    expect(repo.update).toHaveBeenCalledWith({ name: "my-migration" }, { cursors: {} });
  });

  it("checkpoints each page's lastEvaluatedKey after its items are consumed", async () => {
    const repo = makeMigrationRepo();
    (repo.create as ReturnType<typeof vi.fn>).mockReturnValue({ execute: vi.fn().mockResolvedValue(undefined) });
    (repo.get as ReturnType<typeof vi.fn>).mockReturnValue({ execute: vi.fn().mockResolvedValue({ item: undefined }) });
    const updateCalls: unknown[] = [];
    const updateChain = {
      add: vi.fn().mockReturnThis(),
      condition: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    };
    (repo.update as ReturnType<typeof vi.fn>).mockImplementation((_key, data) => {
      updateCalls.push(data);
      return updateChain;
    });

    const ctx = makeCtx(true);
    const cursor = makeCursor(ctx, repo, "my-migration");
    const { builder } = makeQueryBuilder([
      { items: [{ id: "1" }], lastEvaluatedKey: { pk: "1" } },
      { items: [{ id: "2" }] },
    ]);

    await drain(cursor(builder));

    expect(updateCalls[0]).toEqual({ cursors: { default: { lastEvaluatedKey: { pk: "1" } } } });
    expect(updateCalls.at(-1)).toEqual({ cursors: {} });
  });

  it("swallows a conditional-check failure from create (record already exists)", async () => {
    const repo = makeMigrationRepo();
    (repo.create as ReturnType<typeof vi.fn>).mockReturnValue({
      execute: vi.fn().mockRejectedValue(conditionalCheckFailedError()),
    });
    (repo.get as ReturnType<typeof vi.fn>).mockReturnValue({ execute: vi.fn().mockResolvedValue({ item: undefined }) });
    const updateChain = {
      add: vi.fn().mockReturnThis(),
      condition: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    };
    (repo.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain);

    const ctx = makeCtx(true);
    const cursor = makeCursor(ctx, repo, "my-migration");
    const { builder } = makeQueryBuilder([{ items: [] }]);

    await expect(drain(cursor(builder))).resolves.toEqual([]);
  });

  it("apply run, prior checkpoint present: resumes via startFrom before the first page fetch", async () => {
    const repo = makeMigrationRepo();
    (repo.create as ReturnType<typeof vi.fn>).mockReturnValue({ execute: vi.fn().mockResolvedValue(undefined) });
    const savedRecord: MigrationCheckpointRecord = {
      name: "my-migration",
      version: 3,
      cursors: { default: { lastEvaluatedKey: { pk: "resume" } } },
    };
    (repo.get as ReturnType<typeof vi.fn>).mockReturnValue({
      execute: vi.fn().mockResolvedValue({ item: savedRecord }),
    });
    const updateChain = {
      add: vi.fn().mockReturnThis(),
      condition: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    };
    (repo.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain);

    const ctx = makeCtx(true);
    const cursor = makeCursor(ctx, repo, "my-migration");
    const { builder, startFrom } = makeQueryBuilder([{ items: [] }]);

    await drain(cursor(builder));

    expect(startFrom).toHaveBeenCalledWith({ pk: "resume" });
  });

  it("does not checkpoint a page when its consumer fails partway through", async () => {
    const repo = makeMigrationRepo();
    (repo.create as ReturnType<typeof vi.fn>).mockReturnValue({ execute: vi.fn().mockResolvedValue(undefined) });
    (repo.get as ReturnType<typeof vi.fn>).mockReturnValue({ execute: vi.fn().mockResolvedValue({ item: undefined }) });
    const updateChain = {
      add: vi.fn().mockReturnThis(),
      condition: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    };
    (repo.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain);

    const ctx = makeCtx(true);
    const cursor = makeCursor(ctx, repo, "my-migration");
    const { builder } = makeQueryBuilder([{ items: [{ id: "1" }, { id: "2" }], lastEvaluatedKey: { pk: "2" } }]);

    await expect(
      (async () => {
        for await (const item of cursor(builder)) {
          if (item.id === "1") throw new Error("consumer failed");
        }
      })(),
    ).rejects.toThrow("consumer failed");

    expect(repo.update).not.toHaveBeenCalled();
    expect(ctx.scanned).toBe(1);
  });

  it("retries the checkpoint write on a version conflict, reloading the fresh version", async () => {
    const repo = makeMigrationRepo();
    (repo.create as ReturnType<typeof vi.fn>).mockReturnValue({ execute: vi.fn().mockResolvedValue(undefined) });
    // Reload #1 (the cursor's own resume-check, before any pagination): no record yet.
    // Reload #2 (page-LEK attempt 1): still no record, version 0.
    // Reload #3 (page-LEK attempt 2, after conflict): version bumped to 7 by the "other writer".
    // Reload #4 (trailing completion write, since the page carries a lastEvaluatedKey so the
    // paginator fetches one more empty page before finishing): whatever version, irrelevant here.
    (repo.get as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ execute: vi.fn().mockResolvedValue({ item: undefined }) })
      .mockReturnValueOnce({ execute: vi.fn().mockResolvedValue({ item: undefined }) })
      .mockReturnValueOnce({ execute: vi.fn().mockResolvedValue({ item: { name: "m", version: 7, cursors: {} } }) })
      .mockReturnValue({ execute: vi.fn().mockResolvedValue({ item: { name: "m", version: 8, cursors: {} } }) });

    const conditions: Array<(op: { eq: (path: string, value: unknown) => unknown }) => unknown> = [];
    let updateAttempt = 0;
    (repo.update as ReturnType<typeof vi.fn>).mockImplementation(() => {
      updateAttempt += 1;
      const isFirstAttempt = updateAttempt === 1;
      const chain = {
        add: vi.fn().mockReturnThis(),
        condition: vi.fn((fn) => {
          conditions.push(fn);
          return chain;
        }),
        execute: isFirstAttempt
          ? vi.fn().mockRejectedValue(conditionalCheckFailedError())
          : vi.fn().mockResolvedValue(undefined),
      };
      return chain;
    });

    const ctx = makeCtx(true);
    const cursor = makeCursor(ctx, repo, "my-migration");
    const { builder } = makeQueryBuilder([{ items: [], lastEvaluatedKey: { pk: "1" } }]);

    await drain(cursor(builder));

    // First two update() calls are the page-LEK checkpoint (fail, then retry-succeed);
    // the third is the unrelated trailing completion write.
    expect(updateAttempt).toBe(3);
    const fakeOp = { eq: vi.fn((path: string, value: unknown) => ({ path, value })) };
    conditions[0]?.(fakeOp);
    expect(fakeOp.eq).toHaveBeenLastCalledWith("version", 0);
    conditions[1]?.(fakeOp);
    expect(fakeOp.eq).toHaveBeenLastCalledWith("version", 7);
  });

  it("gives up after MAX_CHECKPOINT_RETRIES conditional-check failures", async () => {
    const repo = makeMigrationRepo();
    (repo.create as ReturnType<typeof vi.fn>).mockReturnValue({ execute: vi.fn().mockResolvedValue(undefined) });
    (repo.get as ReturnType<typeof vi.fn>).mockReturnValue({ execute: vi.fn().mockResolvedValue({ item: undefined }) });
    const updateChain = {
      add: vi.fn().mockReturnThis(),
      condition: vi.fn().mockReturnThis(),
      execute: vi.fn().mockRejectedValue(conditionalCheckFailedError()),
    };
    (repo.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain);

    const ctx = makeCtx(true);
    const cursor = makeCursor(ctx, repo, "my-migration");
    const { builder } = makeQueryBuilder([{ items: [], lastEvaluatedKey: { pk: "1" } }]);

    await expect(drain(cursor(builder))).rejects.toThrow();
  });

  it("two cursor() calls with distinct ids keep separate cursors entries", async () => {
    const repo = makeMigrationRepo();
    (repo.create as ReturnType<typeof vi.fn>).mockReturnValue({ execute: vi.fn().mockResolvedValue(undefined) });
    (repo.get as ReturnType<typeof vi.fn>).mockReturnValue({ execute: vi.fn().mockResolvedValue({ item: undefined }) });
    const updateCalls: unknown[] = [];
    const updateChain = {
      add: vi.fn().mockReturnThis(),
      condition: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    };
    (repo.update as ReturnType<typeof vi.fn>).mockImplementation((_key, data) => {
      updateCalls.push(data);
      return updateChain;
    });

    const ctx = makeCtx(true);
    const cursor = makeCursor(ctx, repo, "my-migration");
    const a = makeQueryBuilder([{ items: [], lastEvaluatedKey: { pk: "a" } }]);
    const b = makeQueryBuilder([{ items: [], lastEvaluatedKey: { pk: "b" } }]);

    await drain(cursor(a.builder, { id: "a" }));
    await drain(cursor(b.builder, { id: "b" }));

    expect(updateCalls).toContainEqual({ cursors: { a: { lastEvaluatedKey: { pk: "a" } } } });
    expect(updateCalls).toContainEqual({ cursors: { b: { lastEvaluatedKey: { pk: "b" } } } });
  });

  it("throws immediately for a second cursor() call sharing an id, before any pagination", () => {
    const repo = makeMigrationRepo();
    const ctx = makeCtx(true);
    const cursor = makeCursor(ctx, repo, "my-migration");
    const { builder } = makeQueryBuilder([{ items: [] }]);

    cursor(builder);
    expect(() => cursor(builder)).toThrow(/cursor\(\) called twice/);
    expect(() => cursor(builder, { id: "default" })).toThrow(/cursor\(\) called twice/);
  });

  it("on completion removes only its own cursors[id] entry, leaving siblings intact", async () => {
    const repo = makeMigrationRepo();
    (repo.create as ReturnType<typeof vi.fn>).mockReturnValue({ execute: vi.fn().mockResolvedValue(undefined) });
    const existing: MigrationCheckpointRecord = {
      name: "my-migration",
      version: 1,
      cursors: { sibling: { lastEvaluatedKey: { pk: "keep-me" } }, mine: { lastEvaluatedKey: { pk: "done" } } },
    };
    (repo.get as ReturnType<typeof vi.fn>).mockReturnValue({ execute: vi.fn().mockResolvedValue({ item: existing }) });
    const updateCalls: unknown[] = [];
    const updateChain = {
      add: vi.fn().mockReturnThis(),
      condition: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    };
    (repo.update as ReturnType<typeof vi.fn>).mockImplementation((_key, data) => {
      updateCalls.push(data);
      return updateChain;
    });

    const ctx = makeCtx(true);
    const cursor = makeCursor(ctx, repo, "my-migration");
    const { builder } = makeQueryBuilder([{ items: [] }]);

    await drain(cursor(builder, { id: "mine" }));

    expect(updateCalls).toContainEqual({
      cursors: { sibling: { lastEvaluatedKey: { pk: "keep-me" } } },
    });
  });
});
