import type { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCodes } from "../errors";
import { Table } from "../table";

const batchGet = vi.fn();
const batchWrite = vi.fn();
const table = new Table({
  client: { batchGet, batchWrite } as unknown as DynamoDBDocument,
  tableName: "Dinosaurs",
  indexes: { partitionKey: "pk", sortKey: "sk" },
});

const key = (id: number) => ({ pk: `dinosaur#${id}`, sk: "profile" });

beforeEach(() => {
  batchGet.mockReset();
  batchWrite.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Table batch operations", () => {
  it("preserves projection and consistency while hiding correlation keys", async () => {
    batchGet.mockResolvedValue({
      Responses: { Dinosaurs: [{ ...key(1), name: "Rex" }] },
      UnprocessedKeys: {},
    });
    const batch = table.batchBuilder<{ Dinosaur: { name: string } }>();

    table
      .get<{ pk: string; sk: string; name: string }>(key(1))
      .select("name")
      .consistentRead()
      .withBatch(batch, "Dinosaur");
    const result = await batch.execute();

    expect(batchGet).toHaveBeenCalledWith(
      {
        RequestItems: {
          Dinosaurs: {
            Keys: [key(1)],
            ProjectionExpression: "#0, #1, #2",
            ExpressionAttributeNames: { "#0": "name", "#1": "pk", "#2": "sk" },
            ConsistentRead: true,
          },
        },
      },
      { abortSignal: undefined },
    );
    expect(result.reads.items).toEqual([{ name: "Rex" }]);
    expect(result.reads.itemsByType.Dinosaur).toEqual([{ name: "Rex" }]);
  });

  it("preserves explicitly selected correlation keys", async () => {
    batchGet.mockResolvedValue({
      Responses: { Dinosaurs: [{ ...key(1), name: "Rex" }] },
      UnprocessedKeys: {},
    });
    const batch = table.batchBuilder();

    table.get<{ pk: string; sk: string; name: string }>(key(1)).select(["name", "pk"]).withBatch(batch);
    const result = await batch.execute();

    expect(result.reads.items).toEqual([{ pk: key(1).pk, name: "Rex" }]);
  });

  it("groups identical normalized get options", async () => {
    batchGet.mockResolvedValue({ Responses: { Dinosaurs: [] }, UnprocessedKeys: {} });
    const batch = table.batchBuilder();

    table.get<{ name: string; age: number }>(key(1)).select(["name", "age"]).withBatch(batch);
    table.get<{ name: string; age: number }>(key(2)).select(["age", "name"]).consistentRead(false).withBatch(batch);
    await batch.execute();

    expect(batchGet).toHaveBeenCalledOnce();
    expect(batchGet.mock.calls[0]?.[0].RequestItems.Dinosaurs).toMatchObject({
      Keys: [key(1), key(2)],
    });
    expect(batchGet.mock.calls[0]?.[0].RequestItems.Dinosaurs).not.toHaveProperty("ConsistentRead");
  });

  it("separates conflicting projections and consistency settings", async () => {
    batchGet.mockResolvedValue({ Responses: { Dinosaurs: [] }, UnprocessedKeys: {} });
    const batch = table.batchBuilder();

    table.get<{ name: string }>(key(1)).select("name").withBatch(batch);
    table.get<{ age: number }>(key(2)).select("age").withBatch(batch);
    table.get<{ name: string }>(key(3)).select("name").consistentRead().withBatch(batch);
    await batch.execute();

    expect(batchGet).toHaveBeenCalledTimes(3);
    expect(batchGet.mock.calls.map(([request]) => request.RequestItems.Dinosaurs)).toEqual([
      expect.objectContaining({
        Keys: [key(1)],
        ExpressionAttributeNames: { "#0": "name", "#1": "pk", "#2": "sk" },
      }),
      expect.objectContaining({
        Keys: [key(2)],
        ExpressionAttributeNames: { "#0": "age", "#1": "pk", "#2": "sk" },
      }),
      expect.objectContaining({
        Keys: [key(3)],
        ExpressionAttributeNames: { "#0": "name", "#1": "pk", "#2": "sk" },
        ConsistentRead: true,
      }),
    ]);
  });

  it("retries only unprocessed get keys and aggregates every response", async () => {
    batchGet
      .mockResolvedValueOnce({
        Responses: { Dinosaurs: [{ ...key(1), name: "Rex" }] },
        UnprocessedKeys: { Dinosaurs: { Keys: [key(2)] } },
      })
      .mockResolvedValueOnce({
        Responses: { Dinosaurs: [{ ...key(2), name: "Blue" }] },
        UnprocessedKeys: {},
      });

    const result = await table.batchGet([key(1), key(2)], { baseDelayMs: 0 });

    expect(batchGet).toHaveBeenCalledTimes(2);
    expect(batchGet.mock.calls[1]?.[0].RequestItems.Dinosaurs.Keys).toEqual([key(2)]);
    expect(result).toEqual({
      items: [
        { ...key(1), name: "Rex" },
        { ...key(2), name: "Blue" },
      ],
      unprocessedKeys: [],
    });
  });

  it("retries only unprocessed writes", async () => {
    const item = { ...key(1), name: "Rex" };
    const unprocessedRequest = { PutRequest: { Item: item } };
    batchWrite
      .mockResolvedValueOnce({ UnprocessedItems: { Dinosaurs: [unprocessedRequest] } })
      .mockResolvedValueOnce({ UnprocessedItems: {} });

    const result = await table.batchWrite([{ type: "put", item }], { baseDelayMs: 0 });

    expect(batchWrite).toHaveBeenCalledTimes(2);
    expect(batchWrite.mock.calls[1]?.[0].RequestItems.Dinosaurs).toEqual([unprocessedRequest]);
    expect(result).toEqual({ unprocessedItems: [] });
  });

  it("returns only the final remainder after retry exhaustion", async () => {
    batchGet.mockResolvedValue({
      Responses: { Dinosaurs: [] },
      UnprocessedKeys: { Dinosaurs: { Keys: [key(1)] } },
    });
    const batch = table.batchBuilder();
    table.get(key(1)).withBatch(batch);

    const result = await batch.execute({ maxAttempts: 2, baseDelayMs: 0 });

    expect(batchGet).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(false);
    expect(result.reads.unprocessed).toEqual([key(1)]);
  });

  it("reports builder success after an automatic retry succeeds", async () => {
    batchGet
      .mockResolvedValueOnce({
        Responses: { Dinosaurs: [] },
        UnprocessedKeys: { Dinosaurs: { Keys: [key(1)] } },
      })
      .mockResolvedValueOnce({ Responses: { Dinosaurs: [{ ...key(1), name: "Rex" }] }, UnprocessedKeys: {} });
    const batch = table.batchBuilder();
    table.get(key(1)).withBatch(batch);

    const result = await batch.execute({ baseDelayMs: 0 });

    expect(result.success).toBe(true);
    expect(result.reads.unprocessed).toEqual([]);
  });

  it("supports the former single-request behavior with maxAttempts 1", async () => {
    batchGet.mockResolvedValue({
      Responses: { Dinosaurs: [] },
      UnprocessedKeys: { Dinosaurs: { Keys: [key(1)] } },
    });

    const result = await table.batchGet([key(1)], { maxAttempts: 1 });

    expect(batchGet).toHaveBeenCalledOnce();
    expect(result.unprocessedKeys).toEqual([key(1)]);
  });

  it.each([
    [{ maxAttempts: 0 }, ErrorCodes.INVALID_MAX_ATTEMPTS],
    [{ maxAttempts: 1.5 }, ErrorCodes.INVALID_MAX_ATTEMPTS],
    [{ baseDelayMs: -1 }, ErrorCodes.INVALID_BASE_DELAY_MS],
    [{ baseDelayMs: Number.POSITIVE_INFINITY }, ErrorCodes.INVALID_BASE_DELAY_MS],
  ] as const)("rejects invalid retry option %j before either batch API sends", async (options, code) => {
    await expect(table.batchGet([key(1)], options)).rejects.toMatchObject({ code });
    await expect(table.batchWrite([{ type: "delete", key: key(1) }], options)).rejects.toMatchObject({ code });
    expect(batchGet).not.toHaveBeenCalled();
    expect(batchWrite).not.toHaveBeenCalled();
  });

  it("makes no request when already aborted", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled");
    controller.abort(reason);

    await expect(table.batchGet([key(1)], { abortSignal: controller.signal })).rejects.toBe(reason);
    expect(batchGet).not.toHaveBeenCalled();
  });

  it("aborts during backoff without sending another request", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const reason = new Error("cancelled during backoff");
    batchGet.mockResolvedValue({
      Responses: { Dinosaurs: [] },
      UnprocessedKeys: { Dinosaurs: { Keys: [key(1)] } },
    });

    const promise = table.batchGet([key(1)], { baseDelayMs: 100, abortSignal: controller.signal });
    await vi.waitFor(() => expect(batchGet).toHaveBeenCalledOnce());
    controller.abort(reason);

    await expect(promise).rejects.toBe(reason);
    expect(batchGet).toHaveBeenCalledOnce();
  });

  it("does not start gets when aborted after the write phase", async () => {
    const controller = new AbortController();
    const reason = new Error("stop between phases");
    batchWrite.mockImplementationOnce(async () => {
      controller.abort(reason);
      return { UnprocessedItems: {} };
    });
    const batch = table.batchBuilder();
    table.put({ ...key(1), name: "Rex" }).withBatch(batch);
    table.get(key(1)).withBatch(batch);

    await expect(batch.execute({ abortSignal: controller.signal })).rejects.toBe(reason);
    expect(batchWrite).toHaveBeenCalledOnce();
    expect(batchGet).not.toHaveBeenCalled();
  });

  it("rejects a mid-request abort instead of returning a partial builder result", async () => {
    const controller = new AbortController();
    const reason = new Error("cancel in flight");
    batchGet.mockImplementationOnce(async () => {
      controller.abort(reason);
      throw reason;
    });
    const batch = table.batchBuilder();
    table.get(key(1)).withBatch(batch);

    await expect(batch.execute({ abortSignal: controller.signal })).rejects.toBe(reason);
    expect(batchGet).toHaveBeenCalledOnce();
  });

  it("passes the abort signal to every AWS request", async () => {
    const controller = new AbortController();
    batchGet.mockResolvedValue({ Responses: { Dinosaurs: [] }, UnprocessedKeys: {} });
    batchWrite.mockResolvedValue({ UnprocessedItems: {} });

    await table.batchGet([key(1)], { abortSignal: controller.signal });
    await table.batchWrite([{ type: "delete", key: key(1) }], { abortSignal: controller.signal });

    expect(batchGet).toHaveBeenCalledWith(expect.anything(), { abortSignal: controller.signal });
    expect(batchWrite).toHaveBeenCalledWith(expect.anything(), { abortSignal: controller.signal });
  });

  it("uses exponential full-jitter delay ceilings", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const timeout = vi.spyOn(globalThis, "setTimeout");
    batchGet
      .mockResolvedValueOnce({
        Responses: { Dinosaurs: [] },
        UnprocessedKeys: { Dinosaurs: { Keys: [key(1)] } },
      })
      .mockResolvedValueOnce({
        Responses: { Dinosaurs: [] },
        UnprocessedKeys: { Dinosaurs: { Keys: [key(1)] } },
      })
      .mockResolvedValueOnce({ Responses: { Dinosaurs: [] }, UnprocessedKeys: {} });

    const promise = table.batchGet([key(1)], { maxAttempts: 3, baseDelayMs: 20 });
    await vi.runAllTimersAsync();
    await promise;

    expect(timeout.mock.calls.map((call) => call[1])).toEqual([10, 20]);
  });

  it("keeps chunk boundaries and gives each chunk its own retry budget", async () => {
    const readKeys = Array.from({ length: 101 }, (_, index) => key(index));
    batchGet
      .mockResolvedValueOnce({
        Responses: { Dinosaurs: [] },
        UnprocessedKeys: { Dinosaurs: { Keys: [readKeys[0]] } },
      })
      .mockResolvedValueOnce({ Responses: { Dinosaurs: [] }, UnprocessedKeys: {} })
      .mockResolvedValueOnce({
        Responses: { Dinosaurs: [] },
        UnprocessedKeys: { Dinosaurs: { Keys: [readKeys[100]] } },
      })
      .mockResolvedValueOnce({ Responses: { Dinosaurs: [] }, UnprocessedKeys: {} });

    await table.batchGet(readKeys, { maxAttempts: 2, baseDelayMs: 0 });

    expect(batchGet.mock.calls.map(([request]) => request.RequestItems.Dinosaurs.Keys.length)).toEqual([100, 1, 1, 1]);

    const writes = Array.from({ length: 26 }, (_, index) => ({
      type: "put" as const,
      item: { ...key(index), name: `Dinosaur ${index}` },
    }));
    batchWrite
      .mockResolvedValueOnce({ UnprocessedItems: { Dinosaurs: [{ PutRequest: { Item: writes[0]?.item } }] } })
      .mockResolvedValueOnce({ UnprocessedItems: {} })
      .mockResolvedValueOnce({ UnprocessedItems: { Dinosaurs: [{ PutRequest: { Item: writes[25]?.item } }] } })
      .mockResolvedValueOnce({ UnprocessedItems: {} });

    await table.batchWrite(writes, { maxAttempts: 2, baseDelayMs: 0 });

    expect(batchWrite.mock.calls.map(([request]) => request.RequestItems.Dinosaurs.length)).toEqual([25, 1, 1, 1]);
  });
});
