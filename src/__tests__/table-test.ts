import { beforeAll, describe, expect, it, beforeEach } from "vitest";
import { Table } from "../table";
import { ConditionalCheckFailedError, DynamoError } from "../errors/dynamo-error";
import { docClient } from "../../tests/ddb-client";

export const tableSuite = () =>
  describe("Table Integration Tests", () => {
    let table: Table;

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
        tableIndexes: {
          primary: {
            pkName: "pk",
            skName: "sk",
          },
          GSI1: {
            pkName: "GSI1PK",
            skName: "GSI1SK",
          },
        },
      });
    });

    beforeEach(async () => {
      // Clean up any existing data before each test
      try {
        await table.delete({ pk: testItem.pk, sk: testItem.sk });
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
          }));

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

        await table.delete({ pk: testItem.pk, sk: testItem.sk });

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

      it("should get back no results, when the filter doesn't match", async () => {
        const result = await table.query({ pk: testItem.pk }).where("type", "=", "APPLE").execute();

        expect(result.Items).toHaveLength(0);
      });

      it("should query items by partition key", async () => {
        const result = await table
          .query({
            pk: testItem.pk,
            sk: testItem.sk,
          })
          .where("type", "=", "USER")
          .execute();

        expect(result.Items).toHaveLength(1);
        expect(result.Items?.[0]).toEqual(testItem);
      });

      it("should query items with begins_with sort key", async () => {
        const result = await table
          .query({
            pk: testItem.pk,
            sk: { operator: "begins_with", value: "PROFILE#" },
          })
          .execute();

        expect(result.Items).toHaveLength(1);
        expect(result.Items?.[0]).toEqual(testItem);
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
      it("should perform transactional writes", async () => {
        await table.transactWrite([
          {
            put: {
              item: testItem,
            },
          },
          {
            put: {
              item: { ...testItem, pk: "USER#124", sk: "PROFILE#124" },
            },
          },
        ]);

        const item1 = await table.get({ pk: testItem.pk, sk: testItem.sk });
        const item2 = await table.get({
          pk: "USER#124",
          sk: "PROFILE#124",
        });

        expect(item1).toEqual(testItem);
        expect(item2).toEqual({ ...testItem, pk: "USER#124", sk: "PROFILE#124" });
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

        expect(result.Items).toHaveLength(0);
        expect(result.Count).toBe(0);
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

      it("should validate index names", async () => {
        await expect(table.query({ pk: "TEST" }).useIndex("NonexistentIndex").execute()).rejects.toThrow(DynamoError);
      });
    });
  });
