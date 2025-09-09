import { beforeAll, describe, expect, it } from "vitest";
import type { Table } from "../table";
import { createTestTable, type Dinosaur } from "./table-test-setup";

describe("Table Integration Tests - Create Items", () => {
  let table: Table;

  beforeAll(() => {
    table = createTestTable();
  });

  it("should create a new item and return input values by default", async () => {
    const dino: Dinosaur = {
      demoPartitionKey: "dinosaur#1",
      demoSortKey: "dino#trex",
      name: "T-Rex",
      type: "Tyrannosaurus",
      height: 20,
      weight: 7000,
      diet: "Carnivore",
      period: "Late Cretaceous",
    };

    const result = await table.create(dino).execute();

    // Verify that create returns the input values by default
    expect(result).toEqual(dino);

    // Verify item was created in the database
    const queryResult = await table.query({ pk: "dinosaur#1" }).execute();
    const items = await queryResult.toArray();
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(dino);
  });

  it("should allow customizing return values through returnValues method", async () => {
    const dino: Dinosaur = {
      demoPartitionKey: "dinosaur#3",
      demoSortKey: "dino#stego",
      name: "Stegosaurus",
      type: "Stegosaurid",
      height: 9,
      weight: 5000,
      diet: "Herbivore",
      period: "Late Jurassic",
    };

    // Test with NONE return value
    const noneResult = await table.create(dino).returnValues("NONE").execute();
    expect(noneResult).toBeUndefined();

    // Verify item was still created
    const queryResult = await table.query({ pk: "dinosaur#3" }).execute();
    const items = await queryResult.toArray();
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(dino);
  });

  it("should fail to create an item that already exists", async () => {
    const dino: Dinosaur = {
      demoPartitionKey: "dinosaur#2",
      demoSortKey: "dino#raptor",
      name: "Velociraptor",
      type: "Dromaeosaurid",
    };

    // Create the item first
    await table.create(dino).execute();

    // Try to create it again
    await expect(table.create(dino).execute()).rejects.toThrow();
  });
});
