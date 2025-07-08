import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Table } from "../table";
import { type Dinosaur, createTestTable } from "./table-test-setup";

describe("Table Integration Tests - Batch Operations", () => {
  let table: Table;

  beforeAll(() => {
    table = createTestTable();
  });

  beforeEach(async () => {
    // Create test data
    const dinos: Dinosaur[] = [
      {
        demoPartitionKey: "dinosaur#batch",
        demoSortKey: "dino#1",
        name: "Batch Dino 1",
        type: "BatchTest",
      },
      {
        demoPartitionKey: "dinosaur#batch",
        demoSortKey: "dino#2",
        name: "Batch Dino 2",
        type: "BatchTest",
      },
      {
        demoPartitionKey: "dinosaur#batch",
        demoSortKey: "dino#3",
        name: "Batch Dino 3",
        type: "BatchTest",
      },
      {
        demoPartitionKey: "dinosaur#batch",
        demoSortKey: "dino#4",
        name: "Batch Dino 4",
        type: "BatchTest",
      },
      {
        demoPartitionKey: "dinosaur#batch",
        demoSortKey: "dino#5",
        name: "Batch Dino 5",
        type: "BatchTest",
      },
    ];

    const createPromises = dinos.map((dino) => table.put(dino).execute());
    await Promise.all(createPromises);
  });

  it("should batch get multiple items", async () => {
    const keys = [
      { pk: "dinosaur#batch", sk: "dino#1" },
      { pk: "dinosaur#batch", sk: "dino#3" },
      { pk: "dinosaur#batch", sk: "dino#5" },
    ];

    const result = await table.batchGet<Dinosaur>(keys);

    expect(result.items).toHaveLength(3);
    expect(result.unprocessedKeys).toHaveLength(0);

    // Verify we got the correct items
    const names = result.items.map((item) => item.name).sort();
    expect(names).toEqual(["Batch Dino 1", "Batch Dino 3", "Batch Dino 5"].sort());
  });

  it("should handle non-existent items in batch get", async () => {
    const keys = [
      { pk: "dinosaur#batch", sk: "dino#1" },
      { pk: "dinosaur#batch", sk: "dino#nonexistent" },
      { pk: "dinosaur#batch", sk: "dino#5" },
    ];

    const result = await table.batchGet<Dinosaur>(keys);

    // Should only return the existing items
    expect(result.items).toHaveLength(2);
    expect(result.unprocessedKeys).toHaveLength(0);

    const names = result.items.map((item) => item.name).sort();
    expect(names).toEqual(["Batch Dino 1", "Batch Dino 5"].sort());
  });

  it("should batch write (put) multiple items", async () => {
    const newDinos: Dinosaur[] = [
      {
        demoPartitionKey: "dinosaur#batchwrite",
        demoSortKey: "dino#new1",
        name: "New Batch Dino 1",
        type: "BatchWriteTest",
      },
      {
        demoPartitionKey: "dinosaur#batchwrite",
        demoSortKey: "dino#new2",
        name: "New Batch Dino 2",
        type: "BatchWriteTest",
      },
    ];

    const operations = newDinos.map((dino) => ({
      type: "put" as const,
      item: dino,
    }));

    const result = await table.batchWrite<Dinosaur>(operations);
    expect(result.unprocessedItems).toHaveLength(0);

    // Verify the items were created
    const getResult = await table.batchGet<Dinosaur>([
      { pk: "dinosaur#batchwrite", sk: "dino#new1" },
      { pk: "dinosaur#batchwrite", sk: "dino#new2" },
    ]);

    expect(getResult.items).toHaveLength(2);
    const names = getResult.items.map((item) => item.name).sort();
    expect(names).toEqual(["New Batch Dino 1", "New Batch Dino 2"].sort());
  });

  it("should batch write (delete) multiple items", async () => {
    // First create items to delete
    const dinosToDelete: Dinosaur[] = [
      {
        demoPartitionKey: "dinosaur#batchdelete",
        demoSortKey: "dino#delete1",
        name: "Delete Batch Dino 1",
        type: "BatchDeleteTest",
      },
      {
        demoPartitionKey: "dinosaur#batchdelete",
        demoSortKey: "dino#delete2",
        name: "Delete Batch Dino 2",
        type: "BatchDeleteTest",
      },
    ];

    // Create the items
    const createOperations = dinosToDelete.map((dino) => ({
      type: "put" as const,
      item: dino,
    }));
    await table.batchWrite<Dinosaur>(createOperations);

    // Now delete them
    const deleteOperations = [
      {
        type: "delete" as const,
        key: { pk: "dinosaur#batchdelete", sk: "dino#delete1" },
      },
      {
        type: "delete" as const,
        key: { pk: "dinosaur#batchdelete", sk: "dino#delete2" },
      },
    ];

    const result = await table.batchWrite<Dinosaur>(deleteOperations);
    expect(result.unprocessedItems).toHaveLength(0);

    // Verify the items were deleted
    const getResult = await table.batchGet<Dinosaur>([
      { pk: "dinosaur#batchdelete", sk: "dino#delete1" },
      { pk: "dinosaur#batchdelete", sk: "dino#delete2" },
    ]);

    expect(getResult.items).toHaveLength(0);
  });

  it("should handle mixed put and delete operations in batch write", async () => {
    // First create an item to delete
    await table
      .put<Dinosaur>({
        demoPartitionKey: "dinosaur#batchmixed",
        demoSortKey: "dino#delete",
        name: "Mixed Delete Dino",
        type: "BatchMixedTest",
      })
      .execute();

    // Perform mixed operations: delete one item and create another
    const operations = [
      {
        type: "delete" as const,
        key: { pk: "dinosaur#batchmixed", sk: "dino#delete" },
      },
      {
        type: "put" as const,
        item: {
          demoPartitionKey: "dinosaur#batchmixed",
          demoSortKey: "dino#new",
          name: "Mixed New Dino",
          type: "BatchMixedTest",
        } as Dinosaur,
      },
    ];

    const result = await table.batchWrite<Dinosaur>(operations);
    expect(result.unprocessedItems).toHaveLength(0);

    // Verify the results
    const getResult = await table.batchGet<Dinosaur>([
      { pk: "dinosaur#batchmixed", sk: "dino#delete" },
      { pk: "dinosaur#batchmixed", sk: "dino#new" },
    ]);

    // Should only have the new item
    expect(getResult.items).toHaveLength(1);
    expect(getResult.items[0]?.name).toBe("Mixed New Dino");
  });

  it("should handle chunking for large batch operations", async () => {
    // Create 30 items (exceeds the 25 item limit for a single batch write)
    const manyDinos: Dinosaur[] = [];
    for (let i = 1; i <= 30; i++) {
      manyDinos.push({
        demoPartitionKey: "dinosaur#batchchunk",
        demoSortKey: `dino#${i}`,
        name: `Chunk Dino ${i}`,
        type: "BatchChunkTest",
      });
    }

    const operations = manyDinos.map((dino) => ({
      type: "put" as const,
      item: dino,
    }));

    const result = await table.batchWrite<Dinosaur>(operations);
    expect(result.unprocessedItems).toHaveLength(0);

    // Verify all 30 items were created by querying
    const queryResult = await table.query({ pk: "dinosaur#batchchunk" }).execute();
    const items = await queryResult.toArray();
    expect(items).toHaveLength(30);
  });
});
