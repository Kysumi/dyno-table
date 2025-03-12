import { beforeAll, describe, expect, it } from "vitest";
import type { Table } from "../table";
import { type Dinosaur, createTestTable } from "./table-test-setup";

describe("Table Integration Tests - Put Items", () => {
  let table: Table;

  beforeAll(() => {
    table = createTestTable();
  });

  it("should put an item with no conditions", async () => {
    const dino: Dinosaur = {
      pk: "dinosaur#3",
      sk: "dino#stego",
      name: "Stegosaurus",
      type: "Stegosaurid",
      period: "Late Jurassic",
    };

    const result = await table.put(dino).execute();
    expect(result).toEqual(dino);

    // Verify item was created
    const queryResult = await table.query({ pk: "dinosaur#3" }).execute();
    expect(queryResult.items).toHaveLength(1);
    expect(queryResult.items[0]).toEqual(dino);
  });

  it("should put an item with a condition that passes", async () => {
    // First create an item
    const dino: Dinosaur = {
      pk: "dinosaur#4",
      sk: "dino#brach",
      name: "Brachiosaurus",
      type: "Sauropod",
    };
    await table.put(dino).execute();

    // Update with a condition that should pass
    const updatedDino = {
      ...dino,
      height: 50,
      weight: 80000,
    };

    const result = await table
      .put(updatedDino)
      .condition((op) => op.eq("name", "Brachiosaurus"))
      .execute();

    expect(result).toEqual(updatedDino);
  });

  it("should fail to put an item with a condition that fails", async () => {
    // First create an item
    const dino: Dinosaur = {
      pk: "dinosaur#5",
      sk: "dino#anky",
      name: "Ankylosaurus",
      type: "Ankylosaur",
    };
    await table.put(dino).execute();

    // Update with a condition that should fail
    const updatedDino = {
      ...dino,
      name: "Updated Ankylosaurus",
    };

    await expect(
      table
        .put(updatedDino)
        .condition((op) => op.eq("name", "WrongName"))
        .execute(),
    ).rejects.toThrow();
  });
});
