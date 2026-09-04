import type { DynamoDBDocument, GetCommandOutput } from "@aws-sdk/lib-dynamodb";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createIndex, defineEntity } from "../entity/entity";
import type { RequestEvent, RequestResult, TablePlugin } from "../plugins";
import type { StandardSchemaV1 } from "../standard-schema";
import { Table } from "../table";
import type { DynamoItem, VectorIndexConfig } from "../types";

const get = vi.fn();
const put = vi.fn();
const query = vi.fn();
const scan = vi.fn();
const del = vi.fn();
const update = vi.fn();
const transactWrite = vi.fn();
const batchWrite = vi.fn();
const batchGet = vi.fn();
const searchVectors = vi.fn();

type MockedClient = Pick<
  DynamoDBDocument,
  "get" | "put" | "query" | "scan" | "delete" | "update" | "transactWrite" | "batchWrite" | "batchGet"
> & { searchVectors: typeof searchVectors };

const dynamoClient: MockedClient = {
  get,
  put,
  query,
  scan,
  delete: del,
  update,
  transactWrite,
  batchWrite,
  batchGet,
  searchVectors,
};

const vectorIndexes: Record<string, VectorIndexConfig> = {
  Embedding: {
    vectorAttribute: "embedding",
    dimensions: 3,
    distanceFunction: "COSINE",
    projection: { type: "ALL" },
  },
};

const onRequestStart = vi.fn();
const onRequestEnd = vi.fn();
const plugin: TablePlugin = { name: "test", onRequestStart, onRequestEnd };

const table = new Table({
  client: dynamoClient as unknown as DynamoDBDocument,
  tableName: "Dinosaurs",
  indexes: { partitionKey: "pk", sortKey: "sk", vectorIndexes },
  plugins: [plugin],
});

interface DinoInput extends DynamoItem {
  id: string;
  name: string;
}
interface Dino extends DinoInput {
  pk: string;
  sk: string;
  entityType: string;
}

const passthroughSchema = <Input, Output = Input>(): StandardSchemaV1<Input, Output> => ({
  "~standard": { version: 1, vendor: "test", validate: (value) => ({ value: value as Output }) },
});

const DinoEntity = defineEntity({
  name: "Dino",
  schema: passthroughSchema<DinoInput, Dino>(),
  primaryKey: createIndex()
    .input(passthroughSchema<{ id: string }>())
    .partitionKey((item: { id: string }) => `DINO#${item.id}`)
    .sortKey(() => "PROFILE"),
  queries: {},
});

const dinoRepo = DinoEntity.createRepository(table);

interface OtherInput extends DynamoItem {
  id: string;
  label: string;
}
interface Other extends OtherInput {
  pk: string;
  sk: string;
  entityType: string;
}

const OtherEntity = defineEntity({
  name: "Other",
  schema: passthroughSchema<OtherInput, Other>(),
  primaryKey: createIndex()
    .input(passthroughSchema<{ id: string }>())
    .partitionKey((item: { id: string }) => `OTHER#${item.id}`)
    .sortKey(() => "PROFILE"),
  queries: {},
});

beforeEach(() => {
  for (const mock of [get, put, query, scan, del, update, transactWrite, batchWrite, batchGet, searchVectors]) {
    mock.mockReset();
  }
  onRequestStart.mockReset();
  onRequestEnd.mockReset();
});

function expectHookFiredOnce(operation: string) {
  expect(onRequestStart).toHaveBeenCalledOnce();
  expect(onRequestStart.mock.calls[0]?.[0]).toMatchObject({ operation, tableName: "Dinosaurs" });
  expect(onRequestEnd).toHaveBeenCalledOnce();
  const endEvent = onRequestEnd.mock.calls[0]?.[0] as RequestResult;
  expect(endEvent).toMatchObject({ operation, tableName: "Dinosaurs" });
  expect(endEvent.durationMs).toBeGreaterThanOrEqual(0);
  return endEvent;
}

