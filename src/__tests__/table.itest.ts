import { beforeAll, describe, expect, it, beforeEach } from "vitest";
import { Table } from "../table";
import { ConditionalCheckFailedError, DynamoError } from "../errors/dynamo-error";
import { docClient } from "../../tests/ddb-client";
import { TransactionBuilder } from "../builders/transaction-builder";

const indexes = {
  primary: {
    pkName: "pk",
    skName: "sk",
  },
  GSI1: {
    pkName: "GSI1PK",
    skName: "GSI1SK",
  },
};

describe("Table Integration Tests", () => {
  let table: Table<keyof typeof indexes>;

  // Test item data
  const testItem = {
    pk: "USER#123",
    sk: "PROFILE#123",
    name: "John Doe",
    email: "john@example.com",
    age: 30,
    type: "USER",
  };

  beforeAll(() => {
    table = new Table({
      client: docClient,
      tableName: "TestTable",
      tableIndexes: indexes,
    });
  });

  beforeEach(async () => {
    // Clean up any existing data before each test
    try {
      await table.delete({ pk: testItem.pk, sk: testItem.sk }).execute();
    } catch (error) {
      // Ignore if item doesn't exist
    }
  });

  describe("Input Validation", () => {
    it("should throw error when partition key is missing", async () => {
      // @ts-ignore Testing invalid input will throw an Error
      await expect(table.get({ sk: "test" })).rejects.toThrow("Partition key is required");
    });

    it("should throw error when sort key is provided for index without sort key", async () => {
      const invalidTable = new Table({
        client: docClient,
        tableName: "TestTable",
        tableIndexes: {
          primary: {
            pkName: "pk", // No sort key defined
          },
        },
      });

      await expect(invalidTable.get({ pk: "test", sk: "test" })).rejects.toThrow(
        "Sort key provided but index does not support sort keys",
      );
    });

    it("should throw error when sort key is missing for index requiring it", async () => {
      await expect(
        table.get({ pk: "test" }), // Missing required sk
      ).rejects.toThrow("Index requires a sort key but none was provided");
    });
  });

  describe("Resource Limits", () => {
    it("should throw error when transaction exceeds item limit", async () => {
      const items = Array(101)
        .fill(null)
        .map((_, i) => ({
          put: {
            item: { ...testItem, pk: `USER#${i}`, sk: `PROFILE#${i}` },
          },
        }))
        .reduce((builder, item) => builder.addOperation(item), new TransactionBuilder());

      await expect(table.transactWrite(items)).rejects.toThrow("Transaction limit exceeded");
    });

    it("should handle batch write chunking for large datasets", async () => {
      const items = Array(30)
        .fill(null)
        .map((_, i) => ({
          type: "put" as const,
          item: { ...testItem, pk: `USER#${i}`, sk: `PROFILE#${i}` },
        }));

      await table.batchWrite(items); // Should automatically chunk into 25-item batches

      // Verify all items were written
      for (let i = 0; i < 30; i++) {
        const result = await table.get({
          pk: `USER#${i}`,
          sk: `PROFILE#${i}`,
        });
        expect(result).toBeDefined();
      }
    });
  });

  describe("CRUD Operations", () => {
    it("should create, get, update, and delete an item", async () => {
      await table.put(testItem).execute();

      const retrievedItem = await table.get({
        pk: testItem.pk,
        sk: testItem.sk,
      });
      expect(retrievedItem).toEqual(testItem);

      const updates = {
        email: "john.doe@example.com",
        age: 31,
      };
      await table
        .update({ pk: testItem.pk, sk: testItem.sk })
        .set("email", updates.email)
        .set("age", updates.age)
        .execute();

      const updatedItem = await table.get({
        pk: testItem.pk,
        sk: testItem.sk,
      });
      expect(updatedItem).toEqual({ ...testItem, ...updates });

      await table.delete({ pk: testItem.pk, sk: testItem.sk }).execute();

      const deletedItem = await table.get({
        pk: testItem.pk,
        sk: testItem.sk,
      });
      expect(deletedItem).toBeUndefined();
    });
  });

  describe("Query Operations", () => {
    beforeEach(async () => {
      await table.put(testItem).execute();
    });

    it("should get back 1 page of results for 8 items paged by 10", async () => {
      for (let i = 0; i < 8; i++) {
        await table.put({ ...testItem, pk: "USER#TEST", sk: `PROFILE#${i}` }).execute();
      }

      const paginator = table.query({ pk: "USER#TEST" }).limit(10).paginate();
      const page1 = await paginator.getPage();

      expect(page1.items).toHaveLength(8);
      expect(page1.nextPageToken).toBeUndefined();
    });

    it("should get back 3 pages of results for 20 items in DB paged by 10", async () => {
      for (let i = 0; i < 20; i++) {
        await table.put({ ...testItem, pk: "USER#TEST", sk: `PROFILE#${i}` }).execute();
      }

      // Ensure the 20 items are returned
      const insertCheck = await table
        .query({ pk: "USER#TEST", sk: { operator: "begins_with", value: "PROFILE#" } })
        .execute();

      expect(insertCheck).toHaveLength(20);

      const paginator = table.query({ pk: "USER#TEST" }).limit(10).paginate();
      const page1 = await paginator.getPage();

      expect(paginator.hasNextPage()).toBe(true);
      expect(page1.items).toHaveLength(10);
      expect(page1.nextPageToken).toBeDefined();

      const page2 = await paginator.getPage();

      // Since we're paginating by 10, we should get 10 items
      // and the next page token should be defined as we'd have loaded the very last item
      // in this page
      expect(page2.items).toHaveLength(10);
      expect(page2.nextPageToken).toBeDefined();
      expect(paginator.hasNextPage()).toBe(true);

      const page3 = await paginator.getPage();

      expect(page3.nextPageToken).toBeUndefined();
      expect(paginator.hasNextPage()).toBe(false);
    });

    it("should get back no results, when the filter doesn't match", async () => {
      const result = await table.query({ pk: testItem.pk }).where("type", "=", "APPLE").execute();

      expect(result).toHaveLength(0);
    });

    it("should query items by partition key", async () => {
      const result = await table
        .query({
          pk: testItem.pk,
          sk: testItem.sk,
        })
        .where("type", "=", "USER")
        .execute();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(testItem);
    });

    it("should query items with begins_with sort key", async () => {
      const result = await table
        .query({
          pk: testItem.pk,
          sk: { operator: "begins_with", value: "PROFILE#" },
        })
        .execute();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(testItem);
    });
  });

  describe("Scan Operations", () => {
    beforeEach(async () => {
      await table.put(testItem).execute();
    });

    it("should scan and filter items", async () => {
      const shouldBeExcluded = {
        pk: "USER#123",
        sk: "123",
        age: 24,
        type: "USER",
      };
      await table.put(shouldBeExcluded).execute();

      const noFilterShouldHaveTwoResults = await table.scan().whereEquals("type", "USER").execute();

      expect(noFilterShouldHaveTwoResults.Items).toBeDefined();
      expect(noFilterShouldHaveTwoResults.Items).toContainEqual(shouldBeExcluded);
      expect(noFilterShouldHaveTwoResults.Items).toContainEqual(testItem);

      const result = await table.scan().whereEquals("type", "USER").where("age", ">", 25).execute();

      expect(result.Items).toBeDefined();
      expect(result.Items).toContainEqual(testItem);
      expect(result.Items).not.toContainEqual(shouldBeExcluded);
    });
  });

  describe("Batch Operations", () => {
    const batchItems = [
      { ...testItem, pk: "USER#123", sk: "PROFILE#123" },
      { ...testItem, pk: "USER#124", sk: "PROFILE#124", name: "Jane Doe" },
    ];

    it("should perform batch write operations", async () => {
      await table.batchWrite(
        batchItems.map((item) => ({
          type: "put",
          item,
        })),
      );

      for (const item of batchItems) {
        const result = await table.get({ pk: item.pk, sk: item.sk });
        expect(result).toEqual(item);
      }

      await table.batchWrite(
        batchItems.map((item) => ({
          type: "delete",
          key: { pk: item.pk, sk: item.sk },
        })),
      );

      for (const item of batchItems) {
        const result = await table.get({ pk: item.pk, sk: item.sk });
        expect(result).toBeUndefined();
      }
    });
  });

  describe("Transaction Operations", () => {
    it("should rollback transaction on failure", async () => {
      const transaction = new TransactionBuilder();

      table.put({ ...testItem, id: "1" }).withTransaction(transaction);
      table
        .put({ id: "2" }) // Missing required fields
        .withTransaction(transaction);

      await expect(table.transactWrite(transaction)).rejects.toThrow();

      // This user should not exist if the transaction was rolled back
      const user = await table.get({
        pk: "USER#1",
        sk: "PROFILE#1",
      });
      expect(user).toBeUndefined();
    });

    it("should perform transactional writes (transactWrite)", async () => {
      const transaction = new TransactionBuilder();
      transaction
        .addOperation({
          put: {
            item: testItem,
          },
        })
        .addOperation({
          put: {
            item: { ...testItem, pk: "USER#124", sk: "PROFILE#124" },
          },
        });
      await table.transactWrite(transaction);

      const item1 = await table.get({ pk: testItem.pk, sk: testItem.sk });
      const item2 = await table.get({
        pk: "USER#124",
        sk: "PROFILE#124",
      });

      expect(item1).toEqual(testItem);
      expect(item2).toEqual({ ...testItem, pk: "USER#124", sk: "PROFILE#124" });
    });

    it("should perform transactional writes (withTransaction)", async () => {
      await table.withTransaction(async (trx) => {
        table.put(testItem).withTransaction(trx);
        table.put({ ...testItem, pk: "USER#124", sk: "PROFILE#124" }).withTransaction(trx);
      });

      const item1 = await table.get({ pk: testItem.pk, sk: testItem.sk });
      const item2 = await table.get({
        pk: "USER#124",
        sk: "PROFILE#124",
      });

      expect(item1).toEqual(testItem);
      expect(item2).toEqual({ ...testItem, pk: "USER#124", sk: "PROFILE#124" });
    });

    it("should handle transactional write failures", async () => {
      await expect(
        table.withTransaction(async (trx) => {
          table
            .put({
              item: testItem,
            })
            .withTransaction(trx);
          table
            .put({
              item: testItem, // Duplicate item to cause failure
            })
            .withTransaction(trx);
        }),
      ).rejects.toThrow();

      const item = await table.get({ pk: testItem.pk, sk: testItem.sk });
      expect(item).toBeUndefined();
    });
  });

  describe("Conditional Operations", () => {
    it("should handle conditional puts", async () => {
      // First put should succeed
      await table.put(testItem).whereNotExists("pk").whereNotExists("sk").execute();

      // Verify item was created
      const item = await table.get({ pk: testItem.pk, sk: testItem.sk });
      expect(item).toEqual(testItem);

      // Second put with same condition should fail
      await expect(
        table.put({ pk: testItem.pk, sk: testItem.sk, banana: true }).whereNotExists("pk").execute(),
      ).rejects.toThrow();

      // Verify item wasn't modified
      const unchangedItem = await table.get({
        pk: testItem.pk,
        sk: testItem.sk,
      });
      expect(unchangedItem).toEqual(testItem);
    });

    it("should handle conditional updates", async () => {
      await table.put(testItem).whereNotExists("pk").execute();

      // Verify item was created
      const item = await table.get({ pk: testItem.pk, sk: testItem.sk });
      expect(item).toEqual(testItem);

      // Update with matching condition should succeed
      await table.update({ pk: testItem.pk, sk: testItem.sk }).set("age", 20).whereEquals("age", 30).execute();

      // Verify update succeeded
      const updatedItem = await table.get({
        pk: testItem.pk,
        sk: testItem.sk,
      });

      expect(updatedItem?.age).toBe(20);

      // Update with non-matching condition should fail
      await expect(
        table
          .update({ pk: testItem.pk, sk: testItem.sk })
          .set("age", 32)
          .whereEquals("age", 30) // Incorrect age
          .execute(),
      ).rejects.toThrow();

      // Verify item wasn't modified
      const unchangedItem = await table.get({
        pk: testItem.pk,
        sk: testItem.sk,
      });
      expect(unchangedItem?.age).toBe(20);
    });
  });

  describe("Error Handling", () => {
    it("should handle conditional check failures gracefully", async () => {
      await table.put(testItem).execute();

      await expect(
        table
          .update({ pk: testItem.pk, sk: testItem.sk })
          .set("age", 40)
          .whereEquals("age", 99) // Incorrect condition
          .execute(),
      ).rejects.toThrow(ConditionalCheckFailedError);
    });

    it("should handle get back no results", async () => {
      await expect(table.get({ pk: "NONEXISTENT", sk: "ITEM" })).resolves.toBeUndefined();
    });

    it("should handle invalid attribute updates", async () => {
      await expect(
        table
          .update({ pk: testItem.pk, sk: testItem.sk })
          .set("", "invalid") // Empty attribute name
          .execute(),
      ).rejects.toThrow();
    });
  });

  describe("Query Edge Cases", () => {
    it("should handle empty query results", async () => {
      const result = await table.query({ pk: "NONEXISTENT" }).execute();
      expect(result).toHaveLength(0);
    });

    it("should handle malformed begins_with queries", async () => {
      await expect(
        table
          .query({
            pk: "TEST",
            sk: { operator: "begins_with", value: "" }, // Empty prefix
          })
          .execute(),
      ).rejects.toThrow();
    });

    it("should validate index names", () => {
      // @ts-expect-error - This is a test
      expect(() => table.query({ pk: "TEST" }).useIndex("NonexistentIndex")).toThrow(
        'Index "NonexistentIndex" is not configured for this table.',
      );
    });
  });

  describe("Dot Notations", () => {
    beforeEach(async () => {
      await table.put(testItem).execute();
    });

    it("should filter dinosaurs using dot notation (exclude items that match)", async () => {
      const nestedDino = {
        ...testItem,
        details: {
          habitat: {
            region: "Cretaceous Park",
            climate: "Tropical",
          },
        },
      };
      await table.put(nestedDino).execute();

      const result = await table
        .query<typeof nestedDino>({ pk: testItem.pk })
        .where("details.habitat.region", "=", "Cretaceous Park")
        .execute();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(nestedDino);
    });

    it("should filter dinosaurs using dot notation (return items that do not match)", async () => {
      const nestedDino = {
        ...testItem,
        details: {
          habitat: {
            region: "Cretaceous Park",
            climate: "Tropical",
          },
        },
      };
      await table.put(nestedDino).execute();

      const result = await table
        .query<typeof nestedDino>({ pk: testItem.pk })
        .where("details.habitat.region", "=", "Apple")
        .execute();

      expect(result).toHaveLength(0);
    });

    it("should update dinosaur habitats using dot notation", async () => {
      const nestedDino = {
        ...testItem,
        details: {
          habitat: {
            region: "Cretaceous Park",
            climate: "Tropical",
          },
        },
      };
      await table.put(nestedDino).execute();

      await table
        .update<typeof nestedDino>({ pk: testItem.pk, sk: testItem.sk })
        .set("details.habitat.region", "Jurassic Jungle")
        .execute();

      const updatedDino = await table.get({ pk: testItem.pk, sk: testItem.sk });
      expect(updatedDino?.details?.habitat?.region).toBe("Jurassic Jungle");
      // Assert that the attribute that wasn't updated is still the same
      expect(updatedDino?.details?.habitat?.climate).toBe("Tropical");
    });
  });
});
