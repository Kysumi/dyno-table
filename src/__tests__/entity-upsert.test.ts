import type { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createIndex, defineEntity } from "../entity/entity";
import type { StandardSchemaV1 } from "../standard-schema";
import { Table } from "../table";
import type { DynamoItem } from "../types";

interface Item extends DynamoItem {
  id: string;
  name: string;
  profile: { city: string };
}
const schema: StandardSchemaV1<Item> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (input) => {
      const item = input as Item;
      return item.name.length ? { value: item } : { issues: [{ message: "name is required" }] };
    },
  },
};
const client = { put: vi.fn(), get: vi.fn(), update: vi.fn(), delete: vi.fn() };
const table = new Table({
  client: client as unknown as DynamoDBDocument,
  tableName: "test",
  indexes: { partitionKey: "pk", gsis: { byCity: { partitionKey: "gsiPk" } } },
});
const entity = defineEntity({
  name: "User",
  schema,
  primaryKey: createIndex()
    .input(schema)
    .partitionKey((item) => `USER#${item.id}`)
    .withoutSortKey(),
  indexes: {
    byCity: createIndex()
      .input(schema)
      .partitionKey((item) => item.profile.city)
      .withoutSortKey(),
  },
  queries: {},
});
const repo = entity.createRepository(table);
const data: Item = { id: "1", name: "Original", profile: { city: "Wellington" } };

beforeEach(() => {
  vi.resetAllMocks();
  client.put.mockResolvedValue({});
  client.get.mockResolvedValue({});
});

describe("entity put uses the table contract", () => {
  it("returns nothing by default, just like table.put", async () => {
    await expect(repo.upsert(data).execute()).resolves.toBeUndefined();
    expect(client.put).toHaveBeenCalledTimes(1);
  });

  it("returns the prepared input only when requested", async () => {
    await expect(repo.upsert(data).returnValues("INPUT").execute()).resolves.toMatchObject({
      ...data,
      pk: "USER#1",
      gsiPk: "Wellington",
      entityType: "User",
    });
  });

  it("preserves old values and execution metadata", async () => {
    const old = { ...data, name: "Old" };
    const capacity = { TableName: "test", CapacityUnits: 1 };
    client.put.mockResolvedValue({ Attributes: old, ConsumedCapacity: capacity });
    await expect(
      repo.upsert(data).returnValues("ALL_OLD").returnConsumedCapacity("TOTAL").executeWithMetadata(),
    ).resolves.toEqual({ item: old, consumedCapacity: capacity });
    expect(client.put.mock.calls[0]?.[0].ReturnValues).toBe("ALL_OLD");
  });

  it("returns the consistent read from the table executor", async () => {
    const persisted = { ...data, name: "Persisted" };
    client.get.mockResolvedValue({ Item: persisted });
    await expect(repo.upsert(data).returnValues("CONSISTENT").execute()).resolves.toEqual(persisted);
    expect(client.get.mock.calls[0]?.[0].ConsistentRead).toBe(true);
  });

  it("validates fluent overrides before writing", async () => {
    await expect(repo.upsert(data).set("name", "").execute()).rejects.toThrow();
    expect(client.put).not.toHaveBeenCalled();
  });

  it("prepares keys from final nested input without mutating the original", async () => {
    const builder = repo.upsert(data).set("id", "2").set("profile.city", "Auckland").set({ pk: "wrong" });
    expect(builder.debug().raw.item).toMatchObject({ pk: "USER#2", gsiPk: "Auckland" });
    await expect(builder.returnValues("INPUT").execute()).resolves.toMatchObject({
      id: "2",
      profile: { city: "Auckland" },
      pk: "USER#2",
      gsiPk: "Auckland",
    });
    expect(data.profile.city).toBe("Wellington");
  });

  it("uses schema input setters and derives keys from transformed output", async () => {
    const transformed: StandardSchemaV1<{ rawId: string }, { id: string }> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (input) => ({ value: { id: (input as { rawId: string }).rawId.toUpperCase() } }),
      },
    };
    const keySchema: StandardSchemaV1<{ id: string }> = {
      "~standard": { version: 1, vendor: "test", validate: (input) => ({ value: input as { id: string } }) },
    };
    const transformedRepo = defineEntity({
      name: "Transformed",
      schema: transformed,
      primaryKey: createIndex()
        .input(keySchema)
        .partitionKey((item) => item.id)
        .withoutSortKey(),
      queries: {},
    }).createRepository(table);
    const builder = transformedRepo.upsert({ rawId: "a" }).set("rawId", "b");
    await expect(builder.returnValues("INPUT").execute()).resolves.toMatchObject({ id: "B", pk: "B" });
    expectTypeOf<Parameters<typeof transformedRepo.upsert>[0]>().toEqualTypeOf<{ rawId: string }>();
  });

  it("prepares and validates the same item for transactions and batches", () => {
    const transaction = table.transactionBuilder();
    const tx = vi.spyOn(transaction, "putWithCommand");
    const builder = repo.upsert(data).set("profile.city", "Auckland");
    expect(builder.withTransaction(transaction)).toBe(builder);
    expect(tx.mock.calls[0]?.[0].item).toMatchObject({ gsiPk: "Auckland" });
    const batch = table.batchBuilder();
    const write = vi.spyOn(batch, "putWithCommand");
    builder.withBatch(batch);
    expect(write.mock.calls[0]?.[0].item).toMatchObject({ gsiPk: "Auckland" });
    expect(() => repo.upsert(data).set("name", "").withTransaction(transaction)).toThrow();
  });
});
