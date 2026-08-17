import { beforeAll, describe, expect, it } from "vitest";
import type { Table } from "../table";
import { createTestTable, type Dinosaur } from "./table-test-setup";

async function seedDinosaurs(table: Table, count: number): Promise<Dinosaur[]> {
  const dinosaurs = Array.from(
    { length: count },
    (_, id): Dinosaur => ({
      demoPartitionKey: `parallel#${id}`,
      demoSortKey: "dinosaur",
      name: `Dinosaur ${id}`,
      type: id % 2 === 0 ? "Even" : "Odd",
    }),
  );
  await Promise.all(dinosaurs.map((dinosaur) => table.put(dinosaur).execute()));
  return dinosaurs;
}

describe("parallel scan integration", () => {
  let table: Table;

  beforeAll(() => {
    table = createTestTable();
  });

  it("returns the same complete table as a plain scan", async () => {
    await seedDinosaurs(table, 40);

    const parallel = await table.scan<Dinosaur>().segments(4).toArray();
    const plain = await (await table.scan<Dinosaur>().execute()).toArray();

    expect(parallel).toHaveLength(plain.length);
    expect(parallel.map(({ demoPartitionKey }) => demoPartitionKey).sort()).toEqual(
      plain.map(({ demoPartitionKey }) => demoPartitionKey).sort(),
    );
  });

  it("applies filters and a global limit across all segments", async () => {
    await seedDinosaurs(table, 40);

    const items = await table
      .scan<Dinosaur>()
      .filter((op) => op.eq("type", "Even"))
      .limit(7)
      .segments(4)
      .toArray();

    expect(items).toHaveLength(7);
    expect(items.every(({ type }) => type === "Even")).toBe(true);
    expect(new Set(items.map(({ demoPartitionKey }) => demoPartitionKey))).toHaveLength(7);
  });

  it("returns complete, non-overlapping logical pages", async () => {
    const expected = await seedDinosaurs(table, 23);
    const paginator = table.scan<Dinosaur>().segments(4).paginate(6);
    const pages = [];

    while (paginator.hasNextPage()) pages.push(await paginator.getNextPage());

    expect(pages.map(({ items }) => items.length)).toEqual([6, 6, 6, 5]);
    expect(pages.map(({ page }) => page)).toEqual([1, 2, 3, 4]);
    expect(pages.map(({ hasNextPage }) => hasNextPage)).toEqual([true, true, true, false]);
    expect(pages.flatMap(({ items }) => items.map(({ demoPartitionKey }) => demoPartitionKey)).sort()).toEqual(
      expected.map(({ demoPartitionKey }) => demoPartitionKey).sort(),
    );
  });

  it("scans a secondary index without duplicates or omissions", async () => {
    const items = Array.from({ length: 24 }, (_, id) => ({
      demoPartitionKey: `parallel-index#${id}`,
      demoSortKey: "dinosaur",
      GSI1PK: `group#${id % 3}`,
      GSI1SK: `dinosaur#${id}`,
      name: `Indexed Dinosaur ${id}`,
      type: "Indexed",
    }));
    await Promise.all(items.map((item) => table.put(item).execute()));

    const parallel = await table.scan<(typeof items)[number]>().useIndex("GSI1").segments(3).toArray();
    const plain = await (await table.scan<(typeof items)[number]>().useIndex("GSI1").execute()).toArray();

    expect(parallel.map(({ demoPartitionKey }) => demoPartitionKey).sort()).toEqual(
      plain.map(({ demoPartitionKey }) => demoPartitionKey).sort(),
    );
    expect(parallel).toHaveLength(24);
  });

  it("continues segments across DynamoDB response page boundaries", async () => {
    const payload = "x".repeat(90_000);
    const items = Array.from({ length: 64 }, (_, id) => ({
      demoPartitionKey: `parallel-large#${id}`,
      demoSortKey: "dinosaur",
      name: `Large Dinosaur ${id}`,
      type: "Large",
      description: payload,
    }));
    await Promise.all(items.map((item) => table.put(item).execute()));

    const parallel = await table.scan<(typeof items)[number]>().segments(4).toArray();

    expect(parallel).toHaveLength(items.length);
    expect(parallel.map(({ demoPartitionKey }) => demoPartitionKey).sort()).toEqual(
      items.map(({ demoPartitionKey }) => demoPartitionKey).sort(),
    );
  });
});
