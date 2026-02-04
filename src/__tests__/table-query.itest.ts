import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Table } from "../table";
import { createTestTable, type Dinosaur } from "./table-test-setup";

describe("Table Integration Tests - Query Items", () => {
  let table: Table;

  beforeAll(() => {
    table = createTestTable();
  });

  beforeEach(async () => {
    // Create test data
    const dinos: Dinosaur[] = [
      {
        demoPartitionKey: "dinosaur#group1",
        demoSortKey: "dino#trex1",
        name: "T-Rex 1",
        type: "Tyrannosaurus",
        period: "Late Cretaceous",
        diet: "Carnivore",
        height: 20,
        weight: 7000,
      },
      {
        demoPartitionKey: "dinosaur#group1",
        demoSortKey: "dino#trex2",
        name: "T-Rex 2",
        type: "Tyrannosaurus",
        period: "Late Cretaceous",
        diet: "Carnivore",
        height: 18,
        weight: 6500,
      },
      {
        demoPartitionKey: "dinosaur#group1",
        demoSortKey: "dino#raptor1",
        name: "Velociraptor 1",
        type: "Dromaeosaurid",
        period: "Late Cretaceous",
        diet: "Carnivore",
        height: 2,
        weight: 15,
      },
      {
        demoPartitionKey: "dinosaur#group2",
        demoSortKey: "dino#stego1",
        name: "Stegosaurus 1",
        type: "Stegosaurid",
        period: "Late Jurassic",
        diet: "Herbivore",
        height: 9,
        weight: 5000,
      },
      {
        demoPartitionKey: "dinosaur#group2",
        demoSortKey: "dino#brach1",
        name: "Brachiosaurus 1",
        type: "Sauropod",
        period: "Late Jurassic",
        diet: "Herbivore",
        height: 50,
        weight: 80000,
      },
    ];

    const createPromises = dinos.map((dino) => table.put(dino).execute());
    await Promise.all(createPromises);
  });

  it("should query items by partition key", async () => {
    const resultIterator = await table.query({ pk: "dinosaur#group1" }).execute();
    const items = await resultIterator.toArray();

    expect(items).toHaveLength(3);
    expect(items.map((item) => item.demoSortKey)).toEqual(
      expect.arrayContaining(["dino#trex1", "dino#trex2", "dino#raptor1"]),
    );
  });

  it("should query items with sort key condition", async () => {
    const resultIterator = await table
      .query({
        pk: "dinosaur#group1",
        sk: (op) => op.beginsWith("dino#trex"),
      })
      .execute();
    const items = await resultIterator.toArray();

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.name)).toEqual(expect.arrayContaining(["T-Rex 1", "T-Rex 2"]));
  });

  it("should query items with filter", async () => {
    const resultIterator = await table
      .query({ pk: "dinosaur#group1" })
      .filter((op) => op.gt("height", 15))
      .execute();
    const items = await resultIterator.toArray();

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.name)).toEqual(expect.arrayContaining(["T-Rex 1", "T-Rex 2"]));
  });

  it("should query items with limit", async () => {
    const resultIterator = await table.query({ pk: "dinosaur#group1" }).limit(2).execute();
    const items = await resultIterator.toArray();

    expect(items).toHaveLength(2);
  });

  it("should query items with sort order", async () => {
    const ascResultIterator = await table.query({ pk: "dinosaur#group1" }).sortAscending().execute();
    const ascItems = await ascResultIterator.toArray();

    const descResultIterator = await table.query({ pk: "dinosaur#group1" }).sortDescending().execute();
    const descItems = await descResultIterator.toArray();

    expect(ascItems.map((item) => item.demoSortKey)).toEqual(["dino#raptor1", "dino#trex1", "dino#trex2"]);

    expect(descItems.map((item) => item.demoSortKey)).toEqual(["dino#trex2", "dino#trex1", "dino#raptor1"]);
  });

  it("should query items with projection", async () => {
    const resultIterator = await table.query({ pk: "dinosaur#group1" }).select(["name", "type"]).execute();
    const items = await resultIterator.toArray();

    expect(items).toHaveLength(3);

    // @ts-expect-error
    expect(Object.keys(items[0])).toContain("name");
    // @ts-expect-error
    expect(Object.keys(items[0])).toContain("type");
    // @ts-expect-error
    expect(Object.keys(items[0])).not.toContain("height");
    // @ts-expect-error
    expect(Object.keys(items[0])).not.toContain("weight");
  });

  it("should query items with complex filter conditions", async () => {
    const resultIterator = await table
      .query({ pk: "dinosaur#group1" })
      .filter((op) => op.and(op.eq("type", "Tyrannosaurus"), op.gt("weight", 6000)))
      .execute();
    const items = await resultIterator.toArray();

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.name)).toEqual(expect.arrayContaining(["T-Rex 1", "T-Rex 2"]));
  });

  it("should apply filters at the DB level when using findOne", async () => {
    const result = await table
      .query({ pk: "dinosaur#group1" })
      .filter((op) => op.lt("weight", 100))
      .sortDescending()
      .findOne();

    expect(result?.name).toBe("Velociraptor 1");
  });
});
