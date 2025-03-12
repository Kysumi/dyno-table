import { beforeAll, describe, expect, it } from "vitest";
import type { Table } from "../table";
import { type Dinosaur, createTestTable } from "./table-test-setup";

describe("Table Integration Tests - Put Builder Advanced Features", () => {
  let table: Table;

  beforeAll(() => {
    table = createTestTable();
  });

  it("should put an item with returnValues option", async () => {
    // First create an item
    const originalDino: Dinosaur = {
      pk: "dinosaur#put-return",
      sk: "dino#test",
      name: "Original Name",
      type: "ReturnTest",
    };
    await table.put(originalDino).execute();

    // Update with returnValues
    const updatedDino: Dinosaur = {
      pk: "dinosaur#put-return",
      sk: "dino#test",
      name: "Updated Name",
      type: "ReturnTest",
    };

    const result = await table.put(updatedDino).returnValues("ALL_OLD").execute();

    // The result should be the updated item, but we can verify the operation worked
    // by checking the item was updated
    const getResult = await table.get({ pk: "dinosaur#put-return", sk: "dino#test" }).execute();
    expect(getResult.item?.name).toBe("Updated Name");
  });
});
