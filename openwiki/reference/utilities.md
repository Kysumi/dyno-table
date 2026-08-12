---
type: utility reference
title: Utilities key templates debugging and error helpers
description: The public utility contracts for DynamoDB key templates readable command diagnostics and error classification context helpers.
tags: [utilities, debugging, key-design]
---

# Utilities: key templates, debugging, and error helpers

The published `dyno-table/utils` entrypoint (`src/utils.ts`) exposes `partitionKey` and `sortKey`; the root package also exports error helpers from `src/utils/error-utils.ts`. Debug renderers are consumed by builder `.debug()` methods rather than directly re-exported from the root entrypoint. These small functions are compatibility-sensitive because applications may embed their output into durable DynamoDB key layouts and observability paths.

## Template key factories

`partitionKey` is a tagged-template factory. Placeholder names become required string properties in the returned function's argument. It concatenates each static segment and supplied property, making complete key formats explicit and type checked.

```ts
const pk = partitionKey`country#${"country"}#enclosure#${"enclosure"}`;
pk({ country: "NZ", enclosure: "A1" });
```

`sortKey` is also tagged-template based but accepts optional incremental parameters. With no input it returns only the static prefix before the first placeholder; with a partial object it appends provided placeholder values and their following static segments, skipping absent placeholders. Values may be strings or numbers. This supports sort-key prefix queries as well as full key generation. Do not change this missing-value behavior without a compatibility test: `sortKey` intentionally differs from `partitionKey`.

## Readable debug rendering

`debugCommand` (`src/utils/debug-expression.ts`) receives a command containing condition/update/filter/key/projection expressions and alias maps, returning `{ raw, readable }`. It replaces attribute aliases with field names and value aliases with JSON-formatted values; JavaScript `Set`s receive a `Set(n){...}` display. `PutBuilder`, `DeleteBuilder`, and `UpdateBuilder` expose builder-level `.debug()` using this convention; `TransactionBuilder.debug()` delegates to `debug-transaction.ts` for its item list.

Debugging describes generated command data, not an execution trace, and must not be treated as a secure logging redaction layer. Consumers own what they log.

## Error helper API

`error-utils.ts` exports AWS-name classifiers: conditional-check failure, transaction cancellation, validation exception, provisioned-throughput exceeded, and `isRetryableError`. The retryable classification is an explicit name list: `ProvisionedThroughputExceededException`, `ThrottlingException`, `RequestLimitExceeded`, `InternalServerError`, and `ServiceUnavailable`.

It also exports AWS code/message extraction, `extractRequiredAttributes` (best-effort regex parsing from error text), recursive/truncating `formatErrorContext`, `getErrorSummary`, and guards for `DynoTableError` and each named library subtype. These helpers classify/format only; they do not retry requests or alter errors. See [errors and validation](errors-and-validation.md) for the owning error taxonomy and retry boundary.

## Change surface and tests

Key-template changes affect consumer key layout and therefore must retain/add `src/utils/__tests__/` coverage and run `pnpm run check-types`. Debug renderer changes should validate raw/readable output through the builder debug tests, notably `src/builders/__tests__/update-builder.test.ts`. Error-helper changes need tests for name matching and non-error inputs, and should be reviewed with their root export in `src/index.ts`. The index-template behavior is also exercised indirectly by the entity index/update tests described in [entity lifecycle](../entities/indexes-and-lifecycle.md).