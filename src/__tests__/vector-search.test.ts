import type { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it, vi } from "vitest";
import type { Condition } from "../conditions.js";
import { defineCollection } from "../entity/collection.js";
import { createQueries, defineEntity } from "../entity/entity.js";
import { ErrorCodes, OperationError, ValidationError } from "../errors.js";
import type { StandardSchemaV1 } from "../standard-schema.js";
import { Table } from "../table.js";
import type { TableConfig, VectorIndexConfig } from "../types.js";
import { isVectorIndexNotReady } from "../utils/error-utils.js";

interface Product extends Record<string, unknown> {
  pk: string;
  sk: string;
  embedding: number[];
  category: string;
  brand: string;
  status: string;
  title: string;
  hidden?: string;
}

function setup(searchVectors = vi.fn().mockResolvedValue({ SearchResults: [] })) {
  const client = {
    searchVectors,
    put: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    batchWrite: vi.fn().mockResolvedValue({}),
    transactWrite: vi.fn().mockResolvedValue({}),
  };
  const config = {
    client: client as unknown as DynamoDBDocument,
    tableName: "Products",
    indexes: {
      partitionKey: "pk",
      sortKey: "sk",
      gsis: { Lookup: { partitionKey: "gsiPk", sortKey: "gsiSk" } },
      vectorIndexes: {
        ProductEmbedding: {
          vectorAttribute: "embedding",
          dimensions: 3,
          distanceFunction: "COSINE",
          partitionKey: "category",
          inlineFilters: ["brand", "status"],
          projection: { type: "INCLUDE", attributes: ["title"] },
        },
        GlobalEmbedding: {
          vectorAttribute: "embedding",
          dimensions: 3,
          distanceFunction: "DOT_PRODUCT",
          inlineFilters: ["brand"],
          projection: { type: "ALL" },
        },
        BrandEmbedding: {
          vectorAttribute: "embedding",
          dimensions: 3,
          distanceFunction: "EUCLIDEAN",
          partitionKey: "brand",
          inlineFilters: ["status"],
          projection: { type: "ALL" },
        },
        KeysOnlyEmbedding: {
          vectorAttribute: "embedding",
          dimensions: 3,
          distanceFunction: "COSINE",
          inlineFilters: ["status"],
          projection: { type: "KEYS_ONLY" },
        },
      },
    },
  } as const satisfies TableConfig;
  return { table: new Table(config), searchVectors, client };
}

const productSchema: StandardSchemaV1<Product> = {
  "~standard": { version: 1, vendor: "test", validate: (value) => ({ value: value as Product }) },
};

function makeProductEntity(name: string, entityTypeAttributeName = "brand") {
  return defineEntity({
    name,
    schema: productSchema,
    primaryKey: {
      name: "primary",
      partitionKey: "pk",
      sortKey: "sk",
      isReadOnly: false,
      generateKey: (item: Product) => ({ pk: item.pk, sk: item.sk }),
    },
    queries: {},
    settings: { entityTypeAttributeName },
  });
}

