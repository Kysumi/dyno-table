import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { Table } from "../table";
import { eq, attributeExists, attributeNotExists } from "../conditions";
import { docClient } from "../../tests/ddb-client";

// Define test item type
type TestItem = {
  pk: string;
  sk: string;
  data?: string;
  status?: string;
  counter?: number;
  tags?: Set<string>;
};

describe("TransactionBuilder Integration Tests", () => {
  // Create DynamoDB client and table
  const table = new Table(docClient, {
    name: "TestTable",
    partitionKey: "pk",
    sortKey: "sk",
  });

  // Clean up test data before each test
  beforeEach(async () => {
    const queryResult = await table.query({ pk: "txn-cmd-test" }).execute();

    if (queryResult.items.length > 0) {
      const deletePromises = queryResult.items.map((item) =>
        table
          .delete({
            pk: item.pk as string,
            sk: item.sk as string,
          })
          .execute(),
      );
      await Promise.all(deletePromises);
    }
  });

  // Final cleanup after all tests
  afterAll(async () => {
    const queryResult = await table.query({ pk: "txn-cmd-test" }).execute();

    if (queryResult.items.length > 0) {
      const deletePromises = queryResult.items.map((item) =>
        table
          .delete({
            pk: item.pk as string,
            sk: item.sk as string,
          })
          .execute(),
      );
      await Promise.all(deletePromises);
    }
  });

  describe("Command-based transaction operations", () => {
    it("should execute a transaction with builder-generated commands", async () => {
      await table
        .put<TestItem>({
          pk: "txn-cmd-test",
          sk: "delete-item",
          data: "to be deleted",
        })
        .execute();

      await table
        .put<TestItem>({
          pk: "txn-cmd-test",
          sk: "update-item",
          data: "original data",
          status: "active",
        })
        .execute();

      const transaction = table.transactionBuilder();

      table
        .delete({
          pk: "txn-cmd-test",
          sk: "delete-item",
        })
        .withTransaction(transaction);

      // Condition check, only delete the above item if this items exist and
      table
        .conditionCheck({
          pk: "txn-cmd-test",
          sk: "update-item",
        })
        .condition((op) => op.and(op.attributeExists("pk"), op.eq("status", "active")))
        .withTransaction(transaction);

      // Execute the transaction
      await transaction.execute();

      // Verify results
      const queryResult = await table.query<TestItem>({ pk: "txn-cmd-test" }).execute();

      // Should have 1 item (update, delete should be gone)
      expect(queryResult.items.length).toBe(1);

      // Verify check condition item is present
      const updatedItem = queryResult.items.find((item) => item.sk === "update-item");
      expect(updatedItem).toBeDefined();

      // Verify deleted item is gone
      const deletedItem = queryResult.items.find((item) => item.sk === "delete-item");
      expect(deletedItem).toBeUndefined();
    });

    it("should roll back a transaction when a condition fails", async () => {
      // First create an item with a specific status
      await table
        .put<TestItem>({
          pk: "txn-cmd-test",
          sk: "condition-item",
          status: "active",
          data: "original data",
        })
        .execute();

      // Create a transaction
      const transaction = table.transactionBuilder();

      // Add a put operation that should succeed
      const putBuilder = table.put<TestItem>({
        pk: "txn-cmd-test",
        sk: "should-not-exist",
        data: "should not be created",
      });
      putBuilder.withTransaction(transaction);

      // Add a condition check that will fail
      const conditionBuilder = table.conditionCheck({
        pk: "txn-cmd-test",
        sk: "condition-item",
      });

      conditionBuilder
        .condition(eq("status", "inactive")) // This will fail because status is "active"
        .withTransaction(transaction);

      // Execute the transaction and expect it to fail
      try {
        await transaction.execute();
        // If we get here, the test should fail
        expect(true).toBe(false); // This should not execute
      } catch (error) {
        // Transaction should fail
        expect(error).toBeDefined();
      }

      // Verify that no items were created
      const queryResult = await table.query<TestItem>({ pk: "txn-cmd-test" }).execute();

      // Only the original item should exist
      expect(queryResult.items.length).toBe(1);

      // The item that should not exist should not be there
      const shouldNotExistItem = queryResult.items.find((item) => item.sk === "should-not-exist");
      expect(shouldNotExistItem).toBeUndefined();

      // The condition item should still have its original data
      const conditionItem = queryResult.items.find((item) => item.sk === "condition-item");
      expect(conditionItem).toBeDefined();
      expect(conditionItem?.status).toBe("active");
      expect(conditionItem?.data).toBe("original data");
    });

    it("should handle complex update operations in a transaction", async () => {
      // Create an item with a counter and tags
      await table
        .put<TestItem>({
          pk: "txn-cmd-test",
          sk: "complex-item",
          counter: 5,
          tags: new Set(["tag1", "tag2"]),
        })
        .execute();

      // Create a transaction
      const transaction = table.transactionBuilder();

      const updateBuilder = table
        .update<TestItem>({
          pk: "txn-cmd-test",
          sk: "complex-item",
        })
        .add("counter", 10)
        .deleteElementsFromSet("tags", ["tag1"])
        .set("status", "new status");

      updateBuilder.withTransaction(transaction);

      // Execute the transaction
      await transaction.execute();

      const result = await table
        .get<TestItem>({
          pk: "txn-cmd-test",
          sk: "complex-item",
        })
        .execute();

      const item = result.item;
      expect(item).toBeDefined();
      expect(item?.counter).toBe(15); // 5 + 10

      // Check tags - tag1 should be removed, tag3 should be added
      expect(item?.tags).toBeDefined();
      expect(item?.tags?.has("tag1")).toBe(false);
      expect(item?.tags?.has("tag2")).toBe(true);
      expect(item?.status).toBe("new status");
    });

    it("should support multiple condition checks in a transaction", async () => {
      // Create test items
      await Promise.all([
        table
          .put<TestItem>({
            pk: "txn-cmd-test",
            sk: "check-item-1",
            status: "active",
          })
          .execute(),
        table
          .put<TestItem>({
            pk: "txn-cmd-test",
            sk: "check-item-2",
            status: "active",
          })
          .execute(),
      ]);

      // Create a transaction
      const transaction = table.transactionBuilder();

      // Add multiple condition checks
      const check1 = table.conditionCheck({
        pk: "txn-cmd-test",
        sk: "check-item-1",
      });
      check1.condition(eq("status", "active")).withTransaction(transaction);

      const check2 = table.conditionCheck({
        pk: "txn-cmd-test",
        sk: "check-item-2",
      });
      check2.condition(eq("status", "active")).withTransaction(transaction);

      // Add a put operation that depends on both conditions
      const putBuilder = table.put<TestItem>({
        pk: "txn-cmd-test",
        sk: "dependent-item",
        data: "depends on conditions",
      });
      putBuilder.withTransaction(transaction);

      // Execute the transaction
      await transaction.execute();

      // Verify the dependent item was created
      const result = await table
        .get<TestItem>({
          pk: "txn-cmd-test",
          sk: "dependent-item",
        })
        .execute();

      expect(result.item).toBeDefined();
      expect(result.item?.data).toBe("depends on conditions");
    });
  });
});
