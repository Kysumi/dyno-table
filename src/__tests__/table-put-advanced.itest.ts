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
      demoPartitionKey: "dinosaur#put-return",
      demoSortKey: "dino#test",
      name: "Original Name",
      type: "ReturnTest",
    };

    await table.put(originalDino).execute();

    // Update with returnValues
    const updatedDino: Dinosaur = {
      demoPartitionKey: "dinosaur#put-return",
      demoSortKey: "dino#test",
      name: "Updated Name",
      type: "ReturnTest",
    };

    // Assert that the default behaviour for ALL_OLD returnValues works as expected
    const result = await table.put(updatedDino).returnValues("ALL_OLD").execute();

    expect(result).toEqual(originalDino);

    // The result should be the updated item, but we can verify the operation worked
    // by checking the item was updated
    const getResult = await table.get({ pk: "dinosaur#put-return", sk: "dino#test" }).execute();
    expect(getResult.item?.name).toBe("Updated Name");
  });

  it("should return undefined when returnValues is set to NONE", async () => {
    // First create an item
    const originalDino: Dinosaur = {
      demoPartitionKey: "dinosaur#put-return-none",
      demoSortKey: "dino#test",
      name: "Original Name",
      type: "ReturnNoneTest",
    };

    await table.put(originalDino).execute();

    // Update with returnValues set to NONE
    const updatedDino: Dinosaur = {
      demoPartitionKey: "dinosaur#put-return-none",
      demoSortKey: "dino#test",
      name: "Updated Name",
      type: "ReturnNoneTest",
    };

    // Test that returnValues('NONE') returns null
    const result = await table.put(updatedDino).returnValues("NONE").execute();

    expect(result).toBeUndefined();

    // Verify the operation worked by checking the item was updated
    const getResult = await table.get({ pk: "dinosaur#put-return-none", sk: "dino#test" }).execute();
    expect(getResult.item?.name).toBe("Updated Name");
  });
});
