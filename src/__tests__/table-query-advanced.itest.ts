import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Table } from "../table";
import { type Dinosaur, createTestTable } from "./table-test-setup";

describe("Table Integration Tests - Query Builder Advanced Features", () => {
  let table: Table;

  beforeAll(() => {
    table = createTestTable();
  });

  beforeEach(async () => {
    // Create test data
    const dinos: Dinosaur[] = [
      {
        pk: "dinosaur#query",
        sk: "dino#page1",
        name: "Page 1 Dino",
        type: "Pagination",
      },
      {
        pk: "dinosaur#query",
        sk: "dino#page2",
        name: "Page 2 Dino",
        type: "Pagination",
      },
      {
        pk: "dinosaur#query",
        sk: "dino#page3",
        name: "Page 3 Dino",
        type: "Pagination",
      },
      {
        pk: "dinosaur#query",
        sk: "dino#page4",
        name: "Page 4 Dino",
        type: "Pagination",
      },
      {
        pk: "dinosaur#query",
        sk: "dino#page5",
        name: "Page 5 Dino",
        type: "Pagination",
      },
    ];

    const createPromises = dinos.map((dino) => table.put(dino).execute());
    await Promise.all(createPromises);
  });

  it("should paginate query results", async () => {
    // First page
    const firstPageResult = await table.query({ pk: "dinosaur#query" }).limit(2).execute();

    expect(firstPageResult.items).toHaveLength(2);
    expect(firstPageResult.lastEvaluatedKey).toBeDefined();

    // Second page
    if (firstPageResult.lastEvaluatedKey) {
      const secondPageResult = await table
        .query({ pk: "dinosaur#query" })
        .limit(2)
        .startFrom(firstPageResult.lastEvaluatedKey)
        .execute();

      expect(secondPageResult.items).toHaveLength(2);
      if (secondPageResult.items[0] && firstPageResult.items[0]) {
        expect(secondPageResult.items[0].name).not.toBe(firstPageResult.items[0].name);
      }
      if (secondPageResult.items[1] && firstPageResult.items[1]) {
        expect(secondPageResult.items[1].name).not.toBe(firstPageResult.items[1].name);
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

    expect(result.items.length).toBeGreaterThan(0);
  });
});
