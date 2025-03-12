import { beforeAll, describe, expect, it } from "vitest";
import type { Table } from "../table";
import { attributeNotExists, eq } from "../conditions";
import { createTestTable } from "./table-test-setup";

describe("Table Integration Tests - Transaction Operations", () => {
  let table: Table;

  beforeAll(() => {
    table = createTestTable();
  });

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
      queryResult.items.filter((item: Record<string, unknown>) => item.sk === "put#item" || item.sk === "update#item"),
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
      transaction.conditionCheck("TestTable", { pk: "transaction#test", sk: "condition#item" }, eq("status", "active"));

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
  });
});
