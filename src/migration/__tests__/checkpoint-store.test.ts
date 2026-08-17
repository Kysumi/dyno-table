import { describe, expect, it, vi } from "vitest";
import { ensureCheckpointRecordExists, patchCheckpoint } from "../checkpoint-store";
import type { MigrationCheckpointRepo } from "../types";

function conditionalCheckFailedError() {
  const err = new Error("conditional check failed");
  err.name = "ConditionalCheckFailedException";
  return err;
}

function otherError() {
  return new Error("ProvisionedThroughputExceededException: rate exceeded");
}

function makeMigrationRepo(): MigrationCheckpointRepo {
  return {
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  } as unknown as MigrationCheckpointRepo;
}

describe("ensureCheckpointRecordExists", () => {
  it("creates the record when none exists", async () => {
    const repo = makeMigrationRepo();
    (repo.create as ReturnType<typeof vi.fn>).mockReturnValue({ execute: vi.fn().mockResolvedValue(undefined) });

    await ensureCheckpointRecordExists(repo, "my-migration");

    expect(repo.create).toHaveBeenCalledWith({ name: "my-migration", version: 0, cursors: {} });
  });

  it("swallows a conditional-check failure (record already exists)", async () => {
    const repo = makeMigrationRepo();
    (repo.create as ReturnType<typeof vi.fn>).mockReturnValue({
      execute: vi.fn().mockRejectedValue(conditionalCheckFailedError()),
    });

    await expect(ensureCheckpointRecordExists(repo, "my-migration")).resolves.toBeUndefined();
  });

  it("propagates a non-conditional failure instead of swallowing it", async () => {
    const repo = makeMigrationRepo();
    (repo.create as ReturnType<typeof vi.fn>).mockReturnValue({
      execute: vi.fn().mockRejectedValue(otherError()),
    });

    await expect(ensureCheckpointRecordExists(repo, "my-migration")).rejects.toThrow(
      /ProvisionedThroughputExceededException/,
    );
  });
});

