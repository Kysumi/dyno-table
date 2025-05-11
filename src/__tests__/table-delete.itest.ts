import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Table } from "../table";
import { type Dinosaur, createTestTable } from "./table-test-setup";

describe("Table Integration Tests - Delete Items", () => {
  let table: Table;

  beforeAll(() => {
    table = createTestTable();
  });

  beforeEach(async () => {
    // Create a test item
    const dino: Dinosaur = {
      demoPartitionKey: "dinosaur#delete",
      demoSortKey: "dino#test",
      name: "Delete Test",
      type: "DeleteType",
    };
    await table.put(dino).execute();
  });

  it("should delete an item by key", async () => {
    await table.delete({ pk: "dinosaur#delete", sk: "dino#test" }).execute();

    // Verify item was deleted
    const result = await table.get({ pk: "dinosaur#delete", sk: "dino#test" }).execute();
    expect(result.item).toBeUndefined();
  });

  it("should delete with a condition that passes", async () => {
    await table
      .delete({ pk: "dinosaur#delete", sk: "dino#test" })
      .condition((op) => op.eq("name", "Delete Test"))
      .execute();

    // Verify item was deleted
    const result = await table.get({ pk: "dinosaur#delete", sk: "dino#test" }).execute();
    expect(result.item).toBeUndefined();
  });

  it("should fail to delete with a condition that fails", async () => {
    await expect(
      table
        .delete({ pk: "dinosaur#delete", sk: "dino#test" })
        .condition((op) => op.eq("name", "Wrong Name"))
        .execute(),
    ).rejects.toThrow();

    // Verify item still exists
    const result = await table.get({ pk: "dinosaur#delete", sk: "dino#test" }).execute();
    expect(result.item).toBeDefined();
  });
});
