import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Table } from "../table";
import { createTestTable, type Dinosaur } from "./table-test-setup";

describe("Table Integration Tests - Query Builder Advanced Features", () => {
  let table: Table;

  beforeAll(() => {
    table = createTestTable();
  });

  beforeEach(async () => {
    // Create test data
    const dinos: Dinosaur[] = [
      {
        demoPartitionKey: "dinosaur#query",
        demoSortKey: "dino#page1",
        name: "Page 1 Dino",
        type: "Pagination",
      },
      {
        demoPartitionKey: "dinosaur#query",
        demoSortKey: "dino#page2",
        name: "Page 2 Dino",
        type: "Pagination",
      },
      {
        demoPartitionKey: "dinosaur#query",
        demoSortKey: "dino#page3",
        name: "Page 3 Dino",
        type: "Pagination",
      },
      {
        demoPartitionKey: "dinosaur#query",
        demoSortKey: "dino#page4",
        name: "Page 4 Dino",
        type: "Pagination",
      },
      {
        demoPartitionKey: "dinosaur#query",
        demoSortKey: "dino#page5",
        name: "Page 5 Dino",
        type: "Pagination",
      },
    ];

    const createPromises = dinos.map((dino) => table.put(dino).execute());
    await Promise.all(createPromises);
  });

  it("should paginate query results", async () => {
    const firstPageResult = await table.query({ pk: "dinosaur#query" }).limit(2).execute();
    const firstPageItems = await firstPageResult.toArray();

    expect(firstPageItems).toHaveLength(2);
    expect(firstPageResult.getLastEvaluatedKey()).toBeDefined();

    const key = firstPageResult.getLastEvaluatedKey();

    expect(key).toBeDefined();

    // Second page
    if (key) {
      const secondPageResult = await table.query({ pk: "dinosaur#query" }).limit(2).startFrom(key).execute();

      const secondPageItems = await secondPageResult.toArray();
      expect(secondPageItems).toHaveLength(2);
      if (secondPageItems[0] && firstPageItems[0]) {
        expect(secondPageItems[0].name).not.toBe(firstPageItems[0].name);
      }
      if (secondPageItems[1] && firstPageItems[1]) {
        expect(secondPageItems[1].name).not.toBe(firstPageItems[1].name);
      }
    }
  });

  it("should use the Paginator for simplified pagination", async () => {
    // Create a paginator with page size of 2
    const paginator = table.query({ pk: "dinosaur#query" }).paginate(2);

    // Get the first page
    const firstPage = await paginator.getNextPage();
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.hasNextPage).toBe(true);
    expect(firstPage.page).toBe(1);

    // Get the second page
    const secondPage = await paginator.getNextPage();
    expect(secondPage.items).toHaveLength(2);
    expect(secondPage.hasNextPage).toBe(true);
    expect(secondPage.page).toBe(2);

    // Get the third page
    const thirdPage = await paginator.getNextPage();
    expect(thirdPage.items).toHaveLength(1); // Only one item left
    expect(thirdPage.hasNextPage).toBe(false);
    expect(thirdPage.page).toBe(3);

    // Try to get another page (should be empty)
    const emptyPage = await paginator.getNextPage();
    expect(emptyPage.items).toHaveLength(0);
    expect(emptyPage.hasNextPage).toBe(false);
  });

  it("should get all pages at once using getAllPages", async () => {
    const paginator = table.query({ pk: "dinosaur#query" }).paginate(2);
    const allItems = await paginator.getAllPages();

    expect(allItems).toHaveLength(5); // All 5 dinosaurs

    // Verify we got all the dinosaurs
    const names = allItems.map((item) => item.name).sort();
    expect(names).toEqual(["Page 1 Dino", "Page 2 Dino", "Page 3 Dino", "Page 4 Dino", "Page 5 Dino"].sort());
  });

  it("should respect the overall limit set on the query builder", async () => {
    // Set an overall limit of 3 items, with a page size of 2
    const paginator = table.query({ pk: "dinosaur#query" }).limit(3).paginate(2);

    // Get the first page
    const firstPage = await paginator.getNextPage();
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.hasNextPage).toBe(true);
    expect(firstPage.page).toBe(1);

    // Get the second page (should only have 1 item due to overall limit of 3)
    const secondPage = await paginator.getNextPage();
    expect(secondPage.items).toHaveLength(1); // Only 1 item due to overall limit
    expect(secondPage.hasNextPage).toBe(false); // No more pages due to overall limit
    expect(secondPage.page).toBe(2);

    // Try to get another page (should be empty)
    const emptyPage = await paginator.getNextPage();
    expect(emptyPage.items).toHaveLength(0);
    expect(emptyPage.hasNextPage).toBe(false);

    // Verify we only got 3 items total (due to the limit)
    const allItems = await table.query({ pk: "dinosaur#query" }).limit(3).paginate(2).getAllPages();

    expect(allItems).toHaveLength(3); // Only 3 due to limit
  });

  it("should use consistent read", async () => {
    // This is mostly a syntax test since we can't easily test the actual consistency
    const result = await table.query({ pk: "dinosaur#query" }).consistentRead(true).execute();
    const items = await result.toArray();

    expect(items.length).toBeGreaterThan(0);
  });

  it("should respect limit when using for await iterator", async () => {
    const result = await table.query<Dinosaur>({ pk: "dinosaur#query" }).limit(3).execute();

    const items: Dinosaur[] = [];
    for await (const item of result) {
      items.push(item);
    }

    expect(items).toHaveLength(3); // Should only get 3 items due to limit
  });

  it("should iterate through all items when no limit is set using for await", async () => {
    const result = await table.query<Dinosaur>({ pk: "dinosaur#query" }).execute();

    const items: Dinosaur[] = [];
    for await (const item of result) {
      items.push(item);
    }

    expect(items).toHaveLength(5); // Should get all 5 items
    expect(items.every((item) => item.demoPartitionKey === "dinosaur#query")).toBe(true);
  });

  it("should handle large datasets requiring multiple DynamoDB requests with for await", async () => {
    // Create large items that will exceed DynamoDB's 1MB response limit
    // Each item will be approximately 50KB to ensure we hit the limit with ~25 items
    const largeDescription = "A".repeat(50000); // 50KB string

    const largeDinos: Dinosaur[] = [];
    for (let i = 1; i <= 100; i++) {
      largeDinos.push({
        demoPartitionKey: "dinosaur#large",
        demoSortKey: `large#${i.toString().padStart(3, "0")}`,
        name: `Large Dino ${i}`,
        type: "Massive",
        description: largeDescription, // Large field to make each item ~50KB
      });
    }

    // Insert all large items using batch write
    const operations = largeDinos.map((dino) => ({
      type: "put" as const,
      item: dino,
    }));

    const batchResult = await table.batchWrite<Dinosaur>(operations);
    expect(batchResult.unprocessedItems).toHaveLength(0);

    // Query all items using for await - this should require multiple DynamoDB requests
    const result = await table.query<Dinosaur>({ pk: "dinosaur#large" }).execute();

    const items: Dinosaur[] = [];
    for await (const item of result) {
      items.push(item);
    }

    // Ensure we loaded all the items from the DB
    expect(items).toHaveLength(100);
  });
});
