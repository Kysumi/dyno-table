---
type: API reference
title: Public API and package contracts
description: Published dyno-table entrypoints runtime configuration types and build artifacts that form the consumer compatibility surface.
tags: [api, packaging, typescript]
---

# Public API and package contracts

`package.json` defines an ESM package with CJS compatibility and declarations. `tsdown.config.ts` builds nine named entrypoints from `src/` to `dist/` in ESM (`.js`), CJS (`.cjs`), and `.d.ts` forms. Treat an export or type change as a consumer-facing compatibility change.

## Published import map

| Package import | Source entry | Primary purpose |
|---|---|---|
| `dyno-table` | `src/index.ts` | Broad surface: Table, common builders, conditions, entity definition helpers/types, errors, error utilities, and key templates. |
| `dyno-table/table` | `src/table.ts` | `Table` module. |
| `dyno-table/entity` | `src/entity.ts` | `defineEntity`, `createIndex`, `createQueries`, entity/repository/query types. |
| `dyno-table/migration` | `src/migration.ts` | `MigrationManager` and migration/checkpoint/cursor types for repository-based resumable backfills. See [resumable migrations](../migration-system.md). |
| `dyno-table/conditions` | `src/conditions.ts` | Condition AST helpers and condition/key types. |
| `dyno-table/builders` | `src/builders.ts` | All builder classes plus command/result/path interfaces. |
| `dyno-table/types` | `src/types.ts` | `DynamoItem`, `Index`, `IndexConfig`, `TableConfig`, and `GSINames`. |
| `dyno-table/standard-schema` | `src/standard-schema.ts` | Standard Schema v1 contract and inference types. |
| `dyno-table/utils` | `src/utils.ts` | Template helpers; the root additionally re-exports error helpers. See [utilities](utilities.md). |

The root is curated, not a wildcard re-export. For example `GetBuilder`, `ScanBuilder`, `Paginator`, and `ResultIterator` are available through `./builders`, while root exports selected query/write/batch/transaction builders. Match a new public symbol to the intended import path deliberately.

## Core configuration contracts

```ts
interface TableConfig {
  client: DynamoDBDocument;
  tableName: string;
  indexes: {
    partitionKey: string;
    sortKey?: string;
    gsis?: Record<string, Index>;
  };
}
```

`DynamoItem` is `{ [key: string]: unknown }`. `Index` names physical key attributes and may carry a key generator/read-only flag; `TableConfig` uses the physical names to translate logical `{ pk, sk }` operation inputs. `StandardSchemaV1` exposes a `~standard` object with version `1`, vendor, a possibly async validator, and optional inferred input/output types. Entity write attachment has an intentional sync-only restriction detailed in [entity lifecycle](../entities/indexes-and-lifecycle.md).

The package declares `@aws-sdk/client-dynamodb` and `@aws-sdk/lib-dynamodb` as peer dependencies. Consumers create their own `DynamoDBClient`/`DynamoDBDocument` and pass the latter to Table; the package does not ship credentials or service configuration.

## Public extension checklist

For a new public capability, update all applicable parts:

1. implementation and stable types under `src/`;
2. intended subpath aggregator and root export (if root-facing);
3. `tsdown.config.ts` if it needs a new published subpath;
4. `package.json` `exports` and `typesVersions` for that subpath;
5. narrow unit test plus an integration consumer/test when it affects AWS behavior;
6. docs/examples when the supported seam changes.

Then run `pnpm run build`, `pnpm run check-types`, and `pnpm test`. The `examples/entity-example` package imports `dyno-table` by `file:../../` and provides a downstream TypeScript compatibility check; see [consumer integration](../examples/consumer-integration.md).

## Boundaries

Source modules contain many internal helpers but path existence does not make them public. Do not ask consumers to import generated `dist` files directly. Build output is disposable (`tsdown` uses `clean: true`); source entrypoints and package exports are authoritative. Release and publication mechanics are documented in [CI and release](../development/ci-and-release.md).