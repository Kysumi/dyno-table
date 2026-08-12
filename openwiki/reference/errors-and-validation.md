---
type: error reference
title: Errors validation and failure handling
description: dyno-table error hierarchy machine codes validation timing and AWS failure wrapping for callers and maintainers.
tags: [errors, validation, resilience]
---

# Errors, validation, and failure handling

`src/errors.ts` provides a single catchable base, `DynoTableError`, with stable `code`, structured `context`, and optional original `cause`. Error factories in `src/utils/error-factory.ts` construct contextual instances; Table, builders, and entity preparation use them instead of exposing raw failures at their abstraction boundary.

## Error hierarchy

| Class | Meaning / main producers |
|---|---|
| `DynoTableError` | Base class with code/context/cause. |
| `ValidationError` / `EntityValidationError` | Standard Schema item/key/index/query-input validation; malformed builder input. |
| `OperationError` | AWS DocumentClient get/put/query/scan/delete/update/batch call failed after Table wrapping. |
| `TransactionError` | Empty/duplicate/unsupported/failed transaction. |
| `BatchError` | Empty/unsupported/failed batch; includes `operation` and `unprocessedItems`. |
| `ExpressionError` | Invalid condition AST or expression generation. |
| `ConfigurationError` | GSI/key/sort-key or other Table/builder configuration issue. |
| `EntityError`, `KeyGenerationError`, `IndexGenerationError` | Entity preparation and derived-index failures. |

`ErrorCodes` includes categories for key/index generation, schema/query validation, expression construction, operation execution, transactions, batches, and configuration. Handle `code` when behavior needs to survive error-class refactors; inspect `context` for entity/table/index/key/expression diagnostics.

## Validation timing is part of the API

Entity `create` and `upsert` are deliberately deferred: repository construction creates a placeholder Table builder, while `.execute()` validates the schema, creates timestamps/keys/GSI fields, and applies the item. Batch and transaction attachment uses synchronous preparation and rejects schemas that validate asynchronously. Entity semantic-query input has a `beforeExecute` guard; query/scan run it before returning an iterator, while batched gets run all registered guards before batch network work.

Builder checks occur when enough state exists: `UpdateBuilder` rejects undefined values at mutation time and no update actions during command generation; `ConditionCheckBuilder` rejects a missing condition; Batch/Transaction reject empty execution; Transaction detects duplicate table primary keys as items are added. Expression compiler checks AST shape before requests. These timing distinctions are relied upon by tests and should be maintained.

## AWS failure boundary and retry responsibility

Table converts underlying exceptions to `OperationError` with operation-specific context and original `cause`. Transaction builder wraps executor failure as `TransactionError`. DynamoDB conditional, cancellation, validation, throughput, and throttling classifications are not automatically retried. Public helper predicates such as `isConditionalCheckFailed`, `isTransactionCanceled`, and `isRetryableError` classify an error object's `name`; the retryable list is provisioned-throughput, throttling, request-limit, internal-server, and service-unavailable errors. See [utilities](utilities.md) for the exact helper surface.

Batch execution exposes unprocessed work rather than retrying it. Inspect `result.writes.unprocessed`, `result.reads.unprocessed`, and optional `errors`; do not treat `success: false` as an exception-only path. Transaction atomicity comes from DynamoDB: an unsuccessful transaction has no partial committed write.

## Maintainer checklist and evidence

When adding a failure mode, choose the appropriate class/code, create it through the centralized factory when applicable, include non-secret diagnostic context, preserve the underlying `Error` as cause, export required public types/helpers, and add an assertion for class/code/context/timing. Never put credentials or raw environment values in error contexts/docs.

Focused evidence: `entity-queries.test.ts` checks deferred entity/query validation; `entity-index-update.test.ts` checks derived-key failures; `update-builder.test.ts` checks undefined values; `condition-check-builder.test.ts` checks expression failures; transaction/batch integration tests check service-facing failures. Run `pnpm test`, and run `pnpm test:int` for DynamoDB behavior.