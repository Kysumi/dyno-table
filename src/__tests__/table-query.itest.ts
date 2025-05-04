import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Table } from "../table";
import { type Dinosaur, createTestTable } from "./table-test-setup";

describe("Table Integration Tests - Query Items", () => {
  let table: Table;

  beforeAll(() => {
    table = createTestTable();
  });

  beforeEach(async () => {
    // Create test data
    const dinos: Dinosaur[] = [
      {
        pk: "dinosaur#group1",
        sk: "dino#trex1",
        name: "T-Rex 1",
        type: "Tyrannosaurus",
        period: "Late Cretaceous",
        diet: "Carnivore",
        height: 20,
        weight: 7000,
      },
      {
        pk: "dinosaur#group1",
        sk: "dino#trex2",
        name: "T-Rex 2",
        type: "Tyrannosaurus",
        period: "Late Cretaceous",
        diet: "Carnivore",
        height: 18,
        weight: 6500,
      },
      {
        pk: "dinosaur#group1",
        sk: "dino#raptor1",
        name: "Velociraptor 1",
        type: "Dromaeosaurid",
        period: "Late Cretaceous",
        diet: "Carnivore",
        height: 2,
        weight: 15,
      },
      {
        pk: "dinosaur#group2",
        sk: "dino#stego1",
        name: "Stegosaurus 1",
        type: "Stegosaurid",
        period: "Late Jurassic",
        diet: "Herbivore",
        height: 9,
        weight: 5000,
      },
      {
        pk: "dinosaur#group2",
        sk: "dino#brach1",
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
    const result = await table.query({ pk: "dinosaur#group1" }).execute();

    expect(result.items).toHaveLength(3);
    expect(result.items.map((item) => item.sk)).toEqual(
      expect.arrayContaining(["dino#trex1", "dino#trex2", "dino#raptor1"]),
    );
  });

  it("should query items with sort key condition", async () => {
    const result = await table
      .query({
        pk: "dinosaur#group1",
        sk: (op) => op.beginsWith("dino#trex"),
      })
      .execute();

    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.name)).toEqual(expect.arrayContaining(["T-Rex 1", "T-Rex 2"]));
  });

  it("should query items with filter", async () => {
    const result = await table
      .query({ pk: "dinosaur#group1" })
      .filter((op) => op.gt("height", 15))
      .execute();

    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.name)).toEqual(expect.arrayContaining(["T-Rex 1", "T-Rex 2"]));
  });

  it("should query items with limit", async () => {
    const result = await table.query({ pk: "dinosaur#group1" }).limit(2).execute();

    expect(result.items).toHaveLength(2);
  });

  it("should query items with sort order", async () => {
    const ascResult = await table.query({ pk: "dinosaur#group1" }).sortAscending().execute();

    const descResult = await table.query({ pk: "dinosaur#group1" }).sortDescending().execute();

    expect(ascResult.items.map((item) => item.sk)).toEqual(["dino#raptor1", "dino#trex1", "dino#trex2"]);

    expect(descResult.items.map((item) => item.sk)).toEqual(["dino#trex2", "dino#trex1", "dino#raptor1"]);
  });

  it("should query items with projection", async () => {
    const result = await table.query({ pk: "dinosaur#group1" }).select(["name", "type"]).execute();

    expect(result.items).toHaveLength(3);

    // @ts-expect-error
    expect(Object.keys(result.items[0])).toContain("name");
    // @ts-expect-error
    expect(Object.keys(result.items[0])).toContain("type");
    // @ts-expect-error
    expect(Object.keys(result.items[0])).not.toContain("height");
    // @ts-expect-error
    expect(Object.keys(result.items[0])).not.toContain("weight");
  });

  it("should query items with complex filter conditions", async () => {
    const result = await table
      .query({ pk: "dinosaur#group1" })
      .filter((op) => op.and(op.eq("type", "Tyrannosaurus"), op.gt("weight", 6000)))
      .execute();

    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.name)).toEqual(expect.arrayContaining(["T-Rex 1", "T-Rex 2"]));
  });
});
