import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Table } from "../table";
import { docClient } from "../../tests/ddb-client";
import { attributeNotExists, eq } from "../conditions";

type Dinosaur = {
  pk: string;
  sk: string;
  name: string;
  type: string;
  height?: number;
  weight?: number;
  diet?: string;
  period?: string;
  discovered?: number;
  tags?: Set<string>;
};

describe("Table Integration Tests", () => {
  let table: Table;

  beforeAll(async () => {
    table = new Table({
      client: docClient,
      tableName: "TestTable",
      indexes: {
        partitionKey: "pk",
        sortKey: "sk",
      },
    });
  });

  describe("Create Items", () => {
    it("should create a new item", async () => {
      const dino: Dinosaur = {
        pk: "dinosaur#1",
        sk: "dino#trex",
        name: "T-Rex",
        type: "Tyrannosaurus",
        height: 20,
        weight: 7000,
        diet: "Carnivore",
        period: "Late Cretaceous",
      };

      const result = await table.create(dino).execute();
      expect(result).toEqual(dino);

      // Verify item was created
      const queryResult = await table.query({ pk: "dinosaur#1" }).execute();
      expect(queryResult.items).toHaveLength(1);
      expect(queryResult.items[0]).toEqual(dino);
    });

    it("should fail to create an item that already exists", async () => {
      const dino: Dinosaur = {
        pk: "dinosaur#2",
        sk: "dino#raptor",
        name: "Velociraptor",
        type: "Dromaeosaurid",
      };

      // Create the item first
      await table.create(dino).execute();

      // Try to create it again
      await expect(table.create(dino).execute()).rejects.toThrow();
    });
  });

  describe("Put Items", () => {
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

  describe("Query Items", () => {
    beforeEach(async () => {
      // Create test data
      const dinos: Dinosaur[] = [
        {
          pk: "dinosaur#group1",
          sk: "dino#trex1",
          name: "T-Rex 1",
          type: "Tyrannosaurus",
          period: "Late Cretaceous",
          diet: "Carnivore",
          height: 20,
          weight: 7000,
        },
        {
          pk: "dinosaur#group1",
          sk: "dino#trex2",
          name: "T-Rex 2",
          type: "Tyrannosaurus",
          period: "Late Cretaceous",
          diet: "Carnivore",
          height: 18,
          weight: 6500,
        },
        {
          pk: "dinosaur#group1",
          sk: "dino#raptor1",
          name: "Velociraptor 1",
          type: "Dromaeosaurid",
          period: "Late Cretaceous",
          diet: "Carnivore",
          height: 2,
          weight: 15,
        },
        {
          pk: "dinosaur#group2",
          sk: "dino#stego1",
          name: "Stegosaurus 1",
          type: "Stegosaurid",
          period: "Late Jurassic",
          diet: "Herbivore",
          height: 9,
          weight: 5000,
        },
        {
          pk: "dinosaur#group2",
          sk: "dino#brach1",
          name: "Brachiosaurus 1",
          type: "Sauropod",
          period: "Late Jurassic",
          diet: "Herbivore",
          height: 50,
          weight: 80000,
        },
      ];

      const createPromises = dinos.map((dino) => table.put(dino).execute());
      await Promise.all(createPromises);
    });

    it("should query items by partition key", async () => {
      const result = await table.query({ pk: "dinosaur#group1" }).execute();

      expect(result.items).toHaveLength(3);
      expect(result.items.map((item) => item.sk)).toEqual(
        expect.arrayContaining(["dino#trex1", "dino#trex2", "dino#raptor1"]),
      );
    });

    it("should query items with sort key condition", async () => {
      const result = await table
        .query({
          pk: "dinosaur#group1",
          sk: (op) => op.beginsWith("dino#trex"),
        })
        .execute();

      expect(result.items).toHaveLength(2);
      expect(result.items.map((item) => item.name)).toEqual(expect.arrayContaining(["T-Rex 1", "T-Rex 2"]));
    });

    it("should query items with filter", async () => {
      const result = await table
        .query({ pk: "dinosaur#group1" })
        .filter((op) => op.gt("height", 15))
        .execute();

      expect(result.items).toHaveLength(2);
      expect(result.items.map((item) => item.name)).toEqual(expect.arrayContaining(["T-Rex 1", "T-Rex 2"]));
    });

    it("should query items with limit", async () => {
      const result = await table.query({ pk: "dinosaur#group1" }).limit(2).execute();

      expect(result.items).toHaveLength(2);
    });

    it("should query items with sort order", async () => {
      const ascResult = await table.query({ pk: "dinosaur#group1" }).sortAscending().execute();

      const descResult = await table.query({ pk: "dinosaur#group1" }).sortDescending().execute();

      expect(ascResult.items.map((item) => item.sk)).toEqual(["dino#raptor1", "dino#trex1", "dino#trex2"]);

      expect(descResult.items.map((item) => item.sk)).toEqual(["dino#trex2", "dino#trex1", "dino#raptor1"]);
    });

    it("should query items with projection", async () => {
      const result = await table.query({ pk: "dinosaur#group1" }).select(["name", "type"]).execute();

      expect(result.items).toHaveLength(3);

      // @ts-expect-error
      expect(Object.keys(result.items[0])).toContain("name");
      // @ts-expect-error
      expect(Object.keys(result.items[0])).toContain("type");
      // @ts-expect-error
      expect(Object.keys(result.items[0])).not.toContain("height");
      // @ts-expect-error
      expect(Object.keys(result.items[0])).not.toContain("weight");
    });

    it("should query items with complex filter conditions", async () => {
      const result = await table
        .query({ pk: "dinosaur#group1" })
        .filter((op) => op.and(op.eq("type", "Tyrannosaurus"), op.gt("weight", 6000)))
        .execute();

      expect(result.items).toHaveLength(2);
      expect(result.items.map((item) => item.name)).toEqual(expect.arrayContaining(["T-Rex 1", "T-Rex 2"]));
    });
  });

  describe("Get Items", () => {
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

  describe("Delete Items", () => {
    beforeEach(async () => {
      // Create a test item
      const dino: Dinosaur = {
        pk: "dinosaur#delete",
        sk: "dino#test",
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

  describe("Update Items", () => {
    beforeEach(async () => {
      // Create a test item
      const dino: Dinosaur = {
        pk: "dinosaur#update",
        sk: "dino#test",
        name: "Update Test",
        type: "UpdateType",
        height: 10,
        weight: 1000,
      };
      await table.put(dino).execute();
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
        pk: "dinosaur#update-delete",
        sk: "dino#test",
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

  describe("Query Builder Advanced Features", () => {
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

  describe("Put Builder Advanced Features", () => {
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

  describe("Transaction Operations", () => {
    it("should execute a transaction with multiple operations", async () => {
      // Create transaction with multiple operations
      await table.transaction(async (transaction) => {
        // Add a put operation
        transaction.put("TestTable", {
          pk: "transaction#test",
          sk: "item#1",
          name: "Transaction Item 1",
          type: "TransactionTest",
        });

        // Add another put operation
        transaction.put("TestTable", {
          pk: "transaction#test",
          sk: "item#2",
          name: "Transaction Item 2",
          type: "TransactionTest",
        });

        // Add an update operation
        transaction.put("TestTable", {
          pk: "transaction#test",
          sk: "item#3",
          name: "Transaction Item 3",
          type: "TransactionTest",
        });
      });

      // Verify all items were created
      const queryResult = await table.query({ pk: "transaction#test" }).execute();
      expect(queryResult.items).toHaveLength(3);

      // Verify individual items
      const item1 = queryResult.items.find((item: Record<string, unknown>) => item.sk === "item#1");
      const item2 = queryResult.items.find((item: Record<string, unknown>) => item.sk === "item#2");
      const item3 = queryResult.items.find((item: Record<string, unknown>) => item.sk === "item#3");

      expect(item1).toBeDefined();
      expect(item1?.name).toBe("Transaction Item 1");

      expect(item2).toBeDefined();
      expect(item2?.name).toBe("Transaction Item 2");

      expect(item3).toBeDefined();
      expect(item3?.name).toBe("Transaction Item 3");
    });

    it("should roll back a transaction when a condition fails", async () => {
      // First create an item
      await table
        .put({
          pk: "transaction#test",
          sk: "conditional#item",
          name: "Existing Item",
          type: "TransactionTest",
        })
        .execute();

      // Try to execute a transaction with a failing condition
      try {
        await table.transaction(async (transaction) => {
          // This operation should succeed
          transaction.put("TestTable", {
            pk: "transaction#test",
            sk: "success#item",
            name: "This Should Not Be Created",
            type: "TransactionTest",
          });

          // This operation should fail due to the condition
          transaction.put(
            "TestTable",
            {
              pk: "transaction#test",
              sk: "conditional#item",
              name: "Updated Name",
              type: "TransactionTest",
            },
            attributeNotExists("pk"),
          );
        });

        // If we get here, the test should fail
        expect(true).toBe(false); // This should not execute
      } catch (error) {
        // Transaction should fail
        expect(error).toBeDefined();
      }

      // Verify that no items were created/updated
      const queryResult = await table.query({ pk: "transaction#test" }).execute();

      // The only item should be the original one
      const conditionalItem = queryResult.items.find((item: Record<string, unknown>) => item.sk === "conditional#item");
      expect(conditionalItem).toBeDefined();
      expect(conditionalItem?.name).toBe("Existing Item");

      // The success item should not exist
      const successItem = queryResult.items.find((item: Record<string, unknown>) => item.sk === "success#item");
      expect(successItem).toBeUndefined();
    });

    it("should support mixed operations in a transaction", async () => {
      // First create items to update and delete
      await table
        .put({
          pk: "transaction#test",
          sk: "update#item",
          name: "Item To Update",
          type: "TransactionTest",
          status: "active",
        })
        .execute();

      await table
        .put({
          pk: "transaction#test",
          sk: "delete#item",
          name: "Item To Delete",
          type: "TransactionTest",
        })
        .execute();

      // Execute transaction with mixed operations
      await table.transaction(async (transaction) => {
        // Put operation
        transaction.put("TestTable", {
          pk: "transaction#test",
          sk: "put#item",
          name: "New Item",
          type: "TransactionTest",
        });

        // Update operation
        transaction.update(
          "TestTable",
          { pk: "transaction#test", sk: "update#item" },
          "SET #name = :name, #status = :status",
          { "#name": "name", "#status": "status" },
          { ":name": "Updated Item", ":status": "inactive" },
        );

        // Delete operation
        transaction.delete("TestTable", { pk: "transaction#test", sk: "delete#item" });
      });

      // Verify results
      const queryResult = await table.query({ pk: "transaction#test" }).execute();

      // Should have 2 items (put and update, delete should be gone)
      expect(
        queryResult.items.filter(
          (item: Record<string, unknown>) => item.sk === "put#item" || item.sk === "update#item",
        ),
      ).toHaveLength(2);

      // Verify put item
      const putItem = queryResult.items.find((item: Record<string, unknown>) => item.sk === "put#item");
      expect(putItem).toBeDefined();
      expect(putItem?.name).toBe("New Item");

      // Verify updated item
      const updatedItem = queryResult.items.find((item: Record<string, unknown>) => item.sk === "update#item");
      expect(updatedItem).toBeDefined();
      expect(updatedItem?.name).toBe("Updated Item");
      expect(updatedItem?.status).toBe("inactive");

      // Verify deleted item is gone
      const deletedItem = queryResult.items.find((item: Record<string, unknown>) => item.sk === "delete#item");
      expect(deletedItem).toBeUndefined();
    });

    it("should support condition checks in transactions", async () => {
      // First create an item to check
      await table
        .put({
          pk: "transaction#test",
          sk: "condition#item",
          name: "Condition Check Item",
          type: "TransactionTest",
          status: "active",
        })
        .execute();

      // Execute transaction with condition check
      await table.transaction(async (transaction) => {
        // Add a condition check
        transaction.conditionCheck(
          "TestTable",
          { pk: "transaction#test", sk: "condition#item" },
          eq("status", "active"),
        );

        // Add a put operation that depends on the condition
        transaction.put("TestTable", {
          pk: "transaction#test",
          sk: "dependent#item",
          name: "Dependent Item",
          type: "TransactionTest",
        });
      });

      // Verify the dependent item was created
      const queryResult = await table.query({ pk: "transaction#test" }).execute();
      const dependentItem = queryResult.items.find((item: Record<string, unknown>) => item.sk === "dependent#item");

      expect(dependentItem).toBeDefined();
      expect(dependentItem?.name).toBe("Dependent Item");

      // // Now try a transaction with a failing condition
      // try {
      //   await table.transaction(async (transaction) => {
      //     // Add a condition check that will fail
      //     transaction.conditionCheck(
      //       "TestTable",
      //       { pk: "transaction#test", sk: "condition#item" },
      //       eq("status", "inactive"),
      //     );

      //     // Add a put operation that depends on the condition
      //     transaction.put("TestTable", {
      //       pk: "transaction#test",
      //       sk: "should-not-exist",
      //       name: "This Should Not Be Created",
      //       type: "TransactionTest",
      //     });
      //   });

      //   // If we get here, the test should fail
      //   expect(true).toBe(false); // This should not execute
      // } catch (error) {
      //   // Transaction should fail
      //   expect(error).toBeDefined();
      // }

      // // Verify the dependent item was not created
      // const failedQueryResult = await table.query({ pk: "transaction#test" }).execute();
      // const shouldNotExistItem = failedQueryResult.items.find(
      //   (item: Record<string, unknown>) => item.sk === "should-not-exist",
      // );

      // expect(shouldNotExistItem).toBeUndefined();
    });
  });

  describe("Batch Operations", () => {
    beforeEach(async () => {
      // Create test data
      const dinos: Dinosaur[] = [
        {
          pk: "dinosaur#batch",
          sk: "dino#1",
          name: "Batch Dino 1",
          type: "BatchTest",
        },
        {
          pk: "dinosaur#batch",
          sk: "dino#2",
          name: "Batch Dino 2",
          type: "BatchTest",
        },
        {
          pk: "dinosaur#batch",
          sk: "dino#3",
          name: "Batch Dino 3",
          type: "BatchTest",
        },
        {
          pk: "dinosaur#batch",
          sk: "dino#4",
          name: "Batch Dino 4",
          type: "BatchTest",
        },
        {
          pk: "dinosaur#batch",
          sk: "dino#5",
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
      const newDinos = [
        {
          pk: "dinosaur#batchwrite",
          sk: "dino#new1",
          name: "New Batch Dino 1",
          type: "BatchWriteTest",
        },
        {
          pk: "dinosaur#batchwrite",
          sk: "dino#new2",
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
      const dinosToDelete = [
        {
          pk: "dinosaur#batchdelete",
          sk: "dino#delete1",
          name: "Delete Batch Dino 1",
          type: "BatchDeleteTest",
        },
        {
          pk: "dinosaur#batchdelete",
          sk: "dino#delete2",
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
          pk: "dinosaur#batchmixed",
          sk: "dino#delete",
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
            pk: "dinosaur#batchmixed",
            sk: "dino#new",
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
          pk: "dinosaur#batchchunk",
          sk: `dino#${i}`,
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
      expect(queryResult.items).toHaveLength(30);
    });
  });
});