describe("vector search", () => {
  it("builds the native request and preserves rank, score, and capacity", async () => {
    const searchVectors = vi.fn().mockResolvedValue({
      SearchResults: [
        {
          Item: {
            pk: "p1",
            sk: "p1",
            title: "First",
            embedding: [1, 0, 0],
            gsiPk: "generated",
          },
          Score: 0.1,
        },
        { Item: { pk: "p2", sk: "p2", title: "Second", embedding: [0, 1, 0] }, Score: 0.2 },
      ],
      ConsumedCapacity: { VectorSearchRequestBytes: 1024 },
    });
    const { table } = setup(searchVectors);

    const result = await table
      .searchVectors<Product>("ProductEmbedding", {
        vector: [1, 0, 0],
        topK: 2,
        partition: "Shoes",
      })
      .filter((operator) => operator.and(operator.eq("brand", "Acme"), operator.eq("status", "ACTIVE")))
      .select("title")
      .returnConsumedCapacity("TOTAL")
      .execute();

    expect(searchVectors).toHaveBeenCalledWith({
      TableName: "Products",
      IndexName: "ProductEmbedding",
      SearchVector: [1, 0, 0],
      TopK: 2,
      SearchConditionExpression: "(#0 = :0 AND (#1 = :1 AND #2 = :2))",
      ProjectionExpression: "#3",
      ExpressionAttributeNames: { "#0": "category", "#1": "brand", "#2": "status", "#3": "title" },
      ExpressionAttributeValues: { ":0": "Shoes", ":1": "Acme", ":2": "ACTIVE" },
      ReturnConsumedCapacity: "TOTAL",
    });
    expect(result).toEqual({
      matches: [
        { item: { pk: "p1", sk: "p1", title: "First" }, score: 0.1 },
        { item: { pk: "p2", sk: "p2", title: "Second" }, score: 0.2 },
      ],
      consumedCapacity: { VectorSearchRequestBytes: 1024 },
    });
  });

  it("omits empty expression maps, excludes vectors by default, and supports findOne without mutation", async () => {
    const searchVectors = vi.fn().mockResolvedValue({
      SearchResults: [{ Item: { pk: "p1", sk: "p1", title: "First", embedding: [1, 0, 0] }, Score: 4 }],
    });
    const { table } = setup(searchVectors);
    const builder = table.searchVectors<Product>("GlobalEmbedding", { vector: [1, 0, 0], topK: 9 });

    expect(await builder.findOne()).toEqual({ item: { pk: "p1", sk: "p1", title: "First" }, score: 4 });
    await builder.execute();
    expect(searchVectors.mock.calls[0]?.[0]).toMatchObject({ TopK: 1 });
    expect(searchVectors.mock.calls[1]?.[0]).toEqual({
      TableName: "Products",
      IndexName: "GlobalEmbedding",
      SearchVector: [1, 0, 0],
      TopK: 9,
      SearchConditionExpression: undefined,
      ProjectionExpression: undefined,
      ExpressionAttributeNames: undefined,
      ExpressionAttributeValues: undefined,
      ReturnConsumedCapacity: undefined,
    });
  });

  it("fails invalid input, filters, projections, and malformed responses before casting", async () => {
    const { table, searchVectors } = setup(vi.fn().mockResolvedValue({ SearchResults: [{ Item: { pk: "p1" } }] }));
    expect(() => table.searchVectors("ProductEmbedding", { vector: [1, 2], topK: 1, partition: "Shoes" })).toThrowError(
      expect.objectContaining({ code: ErrorCodes.VECTOR_VALUE_INVALID }),
    );
    expect(() =>
      table.searchVectors("ProductEmbedding", { vector: [1, Number.NaN, 3], topK: 1, partition: "Shoes" }),
    ).toThrow(ValidationError);
    expect(() =>
      table.searchVectors("ProductEmbedding", { vector: [1, 2, 3], topK: 0, partition: "Shoes" }),
    ).toThrowError(expect.objectContaining({ code: ErrorCodes.VECTOR_TOP_K_INVALID }));

    const builder = table.searchVectors<Product>("ProductEmbedding", {
      vector: [1, 2, 3],
      topK: 1,
      partition: "Shoes",
    });
    expect(() => builder.filter(() => ({ type: "gt", attr: "brand", value: "Acme" }))).toThrowError(
      expect.objectContaining({ code: ErrorCodes.VECTOR_CONDITION_INVALID }),
    );
    expect(() => builder.select("hidden")).toThrowError(
      expect.objectContaining({ code: ErrorCodes.VECTOR_PROJECTION_INVALID }),
    );
    await expect(builder.execute()).rejects.toThrowError(
      expect.objectContaining({ code: ErrorCodes.VECTOR_RESPONSE_INVALID }),
    );
    expect(searchVectors).toHaveBeenCalledOnce();
  });

  it("validates vector configuration and every write entry point", async () => {
    const { table, client } = setup();
    const invalid = { pk: "p1", sk: "p1", embedding: [1, 2] };

    await expect(table.put(invalid).execute()).rejects.toThrowError(
      expect.objectContaining({ code: ErrorCodes.VECTOR_VALUE_INVALID }),
    );
    await expect(table.batchWrite([{ type: "put", item: invalid }])).rejects.toThrowError(
      expect.objectContaining({ code: ErrorCodes.VECTOR_VALUE_INVALID }),
    );
    await expect(table.update<Product>({ pk: "p1", sk: "p1" }).set("embedding", [1, 2]).execute()).rejects.toThrowError(
      expect.objectContaining({ code: ErrorCodes.VECTOR_VALUE_INVALID }),
    );
    await expect(table.transactionBuilder().put("Products", invalid).execute()).rejects.toThrowError(
      expect.objectContaining({ code: ErrorCodes.VECTOR_VALUE_INVALID }),
    );
    expect(client.put).not.toHaveBeenCalled();
    expect(client.batchWrite).not.toHaveBeenCalled();
    expect(client.update).not.toHaveBeenCalled();
    expect(client.transactWrite).not.toHaveBeenCalled();

    expect(
      () =>
        new Table({
          client: client as unknown as DynamoDBDocument,
          tableName: "Bad",
          indexes: {
            partitionKey: "pk",
            vectorIndexes: {
              Bad: {
                vectorAttribute: "embedding",
                dimensions: 0,
                distanceFunction: "COSINE",
                projection: { type: "KEYS_ONLY" },
              },
            },
          },
        }),
    ).toThrowError(expect.objectContaining({ code: ErrorCodes.VECTOR_INDEX_INVALID }));
  });

  it("preserves vector write capacity without changing normal execute results", async () => {
    const { table, client } = setup();
    const item = { pk: "p1", sk: "p1", embedding: [1, 2, 3] };
    const capacity = {
      TableName: "Products",
      VectorIndexes: { ProductEmbedding: { VectorWriteRequestBytes: 1024 } },
    };
    client.put.mockResolvedValueOnce({ ConsumedCapacity: capacity });
    client.batchWrite.mockResolvedValueOnce({ ConsumedCapacity: [capacity] });
    client.transactWrite.mockResolvedValueOnce({ ConsumedCapacity: [capacity] });

    const put = await table.put(item).returnConsumedCapacity("INDEXES").executeWithMetadata();
    await expect(table.put(item).execute()).resolves.toBeUndefined();
    const batch = await table.batchWrite([{ type: "put", item }], "INDEXES");
    const transaction = await table
      .transactionBuilder()
      .put("Products", item)
      .withOptions({ returnConsumedCapacity: "INDEXES" })
      .executeWithMetadata();

    expect(put).toEqual({ item: undefined, consumedCapacity: capacity });
    expect(batch.consumedCapacity).toEqual([capacity]);
    expect(transaction.consumedCapacity).toEqual([capacity]);
    expect(client.put.mock.calls[0]?.[0]).toMatchObject({ ReturnConsumedCapacity: "INDEXES" });
    expect(client.batchWrite.mock.calls[0]?.[0]).toMatchObject({ ReturnConsumedCapacity: "INDEXES" });
    expect(client.transactWrite.mock.calls[0]?.[0]).toMatchObject({ ReturnConsumedCapacity: "INDEXES" });
  });

  it("wraps SDK failures without retaining the query vector and classifies readiness narrowly", async () => {
    const cause = Object.assign(new Error("Vector index is backfilling and not ready"), {
      name: "ValidationException",
    });
    const { table } = setup(vi.fn().mockRejectedValue(cause));
    const error = await table
      .searchVectors("GlobalEmbedding", { vector: [1, 2, 3], topK: 1 })
      .execute()
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(OperationError);
    expect(error.context).toEqual({ tableName: "Products", indexName: "GlobalEmbedding", operation: "searchVectors" });
    expect(isVectorIndexNotReady(error)).toBe(true);
    expect(isVectorIndexNotReady(Object.assign(new Error("bad expression"), { name: "ValidationException" }))).toBe(
      false,
    );
  });

  it("scopes entity candidates before TopK and safely merges collection rank and capacity", async () => {
    const searchVectors = vi
      .fn()
      .mockResolvedValueOnce({
        SearchResults: [
          { Item: { pk: "a", sk: "a", title: "A", embedding: [1, 0, 0] }, Score: 1 },
          { Item: { pk: "b", sk: "b", title: "B", embedding: [1, 0, 0] }, Score: 3 },
        ],
        ConsumedCapacity: { VectorSearchRequestBytes: 1024 },
      })
      .mockResolvedValueOnce({
        SearchResults: [{ Item: { pk: "c", sk: "c", title: "C", embedding: [1, 0, 0] }, Score: 2 }],
        ConsumedCapacity: { VectorSearchRequestBytes: 2048 },
      });
    const { table } = setup(searchVectors);
    const schema: StandardSchemaV1<Product> = {
      "~standard": { version: 1, vendor: "test", validate: (value) => ({ value: value as Product }) },
    };
    const entity = (name: string) =>
      defineEntity({
        name,
        schema,
        primaryKey: {
          name: "primary",
          partitionKey: "pk",
          sortKey: "sk",
          isReadOnly: false,
          generateKey: (item: Product) => ({ pk: item.pk, sk: item.sk }),
        },
        queries: {},
        settings: { entityTypeAttributeName: "brand" },
      });
    const First = entity("First");
    const Second = entity("Second");

    const result = await defineCollection({ entities: { First, Second }, entityTypeAttributeName: "brand" })
      .createReader(table)
      .searchVectors("GlobalEmbedding", { vector: [1, 0, 0], topK: 2 })
      .returnConsumedCapacity("TOTAL")
      .execute();

    expect(searchVectors.mock.calls.map(([request]) => request.SearchConditionExpression)).toEqual([
      "#0 = :0",
      "#0 = :0",
    ]);
    expect(searchVectors.mock.calls.map(([request]) => request.ExpressionAttributeValues)).toEqual([
      { ":0": "First" },
      { ":0": "Second" },
    ]);
    expect(result).toEqual({
      matches: [
        { entity: "First", item: { pk: "b", sk: "b", title: "B" }, score: 3 },
        { entity: "Second", item: { pk: "c", sk: "c", title: "C" }, score: 2 },
      ],
      consumedCapacity: { VectorSearchRequestBytes: 3072 },
      requestCount: 2,
    });
  });

  it("rejects every invalid vector index configuration rule", () => {
    const { client } = setup();
    const mkIndex = (overrides: Partial<VectorIndexConfig> = {}): VectorIndexConfig => ({
      vectorAttribute: "embedding",
      dimensions: 3,
      distanceFunction: "COSINE",
      projection: { type: "ALL" },
      ...overrides,
    });
    const badConfig = (vectorIndexes: Record<string, VectorIndexConfig>) => () =>
      new Table({
        client: client as unknown as DynamoDBDocument,
        tableName: "Bad",
        indexes: { partitionKey: "pk", vectorIndexes },
      });
    const invalid = expect.objectContaining({ code: ErrorCodes.VECTOR_INDEX_INVALID });

    expect(
      badConfig({ A: mkIndex(), B: mkIndex(), C: mkIndex(), D: mkIndex(), E: mkIndex(), F: mkIndex() }),
    ).toThrowError(invalid);
    expect(
      badConfig({ TooManyFilters: mkIndex({ inlineFilters: Array.from({ length: 19 }, (_, i) => `f${i}`) }) }),
    ).toThrowError(invalid);
    expect(badConfig({ DuplicateFilters: mkIndex({ inlineFilters: ["brand", "brand"] }) })).toThrowError(invalid);
    expect(badConfig({ NestedAttribute: mkIndex({ partitionKey: "meta.category" }) })).toThrowError(invalid);
    expect(badConfig({ RoleOverlap: mkIndex({ partitionKey: "embedding" }) })).toThrowError(invalid);
    expect(
      badConfig({ DuplicateIncludes: mkIndex({ projection: { type: "INCLUDE", attributes: ["title", "title"] } }) }),
    ).toThrowError(invalid);
    expect(badConfig({ First: mkIndex(), Second: mkIndex({ dimensions: 4 }) })).toThrowError(invalid);
  });

  it("rejects out-of-range TopK, malformed vector values, and unsupported filter shapes", () => {
    const { table } = setup();

    expect(() =>
      table.searchVectors("ProductEmbedding", { vector: [1, 2, 3], topK: 101, partition: "Shoes" }),
    ).toThrowError(expect.objectContaining({ code: ErrorCodes.VECTOR_TOP_K_INVALID }));

    const sparse: number[] = new Array(3);
    sparse[0] = 1;
    sparse[2] = 3;
    expect(() => table.searchVectors("ProductEmbedding", { vector: sparse, topK: 1, partition: "Shoes" })).toThrowError(
      expect.objectContaining({ code: ErrorCodes.VECTOR_VALUE_INVALID }),
    );
    expect(() =>
      table.searchVectors("ProductEmbedding", {
        vector: [1, Number.POSITIVE_INFINITY, 3],
        topK: 1,
        partition: "Shoes",
      }),
    ).toThrowError(expect.objectContaining({ code: ErrorCodes.VECTOR_VALUE_INVALID }));

    const builder = table.searchVectors<Product>("ProductEmbedding", { vector: [1, 2, 3], topK: 1, partition: "Shoes" });
    const invalidCondition = expect.objectContaining({ code: ErrorCodes.VECTOR_CONDITION_INVALID });
    const unsupported: Condition[] = [
      { type: "or", conditions: [{ type: "eq", attr: "brand", value: "Acme" }] },
      { type: "not", condition: { type: "eq", attr: "brand", value: "Acme" } },
      { type: "in", attr: "brand", value: ["Acme"] },
      { type: "eq", attr: "meta.brand", value: "Acme" },
      { type: "eq", attr: "title", value: "Nope" },
    ];
    for (const condition of unsupported) {
      expect(() => builder.filter(() => condition)).toThrowError(invalidCondition);
    }
  });

  it("rejects selecting attributes a KEYS_ONLY index does not project", () => {
    const { table } = setup();
    const builder = table.searchVectors<Product>("KeysOnlyEmbedding", { vector: [1, 2, 3], topK: 1 });

    expect(() => builder.select("title")).toThrowError(
      expect.objectContaining({ code: ErrorCodes.VECTOR_PROJECTION_INVALID }),
    );
    expect(() => builder.select("status")).not.toThrow();
  });

  it("returns the vector attribute only when explicitly selected", async () => {
    const searchVectors = vi.fn().mockResolvedValue({
      SearchResults: [{ Item: { pk: "p1", sk: "p1", title: "First", embedding: [1, 0, 0] }, Score: 1 }],
    });
    const { table } = setup(searchVectors);

    const result = await table
      .searchVectors<Product>("GlobalEmbedding", { vector: [1, 0, 0], topK: 1 })
      .select(["title", "embedding"])
      .execute();

    expect(result.matches[0]?.item.embedding).toEqual([1, 0, 0]);
  });

  it("clones without sharing mutable state with the original builder", async () => {
    const searchVectors = vi.fn().mockResolvedValue({ SearchResults: [] });
    const { table } = setup(searchVectors);
    const original = table.searchVectors<Product>("ProductEmbedding", {
      vector: [1, 2, 3],
      topK: 5,
      partition: "Shoes",
    });

    const clone = original.clone();
    clone.filter((operator) => operator.eq("brand", "Acme"));
    clone.select("title");
    clone.returnConsumedCapacity("TOTAL");

    await original.execute();

    expect(searchVectors).toHaveBeenCalledWith(
      expect.objectContaining({
        SearchConditionExpression: "#0 = :0",
        ProjectionExpression: undefined,
        ReturnConsumedCapacity: undefined,
      }),
    );
  });

  it("propagates custom-query input validation (beforeExecute) to entity vector search", async () => {
    const { table } = setup();
    const inputSchema: StandardSchemaV1<{ vector: number[]; category: string }> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (value) => {
          const input = value as { vector: number[]; category: string };
          return input.category.length > 0 ? { value: input } : { issues: [{ message: "category is required" }] };
        },
      },
    };
    const entity = defineEntity({
      name: "Product",
      schema: productSchema,
      primaryKey: {
        name: "primary",
        partitionKey: "pk",
        sortKey: "sk",
        isReadOnly: false,
        generateKey: (item: Product) => ({ pk: item.pk, sk: item.sk }),
      },
      queries: {
        byEmbedding: createQueries<Product>()
          .input(inputSchema)
          .query(({ input, entity: scoped }) => scoped.searchVectors("GlobalEmbedding", { vector: input.vector, topK: 1 })),
      },
      settings: { entityTypeAttributeName: "brand" },
    });
    const repository = entity.createRepository(table);

    await expect(repository.query.byEmbedding({ vector: [1, 2, 3], category: "Shoes" }).execute()).resolves.toBeDefined();
    await expect(
      repository.query.byEmbedding({ vector: [1, 2, 3], category: "" }).execute(),
    ).rejects.toThrowError(expect.objectContaining({ code: ErrorCodes.QUERY_INPUT_VALIDATION_FAILED }));
  });

  it("throws before the request when the discriminator attribute is absent from the vector index schema", () => {
    const { table, searchVectors } = setup();
    const entity = makeProductEntity("Product", "entityType");
    const repository = entity.createRepository(table);

    expect(() => repository.searchVectors("GlobalEmbedding", { vector: [1, 2, 3], topK: 1 })).toThrowError(
      expect.objectContaining({ code: ErrorCodes.VECTOR_ENTITY_SCOPE_INVALID }),
    );
    expect(searchVectors).not.toHaveBeenCalled();
  });

  it("keeps collection tie-break order stable across members with equal scores", async () => {
    const searchVectors = vi
      .fn()
      .mockResolvedValueOnce({
        SearchResults: [{ Item: { pk: "a", sk: "a", title: "A", embedding: [1, 0, 0] }, Score: 2 }],
      })
      .mockResolvedValueOnce({
        SearchResults: [{ Item: { pk: "b", sk: "b", title: "B", embedding: [1, 0, 0] }, Score: 2 }],
      });
    const { table } = setup(searchVectors);
    const First = makeProductEntity("First");
    const Second = makeProductEntity("Second");

    const result = await defineCollection({ entities: { First, Second }, entityTypeAttributeName: "brand" })
      .createReader(table)
      .searchVectors("GlobalEmbedding", { vector: [1, 0, 0], topK: 2 })
      .execute();

    expect(result.matches.map((match) => match.entity)).toEqual(["First", "Second"]);
  });

  it("fails the whole collection search if any member search fails", async () => {
    const searchVectors = vi
      .fn()
      .mockResolvedValueOnce({
        SearchResults: [{ Item: { pk: "a", sk: "a", title: "A", embedding: [1, 0, 0] }, Score: 1 }],
      })
      .mockRejectedValueOnce(Object.assign(new Error("boom"), { name: "ValidationException" }));
    const { table } = setup(searchVectors);
    const First = makeProductEntity("First");
    const Second = makeProductEntity("Second");

    await expect(
      defineCollection({ entities: { First, Second }, entityTypeAttributeName: "brand" })
        .createReader(table)
        .searchVectors("GlobalEmbedding", { vector: [1, 0, 0], topK: 2 })
        .execute(),
    ).rejects.toThrow();
  });
});

