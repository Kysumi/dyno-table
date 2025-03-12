import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Table } from "../table";
import { type Dinosaur, createTestTable } from "./table-test-setup";

describe("Table Integration Tests - Get Items", () => {
  let table: Table;

  beforeAll(() => {
    table = createTestTable();
  });

  beforeEach(async () => {
    // Create a test item
    const dino: Dinosaur = {
      pk: "dinosaur#get",
      sk: "dino#test",
      name: "Test Dino",
      type: "TestType",
      tags: new Set(["test", "get"]),
    };
    await table.put(dino).execute();
  });

  it("should get an item by key", async () => {
    const result = await table.get({ pk: "dinosaur#get", sk: "dino#test" }).execute();

    expect(result.item).toBeDefined();
    expect(result.item?.name).toBe("Test Dino");
    expect(result.item?.type).toBe("TestType");
  });

  it("should get an item with selected attributes", async () => {
    const result = await table.get({ pk: "dinosaur#get", sk: "dino#test" }).select(["name"]).execute();

    expect(result.item).toBeDefined();
    expect(result.item?.name).toBe("Test Dino");
    expect(result.item?.type).toBeUndefined();
    expect(result.item?.tags).toBeUndefined();
  });

  it("should get an item with consistent read", async () => {
    const result = await table.get({ pk: "dinosaur#get", sk: "dino#test" }).consistentRead().execute();

    expect(result.item).toBeDefined();
    expect(result.item?.name).toBe("Test Dino");
    expect(result.item?.type).toBe("TestType");
    expect(result.item?.tags).toBeDefined();
  });

  it("should return undefined for non-existent item", async () => {
    const result = await table.get({ pk: "dinosaur#get", sk: "dino#nonexistent" }).execute();

    expect(result.item).toBeUndefined();
  });
});