describe("request plugins", () => {
  it("fires start/end around a get", async () => {
    get.mockResolvedValue({ Item: { pk: "a", sk: "b" } });

    await table.get({ pk: "a", sk: "b" }).execute();

    const endEvent = expectHookFiredOnce("get");
    expect(endEvent.result).toEqual({ Item: { pk: "a", sk: "b" } });
    expect(endEvent.error).toBeUndefined();
  });

  it("fires start/end around a put", async () => {
    put.mockResolvedValue({});

    await table.put({ pk: "a", sk: "b" }).execute();

    expectHookFiredOnce("put");
  });

  it("fires start/end around a scan", async () => {
    scan.mockResolvedValue({ Items: [{ pk: "a", sk: "b" }] });

    await (await table.scan().execute()).toArray();

    expectHookFiredOnce("scan");
  });

  it("fires start/end around a delete", async () => {
    del.mockResolvedValue({ Attributes: { pk: "a", sk: "b" } });

    await table.delete({ pk: "a", sk: "b" }).execute();

    expectHookFiredOnce("delete");
  });

  it("fires start/end around an update", async () => {
    update.mockResolvedValue({ Attributes: { pk: "a", sk: "b" } });

    await table.update({ pk: "a", sk: "b" }).set("name", "Rex").execute();

    expectHookFiredOnce("update");
  });

  it("fires start/end around a transactWrite", async () => {
    transactWrite.mockResolvedValue({});

    await table.transactionBuilder().put("Dinosaurs", { pk: "a", sk: "b" }).execute();

    expectHookFiredOnce("transactWrite");
  });

  it("fires start/end around a searchVectors call", async () => {
    searchVectors.mockResolvedValue({ SearchResults: [] });

    await table.searchVectors("Embedding", { vector: [1, 2, 3], topK: 1 }).execute();

    expectHookFiredOnce("searchVectors");
  });

  it("reports the original error on end and still rejects", async () => {
    const failure = new Error("boom");
    get.mockRejectedValue(failure);

    await expect(table.get({ pk: "a", sk: "b" }).execute()).rejects.toMatchObject({ cause: failure });

    expect(onRequestEnd).toHaveBeenCalledOnce();
    const endEvent = onRequestEnd.mock.calls[0]?.[0] as RequestResult;
    expect(endEvent.error).toBe(failure);
    expect(endEvent.result).toBeUndefined();
  });

  it("fires one start/end pair per physical page of a paginated query", async () => {
    query
      .mockResolvedValueOnce({ Items: [{ pk: "a", sk: "1" }], LastEvaluatedKey: { pk: "a", sk: "1" } })
      .mockResolvedValueOnce({ Items: [{ pk: "a", sk: "2" }] });

    const items = await (await table.query({ pk: "a" }).execute()).toArray();

    expect(items).toHaveLength(2);
    expect(query).toHaveBeenCalledTimes(2);
    expect(onRequestStart).toHaveBeenCalledTimes(2);
    expect(onRequestEnd).toHaveBeenCalledTimes(2);
    expect(onRequestStart.mock.calls.every(([event]) => event.operation === "query")).toBe(true);
  });

  it("fires one event per 25-item batchWrite chunk", async () => {
    batchWrite.mockResolvedValue({ UnprocessedItems: {} });

    const operations = Array.from({ length: 30 }, (_, i) => ({
      type: "put" as const,
      item: { pk: `item#${i}`, sk: "profile" },
    }));
    await table.batchWrite(operations);

    expect(batchWrite).toHaveBeenCalledTimes(2);
    expect(onRequestStart).toHaveBeenCalledTimes(2);
    expect(onRequestEnd).toHaveBeenCalledTimes(2);
    expect(onRequestStart.mock.calls.every(([event]) => event.operation === "batchWrite")).toBe(true);
  });

  it("fires one event per 100-key batchGet chunk", async () => {
    batchGet.mockResolvedValue({ Responses: { Dinosaurs: [] }, UnprocessedKeys: {} });

    const keys = Array.from({ length: 150 }, (_, i) => ({ pk: `item#${i}`, sk: "profile" }));
    await table.batchGet(keys);

    expect(batchGet).toHaveBeenCalledTimes(2);
    expect(onRequestStart).toHaveBeenCalledTimes(2);
    expect(onRequestEnd).toHaveBeenCalledTimes(2);
    expect(onRequestStart.mock.calls.every(([event]) => event.operation === "batchGet")).toBe(true);
  });

  it("does not leak mutations of onRequestStart's params into the real request", async () => {
    get.mockResolvedValue({ Item: { pk: "a", sk: "b" } });
    onRequestStart.mockImplementation((event: RequestEvent) => {
      if (event.operation === "get" && event.params.Key) event.params.Key.pk = "mutated";
    });

    await table.get({ pk: "a", sk: "b" }).execute();

    expect(get).toHaveBeenCalledWith(expect.objectContaining({ Key: { pk: "a", sk: "b" } }));
  });

  it("does not leak Map mutations into the real request", async () => {
    const settings = new Map<string, unknown>([
      ["nested", { enabled: true }],
      ["keep", "value"],
    ]);
    put.mockResolvedValue({});
    onRequestStart.mockImplementation((event: RequestEvent) => {
      const observed = event.operation === "put" ? event.params.Item?.settings : undefined;
      if (!(observed instanceof Map)) return;
      (observed.get("nested") as { enabled: boolean }).enabled = false;
      observed.clear();
    });

    await table.put({ pk: "a", sk: "b", settings }).execute();

    expect(settings).toEqual(
      new Map<string, unknown>([
        ["nested", { enabled: true }],
        ["keep", "value"],
      ]),
    );
    expect(put).toHaveBeenCalledWith(expect.objectContaining({ Item: expect.objectContaining({ settings }) }));
  });

  it("does not leak mutations of onRequestEnd's result into the caller", async () => {
    get.mockResolvedValue({ Item: { pk: "a", sk: "b" } });
    onRequestEnd.mockImplementation((event: RequestResult) => {
      if (event.operation === "get" && event.result?.Item) event.result.Item.pk = "mutated";
    });

    await expect(table.get({ pk: "a", sk: "b" }).execute()).resolves.toEqual({
      item: { pk: "a", sk: "b" },
    });
  });

  it("preserves custom wrapped numbers in observer snapshots", async () => {
    class WrappedNumber {
      readonly format = () => this.value;

      constructor(readonly value: string) {}
    }

    const wrapped = new WrappedNumber("9007199254740993");
    get.mockResolvedValue({ Item: { pk: "a", sk: "b", amount: wrapped } });

    const result = await table.get<{ pk: string; sk: string; amount: WrappedNumber }>({ pk: "a", sk: "b" }).execute();

    const endEvent = onRequestEnd.mock.calls[0]?.[0] as RequestResult;
    const observed = endEvent.operation === "get" ? endEvent.result?.Item?.amount : undefined;
    expect(observed).toBe(wrapped);
    expect(observed).toBeInstanceOf(WrappedNumber);
    expect((observed as WrappedNumber).format()).toBe("9007199254740993");
    expect(result.item?.amount).toBe(wrapped);
  });

  it("does not instrument when no plugins are configured", async () => {
    const plainTable = new Table({
      client: dynamoClient as unknown as DynamoDBDocument,
      tableName: "Dinosaurs",
      indexes: { partitionKey: "pk", sortKey: "sk" },
    });
    get.mockResolvedValue({ Item: { pk: "a", sk: "b" } });

    await expect(plainTable.get({ pk: "a", sk: "b" }).execute()).resolves.toBeDefined();
    expect(onRequestStart).not.toHaveBeenCalled();
    expect(onRequestEnd).not.toHaveBeenCalled();
  });

  it("fires every plugin in the list for the same request", async () => {
    const second = { onRequestStart: vi.fn(), onRequestEnd: vi.fn() };
    const multiPluginTable = new Table({
      client: dynamoClient as unknown as DynamoDBDocument,
      tableName: "Dinosaurs",
      indexes: { partitionKey: "pk", sortKey: "sk" },
      plugins: [plugin, second],
    });
    get.mockResolvedValue({ Item: { pk: "a", sk: "b" } });

    await multiPluginTable.get({ pk: "a", sk: "b" }).execute();

    expect(onRequestStart).toHaveBeenCalledOnce();
    expect(second.onRequestStart).toHaveBeenCalledOnce();
    expect(second.onRequestEnd).toHaveBeenCalledOnce();
  });

  it("accepts an incidental end-hook return value", async () => {
    const events: RequestResult[] = [];
    const incidentalPlugin: TablePlugin = { onRequestEnd: (event) => events.push(event) };
    const incidentalTable = new Table({
      client: dynamoClient as unknown as DynamoDBDocument,
      tableName: "Dinosaurs",
      indexes: { partitionKey: "pk", sortKey: "sk" },
      plugins: [incidentalPlugin],
    });
    get.mockResolvedValue({ Item: { pk: "a", sk: "b" } });

    await incidentalTable.get({ pk: "a", sk: "b" }).execute();

    expect(events).toHaveLength(1);
  });

  it("awaits start before the request and end before settling", async () => {
    let releaseStart = () => {};
    let releaseEnd = () => {};
    const startGate = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });
    const endGate = new Promise<void>((resolve) => {
      releaseEnd = resolve;
    });
    const asyncPlugin: TablePlugin = {
      async onRequestStart() {
        await startGate;
      },
      async onRequestEnd() {
        await endGate;
      },
    };
    const asyncTable = new Table({
      client: dynamoClient as unknown as DynamoDBDocument,
      tableName: "Dinosaurs",
      indexes: { partitionKey: "pk", sortKey: "sk" },
      plugins: [asyncPlugin],
    });
    get.mockResolvedValue({ Item: { pk: "a", sk: "b" } });

    let settled = false;
    const request = asyncTable
      .get({ pk: "a", sk: "b" })
      .execute()
      .then((value) => {
        settled = true;
        return value;
      });

    await Promise.resolve();
    expect(get).not.toHaveBeenCalled();
    releaseStart();
    await vi.waitFor(() => expect(get).toHaveBeenCalledOnce());
    expect(settled).toBe(false);
    releaseEnd();
    await expect(request).resolves.toEqual({ item: { pk: "a", sk: "b" } });
  });

  it("pairs each plugin's state with the same concurrent request", async () => {
    const ended: string[] = [];
    const plugins = ["first", "second"].map(
      (name): TablePlugin<string> => ({
        async onRequestStart(event) {
          await Promise.resolve();
          if (event.operation === "get") return `${name}:${event.params.Key?.pk}`;
        },
        onRequestEnd(event, state) {
          if (event.operation === "get") ended.push(`${event.params.Key?.pk}:${state}`);
        },
      }),
    );
    const concurrentTable = new Table({
      client: dynamoClient as unknown as DynamoDBDocument,
      tableName: "Dinosaurs",
      indexes: { partitionKey: "pk", sortKey: "sk" },
      plugins,
    });
    get.mockImplementation(async ({ Key }) => ({ Item: Key }));

    await Promise.all([
      concurrentTable.get({ pk: "a", sk: "1" }).execute(),
      concurrentTable.get({ pk: "b", sk: "2" }).execute(),
    ]);

    expect(ended.sort()).toEqual(["a:first:a", "a:second:a", "b:first:b", "b:second:b"]);
  });

  it("discriminates operation-matched success and failure results", async () => {
    const events: RequestResult[] = [];
    const resultPlugin: TablePlugin = {
      onRequestEnd(event) {
        events.push(event);
        if (event.operation !== "get") return;

        if (event.result) {
          expectTypeOf(event.result).toEqualTypeOf<GetCommandOutput>();
          expect(event.error).toBeUndefined();
        } else {
          expectTypeOf(event.error).toEqualTypeOf<unknown>();
          expect(event.result).toBeUndefined();
        }
      },
    };
    const resultTable = new Table({
      client: dynamoClient as unknown as DynamoDBDocument,
      tableName: "Dinosaurs",
      indexes: { partitionKey: "pk", sortKey: "sk" },
      plugins: [resultPlugin],
    });
    const failure = new Error("database failed");
    get.mockResolvedValueOnce({ Item: { pk: "a", sk: "b" } }).mockRejectedValueOnce(failure);

    await resultTable.get({ pk: "a", sk: "b" }).execute();
    await expect(resultTable.get({ pk: "c", sk: "d" }).execute()).rejects.toMatchObject({ cause: failure });

    expect(events[0]).toMatchObject({ result: { Item: { pk: "a", sk: "b" } } });
    expect(events[0]).not.toHaveProperty("error");
    expect(events[1]).toMatchObject({ error: failure });
    expect(events[1]).not.toHaveProperty("result");
  });

  it("does not call DynamoDB when a start hook fails", async () => {
    const failure = new Error("start failed");
    const failingTable = new Table({
      client: dynamoClient as unknown as DynamoDBDocument,
      tableName: "Dinosaurs",
      indexes: { partitionKey: "pk", sortKey: "sk" },
      plugins: [{ onRequestStart: () => Promise.reject(failure) }],
    });

    await expect(failingTable.get({ pk: "a", sk: "b" }).execute()).rejects.toMatchObject({ cause: failure });
    expect(get).not.toHaveBeenCalled();
  });

  it("unwinds completed plugins when a later start hook fails", async () => {
    const startFailure = new Error("start failed");
    const cleanupFailure = new Error("cleanup failed");
    const span = { end: vi.fn() };
    const first: TablePlugin<typeof span> = {
      onRequestStart: () => span,
      onRequestEnd(event, state) {
        expect(event.error).toBe(startFailure);
        expect(state).toBe(span);
        state?.end();
        throw cleanupFailure;
      },
    };
    const secondEnd = vi.fn();
    const thirdStart = vi.fn();
    const thirdEnd = vi.fn();
    const failingTable = new Table({
      client: dynamoClient as unknown as DynamoDBDocument,
      tableName: "Dinosaurs",
      indexes: { partitionKey: "pk", sortKey: "sk" },
      plugins: [
        first,
        { onRequestStart: () => Promise.reject(startFailure), onRequestEnd: secondEnd },
        { onRequestStart: thirdStart, onRequestEnd: thirdEnd },
      ],
    });

    await expect(failingTable.get({ pk: "a", sk: "b" }).execute()).rejects.toMatchObject({ cause: startFailure });
    expect(span.end).toHaveBeenCalledOnce();
    expect(secondEnd).not.toHaveBeenCalled();
    expect(thirdStart).not.toHaveBeenCalled();
    expect(thirdEnd).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it("reports an end-hook failure after a successful request", async () => {
    const firstFailure = new Error("first end failed");
    const laterFailure = new Error("later end failed");
    const laterEnd = vi.fn(() => Promise.reject(laterFailure));
    const failingTable = new Table({
      client: dynamoClient as unknown as DynamoDBDocument,
      tableName: "Dinosaurs",
      indexes: { partitionKey: "pk", sortKey: "sk" },
      plugins: [{ onRequestEnd: () => Promise.reject(firstFailure) }, { onRequestEnd: laterEnd }],
    });
    get.mockResolvedValue({ Item: { pk: "a", sk: "b" } });

    await expect(failingTable.get({ pk: "a", sk: "b" }).execute()).rejects.toMatchObject({ cause: firstFailure });
    expect(laterEnd).toHaveBeenCalledOnce();
  });

  it("keeps the DynamoDB failure when an end hook also fails", async () => {
    const databaseFailure = new Error("database failed");
    const hookFailure = new Error("end failed");
    const failingTable = new Table({
      client: dynamoClient as unknown as DynamoDBDocument,
      tableName: "Dinosaurs",
      indexes: { partitionKey: "pk", sortKey: "sk" },
      plugins: [{ onRequestEnd: () => Promise.reject(hookFailure) }],
    });
    get.mockRejectedValue(databaseFailure);

    await expect(failingTable.get({ pk: "a", sk: "b" }).execute()).rejects.toMatchObject({
      cause: databaseFailure,
    });
  });

  it("leaves entityName undefined for calls made directly against Table", async () => {
    get.mockResolvedValue({ Item: { pk: "a", sk: "b" } });

    await table.get({ pk: "a", sk: "b" }).execute();

    expect(onRequestStart.mock.calls[0]?.[0].entityNames).toEqual([]);
  });

  describe("entity-originated requests", () => {
    it("tags a repository get with its entity name", async () => {
      get.mockResolvedValue({ Item: { pk: "DINO#1", sk: "PROFILE" } });

      await dinoRepo.get({ id: "1" }).execute();

      expect(onRequestStart.mock.calls[0]?.[0]).toMatchObject({ operation: "get", entityNames: ["Dino"] });
    });

    it("tags a repository create (put) with its entity name", async () => {
      put.mockResolvedValue({});

      await dinoRepo.create({ id: "1", name: "Rex" }).execute();

      expect(onRequestStart.mock.calls[0]?.[0]).toMatchObject({ operation: "put", entityNames: ["Dino"] });
    });

    it("tags a repository update with its entity name", async () => {
      update.mockResolvedValue({ Attributes: {} });

      await dinoRepo.update({ id: "1" }, { name: "Rex" }).execute();

      expect(onRequestStart.mock.calls[0]?.[0]).toMatchObject({ operation: "update", entityNames: ["Dino"] });
    });

    it("tags a repository delete with its entity name", async () => {
      del.mockResolvedValue({ Attributes: {} });

      await dinoRepo.delete({ id: "1" }).execute();

      expect(onRequestStart.mock.calls[0]?.[0]).toMatchObject({ operation: "delete", entityNames: ["Dino"] });
    });

    it("tags a repository scan with its entity name", async () => {
      scan.mockResolvedValue({ Items: [] });

      await (await dinoRepo.scan().execute()).toArray();

      expect(onRequestStart.mock.calls[0]?.[0]).toMatchObject({ operation: "scan", entityNames: ["Dino"] });
    });

    it("attributes a transaction touching multiple entities to all of them", async () => {
      transactWrite.mockResolvedValue({});

      const tx = table.transactionBuilder();
      dinoRepo.create({ id: "1", name: "Rex" }).withTransaction(tx);
      const otherRepo = OtherEntity.createRepository(table);
      otherRepo.create({ id: "2", label: "nest" }).withTransaction(tx);
      await tx.execute();

      expect(onRequestStart.mock.calls[0]?.[0]).toMatchObject({
        operation: "transactWrite",
        entityNames: ["Dino", "Other"],
      });
    });

    it("attributes a batch write touching multiple entities to all of them", async () => {
      batchWrite.mockResolvedValue({ UnprocessedItems: {} });

      const batch = table.batchBuilder();
      dinoRepo.create({ id: "1", name: "Rex" }).withBatch(batch);
      const otherRepo = OtherEntity.createRepository(table);
      otherRepo.create({ id: "2", label: "nest" }).withBatch(batch);
      await batch.execute();

      expect(onRequestStart.mock.calls[0]?.[0]).toMatchObject({
        operation: "batchWrite",
        entityNames: ["Dino", "Other"],
      });
    });

    it("attributes each batch write retry from its remaining operations", async () => {
      batchWrite
        .mockResolvedValueOnce({
          UnprocessedItems: {
            Dinosaurs: [
              {
                PutRequest: {
                  Item: { id: "2", label: "nest", pk: "OTHER#2", sk: "PROFILE", entityType: "Other" },
                },
              },
            ],
          },
        })
        .mockResolvedValueOnce({ UnprocessedItems: {} });

      const batch = table.batchBuilder();
      dinoRepo.create({ id: "1", name: "Rex" }).withBatch(batch);
      OtherEntity.createRepository(table).create({ id: "2", label: "nest" }).withBatch(batch);
      await batch.execute({ baseDelayMs: 0 });

      expect(onRequestStart.mock.calls.map(([event]) => event.entityNames)).toEqual([["Dino", "Other"], ["Other"]]);
    });

    it("attributes each batch get retry from its remaining keys", async () => {
      batchGet
        .mockResolvedValueOnce({
          Responses: { Dinosaurs: [] },
          UnprocessedKeys: { Dinosaurs: { Keys: [{ pk: "OTHER#2", sk: "PROFILE" }] } },
        })
        .mockResolvedValueOnce({ Responses: { Dinosaurs: [] }, UnprocessedKeys: {} });

      const batch = table.batchBuilder();
      dinoRepo.get({ id: "1" }).withBatch(batch);
      OtherEntity.createRepository(table).get({ id: "2" }).withBatch(batch);
      await batch.execute({ baseDelayMs: 0 });

      expect(onRequestStart.mock.calls.map(([event]) => event.entityNames)).toEqual([["Dino", "Other"], ["Other"]]);
    });
  });
});
