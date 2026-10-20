import type { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it, vi } from "vitest";
import { eq } from "../conditions";
import { createIndex, defineEntity } from "../entity/entity";
import type { StandardSchemaV1 } from "../standard-schema";
import { Table } from "../table";
import type { DynamoItem } from "../types";
import { setItemValues } from "../utils/item-values";

interface Item extends DynamoItem {
  id: string;
  status?: string;
  count?: number;
}
const schema: StandardSchemaV1<Item> = {
  "~standard": { version: 1, vendor: "test", validate: (input) => ({ value: input as Item }) },
};
function setup(indexes = false) {
  const client = { put: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) };
  const table = new Table({
    client: client as unknown as DynamoDBDocument,
    tableName: "test",
    indexes: { partitionKey: "pk", gsis: { status: { partitionKey: "statusPk" } } },
  });
  const repo = defineEntity({
    name: "User",
    schema,
    primaryKey: createIndex()
      .input(schema)
      .partitionKey((item) => item.id)
      .withoutSortKey(),
    indexes: indexes
      ? {
          status: createIndex()
            .input(schema)
            .partitionKey((item) => `STATUS#${item.status}`)
            .withoutSortKey(),
        }
      : {},
    settings: {
      timestamps: {
        createdAt: { attributeName: "created", format: "UNIX" },
        updatedAt: { attributeName: "modified", format: "UNIX" },
      },
    },
    queries: {},
  }).createRepository(table);
  return { table, repo, client };
}

describe("entity adapters preserve table behavior", () => {
  it("uses the last fluent SET for both data and indexes, even after inspection", async () => {
    const { repo, client } = setup(true);
    const builder = repo.update({ id: "1" }, { status: "old" }).set("status", "active");
    expect(builder.debug().readable.updateExpression).toContain('statusPk = "STATUS#active"');
    builder.set({ status: "inactive" });
    expect(builder.debug().readable.updateExpression).toContain('statusPk = "STATUS#inactive"');
    await builder.execute();
    expect(Object.values(client.update.mock.calls[0]?.[0].ExpressionAttributeValues)).toContain("STATUS#inactive");
    expect(Object.values(client.update.mock.calls[0]?.[0].ExpressionAttributeValues)).not.toContain("old");
  });

  it("rebuilds indexes when a reused builder returns to its original value", () => {
    const { repo } = setup(true);
    const builder = repo.update({ id: "1", status: "original" }, { status: "changed" });
    expect(builder.debug().readable.updateExpression).toContain('statusPk = "STATUS#changed"');
    builder.set("status", "original");
    expect(builder.debug().readable.updateExpression).toContain('statusPk = "STATUS#original"');
  });

  it("does not retain an initial indexed SET after an atomic mutation replaces it", () => {
    const { repo } = setup(true);
    const expression = repo.update({ id: "1" }, { status: "active" }).remove("status").debug()
      .readable.updateExpression;
    expect(expression).toContain("REMOVE status");
    expect(expression).not.toContain("STATUS#active");
  });

  it("allows the table builder to resolve SET followed by REMOVE or ADD", () => {
    const { repo } = setup();
    const builder = repo.update({ id: "1" }, { status: "old", count: 5 }).remove("status").add("count", 2);
    const first = builder.debug().readable.updateExpression;
    expect(first).toContain("REMOVE status");
    expect(first).toContain("ADD count 2");
    expect(first).not.toContain('status = "old"');
    expect(builder.debug().readable.updateExpression).toBe(first);
  });

  it("preserves entity guards when caller conditions are added", () => {
    const { repo } = setup();
    for (const builder of [repo.update({ id: "1" }, { status: "active" }), repo.delete({ id: "1" })]) {
      const condition = builder.condition(eq("status", "pending")).debug().readable.conditionExpression;
      expect(condition).toContain('entityType = "User"');
      expect(condition).toContain('status = "pending"');
      expect(condition).toContain("AND");
    }
  });

  it("preserves table.create's insert-only guard through entity and table chaining", () => {
    const { repo, table } = setup();
    for (const builder of [repo.create({ id: "1" }), table.create({ pk: "1", status: "pending" })]) {
      const condition = builder.condition(eq("status", "pending")).debug().readable.conditionExpression;
      expect(condition).toContain("attribute_not_exists(pk)");
      expect(condition).toContain('status = "pending"');
    }
  });

  it("preserves configured timestamp names and zero values", async () => {
    const { repo } = setup();
    await expect(
      repo.upsert({ id: "1", created: 0, modified: 0 }).returnValues("INPUT").execute(),
    ).resolves.toMatchObject({ created: 0, modified: 0 });
    expect(repo.update({ id: "1" }, {}).set("modified", 0).debug().readable.updateExpression).toContain("modified = 0");
  });

  it("rejects conditional batches instead of silently dropping guards", () => {
    const { repo, table } = setup();
    const batch = table.batchBuilder();
    expect(() => repo.create({ id: "1" }).withBatch(batch)).toThrow("conditions");
    expect(() => repo.delete({ id: "1" }).withBatch(batch)).toThrow("conditions");
    expect(() => table.put({ pk: "1" }).condition(eq("status", "pending")).withBatch(batch)).toThrow("conditions");
    expect(() => repo.upsert({ id: "1" }).withBatch(batch)).not.toThrow();
  });

  it("shares safe nested put setters with the table", () => {
    const { table } = setup();
    const item = { pk: "1", profile: { city: "Wellington" }, list: [{ name: "old" }] };
    const builder = table
      .put(item)
      .set("profile.city", "Auckland")
      .set({ list: [{ name: "new" }] });
    expect(builder.debug().raw.item).toMatchObject({ profile: { city: "Auckland" }, list: [{ name: "new" }] });
    expect(item.profile.city).toBe("Wellington");
    expect(setItemValues(item, "list.0.name", "new").list).toEqual([{ name: "new" }]);
    const unsafe = setItemValues({ pk: "1" }, "__proto__.polluted", true);
    expect(Object.getPrototypeOf(unsafe)).toBe(Object.prototype);
    expect({}).not.toHaveProperty("polluted");
  });
});
