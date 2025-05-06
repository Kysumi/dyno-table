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

    const result = await table.put(dino).returnValues("CONSISTENT").execute();
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
      .returnValues("CONSISTENT")
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

  it("should ensure keys with undefined values are retained", async () => {
    const dino: Dinosaur = {
      pk: "dinosaur#6",
      sk: "dino#spino",
      name: "Spinosaurus",
      type: "Theropod",
      period: undefined, // Undefined value
      species: {
        name: "",
      },
    };

    // Not set the return values too CONSISTENT to ensure the undefined value is retained
    const result = await table.put(dino).execute();
    expect(result).toEqual(undefined);

    // Verify item was created and undefined keys are retained as `undefined` in the stored object
    const getResult = await table.get<Dinosaur>({ pk: "dinosaur#6", sk: "dino#spino" }).execute();
    expect(getResult.item).toBeDefined();

    expect(getResult.item).toEqual(dino);
    expect(getResult.item?.period).toBeUndefined(); // Explicitly checking the undefined value
    expect(getResult.item?.species?.name).toEqual("");
  });

  it("should ensure keys with empty strings are retained", async () => {
    const dino: Dinosaur = {
      pk: "dinosaur#7",
      sk: "dino#rex",
      name: "Tyrannosaurus Rex",
      type: "",
      period: "Cretaceous",
      species: {
        name: null,
      },
    };

    const result = await table.put(dino).returnValues("CONSISTENT").execute();
    expect(result).toEqual(dino);

    // Verify item was created and empty string keys are retained in the stored object
    const queryResult = await table.get<Dinosaur>({ pk: "dinosaur#7", sk: "dino#rex" }).execute();
    expect(queryResult.item).toBeDefined();
    expect(queryResult.item).toEqual(dino);
    expect(queryResult.item?.type).toBe(""); // Explicitly checking the empty string value
    expect(queryResult.item?.species?.name).toBe(null);
  });
});
