import { describe, expect, it } from "vitest";
import { docClient } from "../../tests/ddb-client";
import { createTestTable } from "./table-test-setup";

const TableName = "TestTable";
const key = { demoPartitionKey: "dinosaur#batch-conditions", demoSortKey: "dino#1" };

/**
 * Proves the DynamoDB behaviour behind rejecting conditional builders in `withBatch()`:
 * BatchWriteItem has no condition support, so a guard placed on a batch write is never enforced.
 */
describe("DynamoDB batch writes and conditions", () => {
  it("has no condition field on BatchWriteItem requests, so an attempted guard is not enforced", async () => {
    await docClient.put({ TableName, Item: { ...key, name: "Original" } });

    await docClient.batchWrite({
      RequestItems: {
        [TableName]: [
          {
            PutRequest: {
              Item: { ...key, name: "Overwritten" },
              // @ts-expect-error PutRequest only accepts Item; the AWS API model has no ConditionExpression here
              ConditionExpression: "attribute_not_exists(demoPartitionKey)",
            },
          },
        ],
      },
    });

    // The insert-only guard would have failed, yet the batch write replaced the item.
    const { Item } = await docClient.get({ TableName, Key: key });
    expect(Item?.name).toBe("Overwritten");
  });

  it("enforces the same guard through TransactWriteItems", async () => {
    await docClient.put({ TableName, Item: { ...key, name: "Original" } });

    await expect(
      docClient.transactWrite({
        TransactItems: [
          {
            Put: {
              TableName,
              Item: { ...key, name: "Overwritten" },
              ConditionExpression: "attribute_not_exists(demoPartitionKey)",
            },
          },
        ],
      }),
    ).rejects.toMatchObject({ name: "TransactionCanceledException" });

    const { Item } = await docClient.get({ TableName, Key: key });
    expect(Item?.name).toBe("Original");
  });

  it("enforces a table.create() guard when the builder runs in a transaction instead of a batch", async () => {
    const table = createTestTable();
    await table.put({ ...key, name: "Original" }).execute();

    const transaction = table.transactionBuilder();
    table.create({ ...key, name: "Overwritten" }).withTransaction(transaction);
    await expect(transaction.execute()).rejects.toThrow();

    const { item } = await table.get({ pk: key.demoPartitionKey, sk: key.demoSortKey }).execute();
    expect(item?.name).toBe("Original");
  });
});
