import { beforeAll, describe, expect, it } from "vitest";
import type { Table } from "../table";
import { type Dinosaur, createTestTable } from "./table-test-setup";

describe("Table Integration Tests - Create Items", () => {
  let table: Table;

  beforeAll(() => {
    table = createTestTable();
  });

  it("should create a new item", async () => {
    const dino: Dinosaur = {
      pk: "dinosaur#1",
      sk: "dino#trex",
      name: "T-Rex",
      type: "Tyrannosaurus",
      height: 20,
      weight: 7000,
      diet: "Carnivore",
      period: "Late Cretaceous",
    };

    const result = await table.create(dino).execute();
    expect(result).toEqual(dino);

    // Verify item was created
    const queryResult = await table.query({ pk: "dinosaur#1" }).execute();
    expect(queryResult.items).toHaveLength(1);
    expect(queryResult.items[0]).toEqual(dino);
  });

  it("should fail to create an item that already exists", async () => {
    const dino: Dinosaur = {
      pk: "dinosaur#2",
      sk: "dino#raptor",
      name: "Velociraptor",
      type: "Dromaeosaurid",
    };

    // Create the item first
    await table.create(dino).execute();

    // Try to create it again
    await expect(table.create(dino).execute()).rejects.toThrow();
  });
});
