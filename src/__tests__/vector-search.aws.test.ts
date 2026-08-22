import { randomUUID } from "node:crypto";
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient, waitUntilTableExists } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { VectorSearchResult } from "../builders/vector-search-builder.js";
import { Table } from "../table.js";
import { isVectorIndexNotReady } from "../utils/error-utils.js";

const enabled = process.env.DYNO_TABLE_VECTOR_AWS_TEST === "1";
const prefix = process.env.DYNO_TABLE_VECTOR_TEST_PREFIX ?? "dyno-table-vector-test";
const region = process.env.AWS_REGION ?? "us-east-1";
const tableName = `${prefix}-${randomUUID().slice(0, 8)}`;
const client = new DynamoDBClient({ region });
const document = DynamoDBDocument.from(client);
let created = false;
let table: Table;

const vectorIndexes = {
  Cosine: {
    vectorAttribute: "embedding",
    dimensions: 3,
    distanceFunction: "COSINE",
    partitionKey: "category",
    inlineFilters: ["status"],
    projection: { type: "ALL" },
  },
  Euclidean: {
    vectorAttribute: "embedding",
    dimensions: 3,
    distanceFunction: "EUCLIDEAN",
    partitionKey: "category",
    inlineFilters: ["status"],
    projection: { type: "ALL" },
  },
  DotProduct: {
    vectorAttribute: "embedding",
    dimensions: 3,
    distanceFunction: "DOT_PRODUCT",
    partitionKey: "category",
    inlineFilters: ["status"],
    projection: { type: "ALL" },
  },
} as const;

describe.skipIf(!enabled)("DynamoDB vector search (real AWS)", () => {
  beforeAll(async () => {
    if (!/^dyno-table-vector-test(?:-[a-z0-9-]+)?$/.test(prefix)) {
      throw new Error("DYNO_TABLE_VECTOR_TEST_PREFIX must start with dyno-table-vector-test");
    }
    await client.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: [
          { AttributeName: "pk", AttributeType: "S" },
          { AttributeName: "sk", AttributeType: "S" },
        ],
        KeySchema: [
          { AttributeName: "pk", KeyType: "HASH" },
          { AttributeName: "sk", KeyType: "RANGE" },
        ],
        VectorIndexes: Object.entries(vectorIndexes).map(([IndexName, index]) => ({
          IndexName,
          VectorAttribute: { AttributeName: index.vectorAttribute },
          Dimensions: index.dimensions,
          DistanceFunction: index.distanceFunction,
          SearchSchema: [
            { AttributeName: index.partitionKey, SearchSchemaElementType: "HASH" },
            ...index.inlineFilters.map((AttributeName) => ({
              AttributeName,
              SearchSchemaElementType: "INLINE_FILTER" as const,
            })),
          ],
          Projection: { ProjectionType: "ALL" },
        })),
      }),
    );
    created = true;
    await waitUntilTableExists({ client, maxWaitTime: 600 }, { TableName: tableName });
    table = new Table({
      client: document,
      tableName,
      indexes: { partitionKey: "pk", sortKey: "sk", vectorIndexes },
    });

    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        await table.searchVectors("Cosine", { vector: [1, 0, 0], topK: 1, partition: "test" }).execute();
        return;
      } catch (error) {
        if (!isVectorIndexNotReady(error)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
    }
    throw new Error("Vector index search endpoint did not become ready within five minutes");
  }, 660_000);

  afterAll(async () => {
    if (created) await client.send(new DeleteTableCommand({ TableName: tableName }));
  }, 120_000);

  it("verifies ranking, filters, projection, visibility, and capacity", async () => {
    const exactWrite = await table
      .put({ pk: "exact", sk: "exact", category: "test", status: "ACTIVE", embedding: [1, 0, 0] })
      .returnConsumedCapacity("INDEXES")
      .executeWithMetadata();
    await Promise.all([
      table.put({ pk: "near", sk: "near", category: "test", status: "ACTIVE", embedding: [0.8, 0.2, 0] }).execute(),
      table.put({ pk: "far", sk: "far", category: "test", status: "INACTIVE", embedding: [-1, 0, 0] }).execute(),
      table.put({ pk: "unindexed", sk: "unindexed", status: "ACTIVE", embedding: [1, 0, 0] }).execute(),
    ]);
    expect(exactWrite.consumedCapacity?.VectorIndexes?.Cosine?.VectorWriteRequestBytes).toBeGreaterThan(0);
    expect(() =>
      table.put({ pk: "bad", sk: "bad", category: "test", status: "ACTIVE", embedding: [1, 0] }).debug(),
    ).toThrow();

    let cosine: VectorSearchResult<Record<string, unknown>> | undefined;
    for (let attempt = 0; attempt < 60; attempt++) {
      cosine = await table
        .searchVectors("Cosine", { vector: [1, 0, 0], topK: 3, partition: "test" })
        .filter((operator) => operator.eq("status", "ACTIVE"))
        .select(["pk", "status", "embedding"])
        .returnConsumedCapacity("TOTAL")
        .execute();
      if (cosine.matches.length === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }

    expect(cosine?.matches.map(({ item }) => item.pk)).toEqual(["exact", "near"]);
    expect(cosine?.matches[0]?.item.embedding).toEqual([1, 0, 0]);
    expect(cosine?.matches[0]?.score).toBeLessThanOrEqual(cosine?.matches[1]?.score ?? Number.POSITIVE_INFINITY);
    expect(cosine?.consumedCapacity?.VectorSearchRequestBytes).toBeGreaterThan(0);

    const euclidean = await table
      .searchVectors("Euclidean", { vector: [1, 0, 0], topK: 3, partition: "test" })
      .execute();
    const dot = await table.searchVectors("DotProduct", { vector: [1, 0, 0], topK: 3, partition: "test" }).execute();
    expect(euclidean.matches[0]?.item.pk).toBe("exact");
    expect(dot.matches[0]?.item.pk).toBe("exact");
    expect(dot.matches[0]?.score).toBeGreaterThanOrEqual(dot.matches[1]?.score ?? Number.NEGATIVE_INFINITY);
    expect(euclidean.matches.some(({ item }) => item.pk === "unindexed")).toBe(false);
  }, 180_000);
});
