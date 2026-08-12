import { beforeEach, describe, expect, it, vi } from "vitest";
import { BatchBuilder } from "../batch-builder";
import { GetBuilder } from "../get-builder";

describe("GetBuilder", () => {
  const mockExecutor = vi.fn();

  beforeEach(() => {
    mockExecutor.mockClear();
    mockExecutor.mockResolvedValue({ item: undefined });
  });

  it("should omit index attributes by default", async () => {
    mockExecutor.mockResolvedValueOnce({
      item: { id: "dino-1", name: "Rex", gsi1pk: "STATUS#active", gsi1sk: "TYPE#raptor" },
    });

    const builder = new GetBuilder(mockExecutor, { pk: "dino-1", sk: "PROFILE" }, "Dinosaurs", ["gsi1pk", "gsi1sk"]);

    const result = await builder.execute();

    expect(result.item).toEqual({ id: "dino-1", name: "Rex" });
  });

  it("should include index attributes when includeIndexes is used", async () => {
    mockExecutor.mockResolvedValueOnce({
      item: { id: "dino-1", name: "Rex", gsi1pk: "STATUS#active", gsi1sk: "TYPE#raptor" },
    });

    const builder = new GetBuilder(mockExecutor, { pk: "dino-1", sk: "PROFILE" }, "Dinosaurs", [
      "gsi1pk",
      "gsi1sk",
    ]).includeIndexes();

    const result = await builder.execute();

    expect(result.item).toEqual({
      id: "dino-1",
      name: "Rex",
      gsi1pk: "STATUS#active",
      gsi1sk: "TYPE#raptor",
    });
  });

  it("validates deferred gets before executing a batch", async () => {
    const batchGetExecutor = vi.fn().mockResolvedValue({ items: [], unprocessedKeys: [] });
    const batch = new BatchBuilder(vi.fn().mockResolvedValue({ unprocessedItems: [] }), batchGetExecutor, {
      partitionKey: "pk",
      sortKey: "sk",
    });
    const beforeExecute = vi.fn().mockRejectedValue(new Error("invalid query input"));
    const builder = new GetBuilder(mockExecutor, { pk: "dino-1", sk: "PROFILE" }, "Dinosaurs", [], {
      beforeExecute,
    });

    builder.withBatch(batch);

    await expect(batch.execute()).rejects.toThrow("invalid query input");
    expect(beforeExecute).toHaveBeenCalledOnce();
    expect(batchGetExecutor).not.toHaveBeenCalled();
  });
});
