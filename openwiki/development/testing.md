---
type: development guide
title: Testing local DynamoDB and validation
description: Local development commands test topology DynamoDB Local setup and focused validation routes for dyno-table changes.
tags: [testing, development, dynamodb-local]
---

# Testing, local DynamoDB, and validation

The repository uses pnpm, Vitest, TypeScript, Biome, tsdown, and DynamoDB Local. `vitest.config.ts` includes `src/**/*.test.ts` and excludes `*.itest.ts`; `vitest.integration.ts` runs the integration suite. Use unit tests for command/type/lifecycle logic and integration tests to verify emitted requests against DynamoDB Local.

## Commands

| Intent | Command | Scope |
|---|---|---|
| Unit suite | `pnpm test` | `src/**/*.test.ts`, excluding integration files. |
| Watch unit suite | `pnpm test:w` | Unit test watch mode. |
| Integration suite | `pnpm test:int` | `*.itest.ts` under the integration Vitest config. |
| Start local services | `pnpm ddb:start` | Docker Compose DynamoDB Local plus optional admin UI. |
| Recreate test table | `pnpm local:setup` | Creates `TestTable` and its key/GSI schema. |
| Delete test table | `pnpm local:teardown` | Test-table cleanup. |
| Type check | `pnpm check-types` | `tsc --noEmit`. |
| Lint / formatting checks | `pnpm lint` / `pnpm format:check` | Biome. |
| Package build | `pnpm build` | tsdown ESM/CJS/declaration output. |

## Local service topology

`docker-compose.yml` runs DynamoDB Local in memory on host port `8897` and the DynamoDB admin interface on `8001`. `tests/ddb-client.ts` points the test DocumentClient to `http://localhost:8897`; its local credentials are test-only fixture values. `tests/setup-test-table.ts` recreates `TestTable` with composite `demoPartitionKey`/`demoSortKey` and GSI1/GSI2/GSI3 attribute layouts. This schema is test infrastructure, not a production migration.

Run integration work in this order:

```bash
pnpm ddb:start
pnpm local:setup
pnpm test:int
pnpm local:teardown
```

The CI integration workflow starts only the `dynamodb` service; its test setup creates the table. Local manual setup is useful for repeatable direct test runs and example experimentation.

## Test routing by change

| Change | Focused evidence | Minimum validation |
|---|---|---|
| Condition/expression compiler | `src/builders/__tests__/condition-check-builder.test.ts`, `query-builder.test.ts`, `in-operator.test.ts` | `pnpm test` |
| Query/iterator/pagination | query/scan builder tests; `table-query*.itest.ts` | `pnpm test`, then `pnpm test:int` |
| Write/update command rules | put/delete/update builder tests | `pnpm test` |
| Entity schema/query/keys/timestamps | `entity-queries.test.ts`, `entity-timestamps.test.ts`, `entity-index-update.test.ts` | `pnpm test`, `pnpm check-types` |
| Batch/transaction service behavior | `table-batch.itest.ts`, `table-transaction.itest.ts`, `transaction-builder.itest.ts` | local setup then `pnpm test:int` |
| Exports/declarations/build | package/entrypoint changes and standalone example | `pnpm check-types`, `pnpm build`, example `pnpm verify` |

Run broader checks for public API, Table runtime, or infrastructure changes. The CI and release pipelines are documented separately in [CI and release](ci-and-release.md).