describe("patchCheckpoint", () => {
  it("applies the computed patch, adding a version bump, on the first attempt", async () => {
    const repo = makeMigrationRepo();
    (repo.get as ReturnType<typeof vi.fn>).mockReturnValue({
      execute: vi.fn().mockResolvedValue({ item: { name: "m", version: 4, cursors: {} } }),
    });
    const chain = {
      add: vi.fn().mockReturnThis(),
      remove: vi.fn().mockReturnThis(),
      condition: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    };
    (repo.update as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    await patchCheckpoint(repo, "m", () => ({ status: "success" }));

    expect(repo.update).toHaveBeenCalledWith({ name: "m" }, { status: "success" });
    expect(chain.add).toHaveBeenCalledWith("version", 1);
    expect(chain.remove).not.toHaveBeenCalled();
    const conditionFn = chain.condition.mock.calls[0]?.[0];
    const fakeOp = { eq: vi.fn() };
    conditionFn(fakeOp);
    expect(fakeOp.eq).toHaveBeenCalledWith("version", 4);
  });

  it("routes an undefined-valued field to .remove() instead of writing it literally", async () => {
    const repo = makeMigrationRepo();
    (repo.get as ReturnType<typeof vi.fn>).mockReturnValue({
      execute: vi.fn().mockResolvedValue({ item: { name: "m", version: 0, cursors: {} } }),
    });
    const chain = {
      add: vi.fn().mockReturnThis(),
      remove: vi.fn().mockReturnThis(),
      condition: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    };
    (repo.update as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    await patchCheckpoint(repo, "m", () => ({ status: "success", error: undefined }));

    expect(repo.update).toHaveBeenCalledWith({ name: "m" }, { status: "success" });
    expect(chain.remove).toHaveBeenCalledWith("error");
  });

  it("rejects removal of fields outside the checkpoint repo contract", async () => {
    const repo = makeMigrationRepo();
    (repo.get as ReturnType<typeof vi.fn>).mockReturnValue({
      execute: vi.fn().mockResolvedValue({ item: { name: "m", version: 0, cursors: {} } }),
    });

    await expect(patchCheckpoint(repo, "m", () => ({ status: undefined }))).rejects.toThrow(
      'Checkpoint field "status" cannot be removed',
    );
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("propagates a computePatch throw immediately, without reading or writing again", async () => {
    const repo = makeMigrationRepo();
    (repo.get as ReturnType<typeof vi.fn>).mockReturnValue({
      execute: vi.fn().mockResolvedValue({ item: { name: "m", version: 0, status: "running", cursors: {} } }),
    });

    await expect(
      patchCheckpoint(repo, "m", (record) => {
        if (record?.status === "running") throw new Error("already running");
        return {};
      }),
    ).rejects.toThrow("already running");

    expect(repo.get).toHaveBeenCalledOnce();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("retries once on a version conflict and succeeds with the reloaded version", async () => {
    const repo = makeMigrationRepo();
    (repo.get as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({ execute: vi.fn().mockResolvedValue({ item: { name: "m", version: 0, cursors: {} } }) })
      .mockReturnValue({ execute: vi.fn().mockResolvedValue({ item: { name: "m", version: 1, cursors: {} } }) });
    let attempt = 0;
    (repo.update as ReturnType<typeof vi.fn>).mockImplementation(() => {
      attempt += 1;
      const isFirst = attempt === 1;
      return {
        add: vi.fn().mockReturnThis(),
        remove: vi.fn().mockReturnThis(),
        condition: vi.fn().mockReturnThis(),
        execute: isFirst
          ? vi.fn().mockRejectedValue(conditionalCheckFailedError())
          : vi.fn().mockResolvedValue(undefined),
      };
    });

    await patchCheckpoint(repo, "m", () => ({ status: "success" }));

    expect(attempt).toBe(2);
    expect(repo.get).toHaveBeenCalledTimes(2);
  });

  it("gives up and rethrows after MAX_CHECKPOINT_RETRIES consecutive version conflicts", async () => {
    const repo = makeMigrationRepo();
    (repo.get as ReturnType<typeof vi.fn>).mockReturnValue({
      execute: vi.fn().mockResolvedValue({ item: { name: "m", version: 0, cursors: {} } }),
    });
    (repo.update as ReturnType<typeof vi.fn>).mockReturnValue({
      add: vi.fn().mockReturnThis(),
      remove: vi.fn().mockReturnThis(),
      condition: vi.fn().mockReturnThis(),
      execute: vi.fn().mockRejectedValue(conditionalCheckFailedError()),
    });

    await expect(patchCheckpoint(repo, "m", () => ({ status: "success" }))).rejects.toThrow(
      /ConditionalCheckFailedException|conditional check failed/,
    );

    expect(repo.get).toHaveBeenCalledTimes(6);
    expect(repo.update).toHaveBeenCalledTimes(6);
  });

  it("propagates a non-conditional update failure immediately, without retrying", async () => {
    const repo = makeMigrationRepo();
    (repo.get as ReturnType<typeof vi.fn>).mockReturnValue({
      execute: vi.fn().mockResolvedValue({ item: { name: "m", version: 0, cursors: {} } }),
    });
    (repo.update as ReturnType<typeof vi.fn>).mockReturnValue({
      add: vi.fn().mockReturnThis(),
      remove: vi.fn().mockReturnThis(),
      condition: vi.fn().mockReturnThis(),
      execute: vi.fn().mockRejectedValue(otherError()),
    });

    await expect(patchCheckpoint(repo, "m", () => ({ status: "success" }))).rejects.toThrow(
      /ProvisionedThroughputExceededException/,
    );

    expect(repo.get).toHaveBeenCalledOnce();
    expect(repo.update).toHaveBeenCalledOnce();
  });
});
