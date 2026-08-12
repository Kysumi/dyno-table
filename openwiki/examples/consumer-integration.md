---
type: consumer guide
title: Example applications and downstream integration
description: Executable consumers that demonstrate Table configuration entity integration key design and local DynamoDB behavior.
tags: [examples, integration, consumers]
---

# Example applications and downstream integration

The `examples/` directory is consumer evidence, not library runtime code. It shows how downstream applications wire AWS clients, Tables, entity schemas, keys, pagination, and bulk operations. Keep examples compiling when public imports or inferred types change.

## Root examples

`examples/db-client.ts` is a shared local DynamoDB client setup. `examples/gsi-example.ts` demonstrates configured global secondary indexes. `examples/multi-example.ts` is the most complete direct-Table consumer:

- declares a `DinoTableConfig` extending `TableConfig`, including named `GSI1`/`GSI2` key layouts;
- constructs `DynamoDBClient`, wraps it with `DynamoDBDocument`, then creates `Table<DinoTableConfig>`;
- models literal key types and derives padded age sort keys to preserve lexicographic ordering;
- seeds 2,000 unique records with `batchWrite` (therefore exercises Table-side chunking);
- queries a GSI with paginator-driven cleanup, queries a primary key with sort-key equality/prefix alternatives, and scans with projections/limits/pages.

All root examples target local DynamoDB at port `8897` with local development credentials. Start it with `pnpm ddb:start`, then create compatible test infrastructure if the example expects `TestTable`; see [testing](../development/testing.md). They are scripts and do not constitute automated root tests.

## Standalone entity example

`examples/entity-example` is separately installable package `jurassic-park-nodejs`. Its `package.json` consumes the local library via `"dyno-table": "file:../../"`, AWS SDK peer dependencies, Zod, TypeScript, and tsx. Its source splits into:

| File | Consumer responsibility |
|---|---|
| `src/ddb-table.ts` | AWS DocumentClient and Table configuration. |
| `src/dinosaur-entity.ts` | Zod-backed entity schema, `createIndex` key definitions, GSI mapping, and query definitions. |
| `src/index.ts` | Executable repository operations demonstrating the integrated app flow. |

It has `start`, `build`, standard type checking, portable type checking, and `verify` scripts. Its Docker Compose file is its own local service setup. Run it from its directory with its package manager commands, especially `pnpm verify`, after changing public entity/table types. Do not assume it runs as part of root `pnpm test`.

## Change-validation role

Examples are a narrow downstream compatibility check for public import paths, TableConfig inference, entity Standard Schema interoperability, and generated command APIs. When changing an API used here, update the example intentionally or preserve the old API; then run root type/build checks and the example's `verify`. For canonical runtime semantics, link changes to [Table operations](../table/operations.md), [entity repositories](../entities/repositories.md), and [public API](../reference/public-api.md), rather than duplicating the full API reference here.