import { describe, expect, it } from "vitest";
import { docClient } from "../../tests/ddb-client";
import { Table } from "../table";

/**
 * DynamoDB Local ignores vector index definitions and does not implement SearchVectors
 * (see docs/dynamodb-vector-search-plan.md, "DynamoDB Local" row). This test documents and
 * asserts that behavior explicitly, so a silently-ignored `vectorIndexes` config never gets
 * mistaken for working vector search in the local/CI suite. The opt-in AWS suite
 * (src/__tests__/vector-search.aws.test.ts) is what actually verifies SearchVectors behavior.
 */
describe("vector search on DynamoDB Local", () => {
  it("rejects SearchVectors because Local does not implement the operation", async () => {
    const table = new Table({
      client: docClient,
      tableName: "TestTable",
      indexes: {
        partitionKey: "demoPartitionKey",
        sortKey: "demoSortKey",
        vectorIndexes: {
          LocalEmbedding: {
            vectorAttribute: "embedding",
            dimensions: 3,
            distanceFunction: "COSINE",
            projection: { type: "ALL" },
          },
        },
      },
    });

    const error = await table
      .searchVectors("LocalEmbedding", { vector: [1, 0, 0], topK: 1 })
      .execute()
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(String(error.cause?.name ?? error.cause?.constructor?.name)).toBe("UnknownOperationException");
  });
});
