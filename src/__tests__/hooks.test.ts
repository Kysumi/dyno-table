import type { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createIndex, defineEntity } from "../entity/entity";
import type { RequestHookEvent, RequestHookResult, TableHooks } from "../hooks";
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
const hooks: TableHooks = { onRequestStart, onRequestEnd };

const table = new Table({
  client: dynamoClient as unknown as DynamoDBDocument,
  tableName: "Dinosaurs",
  indexes: { partitionKey: "pk", sortKey: "sk", vectorIndexes },
  hooks,
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
  const endEvent = onRequestEnd.mock.calls[0]?.[0] as RequestHookResult;
  expect(endEvent).toMatchObject({ operation, tableName: "Dinosaurs" });
  expect(endEvent.durationMs).toBeGreaterThanOrEqual(0);
  return endEvent;
}

describe("request hooks", () => {
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

    await expect(table.get({ pk: "a", sk: "b" }).execute()).rejects.toThrow();

    expect(onRequestEnd).toHaveBeenCalledOnce();
    const endEvent = onRequestEnd.mock.calls[0]?.[0] as RequestHookResult;
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
    onRequestStart.mockImplementation((event: RequestHookEvent) => {
      (event.params as Record<string, unknown>).ConsistentRead = true;
    });

    await table.get({ pk: "a", sk: "b" }).execute();

    expect(get).toHaveBeenCalledWith(expect.objectContaining({ ConsistentRead: undefined }));
  });

  it("does not instrument when no hooks are configured", async () => {
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
  });
});