// Compile-time contract fixtures.
const typed = setup().table;
const typedEntitySchema: StandardSchemaV1<Product> = {
  "~standard": { version: 1, vendor: "test", validate: (value) => ({ value: value as Product }) },
};
const typedRepository = defineEntity({
  name: "Product",
  schema: typedEntitySchema,
  primaryKey: {
    name: "primary",
    partitionKey: "pk",
    sortKey: "sk",
    isReadOnly: false,
    generateKey: (item: Product) => ({ pk: item.pk, sk: item.sk }),
  },
  queries: {},
  settings: { entityTypeAttributeName: "brand" },
}).createRepository(typed);
if (typed.tableName === "__typecheck__") {
  // @ts-expect-error unknown vector index
  typed.searchVectors("Missing", { vector: [1, 2, 3], topK: 1 });
  // @ts-expect-error configured HASH partition is required
  typed.searchVectors("ProductEmbedding", { vector: [1, 2, 3], topK: 1 });
  // @ts-expect-error an unpartitioned index rejects partition input
  typed.searchVectors("GlobalEmbedding", { vector: [1, 2, 3], topK: 1, partition: "x" });
  typed
    .searchVectors<Product>("ProductEmbedding", { vector: [1, 2, 3], topK: 1, partition: "Shoes" })
    // @ts-expect-error filters are restricted to configured inline attributes
    .filter((operator) => operator.eq("title", "Nope"));
  typedRepository.searchVectors("BrandEmbedding", { vector: [1, 2, 3], topK: 1 });
  // @ts-expect-error entity-scoped HASH is supplied automatically
  typedRepository.searchVectors("BrandEmbedding", { vector: [1, 2, 3], topK: 1, partition: "Acme" });
}
