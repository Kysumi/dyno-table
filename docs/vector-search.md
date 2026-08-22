# DynamoDB vector search

dyno-table uses DynamoDB's native `SearchVectors` operation. Embeddings remain ordinary `number[]` attributes for writes; dyno-table does not generate embeddings or create indexes.

Requires Node.js 20+ and `@aws-sdk/client-dynamodb` / `@aws-sdk/lib-dynamodb` 3.1103.0 or newer.

## Configure and search

The configuration must mirror the deployed vector index exactly:

```ts
const table = new Table({
  client,
  tableName: "Products",
  indexes: {
    partitionKey: "pk",
    sortKey: "sk",
    vectorIndexes: {
      ProductEmbedding: {
        vectorAttribute: "embedding",
        dimensions: 1536,
        distanceFunction: "COSINE",
        partitionKey: "category",
        inlineFilters: ["brand", "status", "entityType"],
        projection: { type: "INCLUDE", attributes: ["productId", "title", "price"] },
      },
    },
  },
} as const);

const result = await table
  .searchVectors<Product>("ProductEmbedding", {
    vector: queryEmbedding,
    topK: 10,
    partition: "Electronics",
  })
  .filter((op) => op.and(op.eq("brand", "Acme"), op.eq("status", "ACTIVE")))
  .select(["productId", "title", "price"])
  .returnConsumedCapacity("TOTAL")
  .execute();

for (const { item, score } of result.matches) console.log(item.title, score);
```

Only equality joined with AND is exposed for inline filters. The configured HASH partition is required, added to the same storage-layer search condition, and is a routing/performance boundary—not an authorization boundary. `SearchVectors` has no pagination or consistent-read mode; results are approximate, eventually consistent, ordered by the service, limited to TopK 1–100, and capped at 16 MB.

The vector is excluded from returned items unless explicitly selected. KEYS_ONLY and INCLUDE configurations reject selections that are known not to be projected. `.debug()` includes the supplied vector and expression values; do not log it indiscriminately.

## Entities and collections

Repository searches inject the entity discriminator before ANN selection:

```ts
const matches = await ProductEntity.createRepository(table)
  .searchVectors("ProductEmbedding", {
    vector: queryEmbedding,
    topK: 10,
    partition: "Electronics",
  })
  .execute();
```

The discriminator must be the vector HASH or an INLINE_FILTER. If it is the HASH, the repository supplies the entity name and the caller does not pass `partition`.

Collection search fans out once per member because DynamoDB's equality-only condition cannot express multiple entity names. It merges by the configured score direction, preserves stable ties, trims to collection TopK, aggregates vector search bytes, and fails if any member request fails:

```ts
const result = await defineCollection({ entities: { Product: ProductEntity, Offer: OfferEntity } })
  .createReader(table)
  .searchVectors("ProductEmbedding", { vector: queryEmbedding, topK: 10, partition: "Electronics" })
  .execute();

console.log(result.matches, result.requestCount);
```

Collection and entity discriminator attribute names must agree.

## Writes and metering

Put, entity create/upsert, batch put, transaction put, and literal update SET validate configured vectors before sending: values must be dense arrays of exactly the configured dimensions containing only finite numbers. `ADD` and `DELETE` are rejected for vector attributes; `REMOVE` de-indexes the item. Values are not rounded to f32.

A missing vector HASH is valid DynamoDB behavior: the base write succeeds and the item is absent from that vector index. Require the HASH in your application schema when searchability is mandatory.

Request write metadata without changing normal `execute()` results:

```ts
const { item, consumedCapacity } = await table
  .put(product)
  .returnConsumedCapacity("INDEXES")
  .executeWithMetadata();
```

Batch results expose `writes.consumedCapacity`; transactions expose `executeWithMetadata()`. Per-index `VectorWriteRequestBytes` and search `VectorSearchRequestBytes` are preserved. Monitor the matching CloudWatch metrics; both have a 1 KB metering minimum, and representative production data is a better cost signal than dimensions alone.

## Provisioning and deployment

Provision vector indexes in CloudFormation, CDK, Terraform, or the AWS SDK—not through `Table`. Tables with vector indexes must use `PAY_PER_REQUEST`. A vector index defines `VectorAttribute`, `Dimensions`, `DistanceFunction`, `Projection`, and optional HASH/INLINE_FILTER `SearchSchema` elements. A table supports at most five; create/delete only one vector index at a time when updating an existing table.

Dimensions, search schema, and INCLUDE projection changes require replacement. For an embedding-model migration, add a second vector attribute/index, backfill it, probe real searches until ready, cut reads over, then remove the old index in a later deployment.

`ACTIVE` does not guarantee the search endpoint is immediately ready after backfill. Use bounded retry around a harmless known-vector probe and retry only `isVectorIndexNotReady(error)`, not every `ValidationException`.

IAM needs `dynamodb:SearchVectors` on the vector-index ARN:

```json
{
  "Effect": "Allow",
  "Action": "dynamodb:SearchVectors",
  "Resource": "arn:aws:dynamodb:REGION:ACCOUNT:table/Products/index/ProductEmbedding"
}
```

`dynamodb:LeadingKeys` and similar fine-grained-access condition keys do not apply to vector search. Enforce tenant authorization before calling the builder.

Vector indexes replicate with global tables, but replication and rankings converge asynchronously across Regions. DynamoDB Local ignores vector index definitions and cannot execute `SearchVectors`; DAX and PartiQL do not support it either. Use `pnpm test:vector:aws` with `DYNO_TABLE_VECTOR_AWS_TEST=1`, a real region, AWS credentials, and an optional safe `DYNO_TABLE_VECTOR_TEST_PREFIX` for release verification.

See the [DynamoDB vector search guide](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/VectorSearch.html) and [SearchVectors API](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_SearchVectors.html).
