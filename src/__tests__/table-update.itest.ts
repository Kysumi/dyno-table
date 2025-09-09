import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Table } from "../table";
import { createTestTable, type Dinosaur } from "./table-test-setup";

describe("Table Integration Tests - Update Items", () => {
  let table: Table;

  beforeAll(() => {
    table = createTestTable();
  });

  beforeEach(async () => {
    // Create a test item
    const dino: Dinosaur = {
      demoPartitionKey: "dinosaur#update",
      demoSortKey: "dino#test",
      name: "Update Test",
      type: "UpdateType",
      height: 10,
      weight: 1000,
    };
    await table.put(dino).execute();
  });

  it("should update be able to add new object to previously undefined key", async () => {
    const result = await table
      .update({ pk: "dinosaur#update", sk: "dino#test" })
      .set("newAttribute", {
        levelOne: {
          levelTwo: true,
        },
        key: "value",
      })
      .execute();

    const item = result.item;

    expect(item).toBeDefined();
    expect(item?.newAttribute).toStrictEqual({
      levelOne: {
        levelTwo: true,
      },
      key: "value",
    });
  });

  it("should update specific attributes", async () => {
    const result = await table
      .update({ pk: "dinosaur#update", sk: "dino#test" })
      .set("name", "Updated Name")
      .set("height", 15)
      .execute();

    expect(result.item).toBeDefined();
    expect(result.item?.name).toBe("Updated Name");
    expect(result.item?.height).toBe(15);
    expect(result.item?.type).toBe("UpdateType"); // Unchanged
    expect(result.item?.weight).toBe(1000); // Unchanged
  });

  it("should update with add operation", async () => {
    const result = await table.update({ pk: "dinosaur#update", sk: "dino#test" }).add("weight", 500).execute();

    expect(result.item?.weight).toBe(1500);
  });

  it("should update with remove operation", async () => {
    const result = await table.update({ pk: "dinosaur#update", sk: "dino#test" }).remove("height").execute();

    expect(result.item?.height).toBeUndefined();
  });

  it("should update with a condition that passes", async () => {
    const result = await table
      .update({ pk: "dinosaur#update", sk: "dino#test" })
      .set("name", "Condition Passed")
      .condition((op) => op.eq("type", "UpdateType"))
      .execute();

    expect(result.item?.name).toBe("Condition Passed");
  });

  it("should fail to update with a condition that fails", async () => {
    await expect(
      table
        .update({ pk: "dinosaur#update", sk: "dino#test" })
        .set("name", "Should Not Update")
        .condition((op) => op.eq("type", "WrongType"))
        .execute(),
    ).rejects.toThrow();

    // Verify item wasn't updated
    const getResult = await table.get({ pk: "dinosaur#update", sk: "dino#test" }).execute();
    expect(getResult.item?.name).toBe("Update Test");
  });

  it("should perform multiple operations in one update", async () => {
    const result = await table
      .update({ pk: "dinosaur#update", sk: "dino#test" })
      .set("name", "Multi Update")
      .add("weight", 200)
      .remove("height")
      .execute();

    expect(result.item?.name).toBe("Multi Update");
    expect(result.item?.weight).toBe(1200);
    expect(result.item?.height).toBeUndefined();
  });

  it("should update with delete operation for set attributes", async () => {
    // First create an item with tags
    const dino: Dinosaur = {
      demoPartitionKey: "dinosaur#update-delete",
      demoSortKey: "dino#test",
      name: "Delete Test",
      type: "DeleteType",
      tags: new Set(["tag1", "tag2", "tag3"]),
    };
    await table.put(dino).execute();

    // Delete a value from the tags set
    const result = await table
      .update<Dinosaur>({ pk: "dinosaur#update-delete", sk: "dino#test" })
      .deleteElementsFromSet("tags", ["tag2"])
      .execute();

    expect(result.item?.tags).toEqual(new Set(["tag1", "tag3"]));
    expect(result.item?.tags).not.toContain("tag2");
  });

  it("should update with set operation using an object", async () => {
    const result = await table
      .update({ pk: "dinosaur#update", sk: "dino#test" })
      .set({
        name: "Object Update",
        height: 25,
        discovered: 1905,
      })
      .execute();

    expect(result.item?.name).toBe("Object Update");
    expect(result.item?.height).toBe(25);
    expect(result.item?.discovered).toBe(1905);
  });

  it("should update with specific return values", async () => {
    // First update to a known state
    await table.update({ pk: "dinosaur#update", sk: "dino#test" }).set("name", "Before Update").execute();

    // Then update with UPDATED_OLD return values
    const result = await table
      .update({ pk: "dinosaur#update", sk: "dino#test" })
      .set("name", "After Update")
      .returnValues("UPDATED_OLD")
      .execute();

    // Should only return the updated attributes with their old values
    expect(result.item?.name).toBe("Before Update");
    expect(result.item?.height).toBeUndefined();
    expect(result.item?.weight).toBeUndefined();
  });
});
