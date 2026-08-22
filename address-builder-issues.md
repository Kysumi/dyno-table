# Fix batch option loss and retry unprocessed work

## Summary

Preserve projection and consistency settings on builder-based batch gets, and automatically retry DynamoDB `UnprocessedKeys`/`UnprocessedItems`.

Keep all existing result shapes. Retries default to five total attempts with full-jitter exponential backoff; exhausted work remains visible in the existing `unprocessed` fields.

## Public API

Add and export:

```ts
interface BatchExecutionOptions {
  /** Total attempts including the initial request. Default: 5. */
  maxAttempts?: number;
  /** Initial full-jitter backoff ceiling in milliseconds. Default: 25. */
  baseDelayMs?: number;
  /** Cancels backoff and in-flight DynamoDB requests. */
  abortSignal?: AbortSignal;
}
```

Accept it from:

```ts
batch.execute(options?: BatchExecutionOptions);

table.batchGet(keys, options?: BatchExecutionOptions);
table.batchWrite(operations, options?: BatchExecutionOptions);
```

> **Reviewer note — new call shape.** No existing builder takes an options argument directly on `execute()`: `PutBuilder`, `GetBuilder`, `UpdateBuilder`, and `DeleteBuilder` configure only through fluent setters, and `TransactionBuilder` takes options via a `.withOptions()` setter applied *before* a bare `.execute()` call (`table.transaction(callback, options)`, `src/table.ts:575-595`). `batch.execute(options)` is therefore new for this library. That's justified — retry policy is per-invocation, not persistent builder state, and it anticipates the gap-analysis doc's own future `ExecuteOptions` shape — but keep the field name `abortSignal` stable so that later common execution-options work can absorb it without a rename, and don't add a competing `.withOptions()` setter to `BatchBuilder` just to mimic `TransactionBuilder`.

Rules:

- `maxAttempts` must be a positive integer.
- `baseDelayMs` must be finite and non-negative.
- Invalid values throw `ConfigurationError`. Existing `ConfigurationErrors` factories (`src/utils/error-factory.ts:136-198`) each use one dedicated `ErrorCode` per rule (e.g. `invalidChunkSize` → `INVALID_CHUNK_SIZE`); the generic `INVALID_PARAMETER` code is defined but currently used by zero factories. Don't make this the first multi-purpose code — add `invalidMaxAttempts`/`invalidBaseDelayMs` factory functions to `ConfigurationErrors`, each with its own `ErrorCode` and the same `{ context, suggestion }` shape as `invalidChunkSize`.
- `maxAttempts: 1` restores the current single-request behavior.
- Retry exhaustion does not throw; only the final remainder is returned.
- Request exceptions retain the current `OperationError` behavior.
- Aborts reject with the signal’s reason and must not be converted into a partial-success result.

## Implementation instructions

1. Add the shared option type alongside existing batch operation types and re-export it from the main and builders entry points. Do not add a dependency or public retry framework.

2. Preserve complete batched get intent:

   - Extend the internal get command with its original projection paths, rather than attempting to reverse generated DynamoDB expressions.
   - Change the `BatchBuilder` get executor to pass complete get commands instead of reducing them to keys.
   - Normalize `consistentRead: false` and an omitted value as the same eventual-read setting.
   - Canonicalize projections as sorted, unique path arrays.
   - Group queued gets by canonical projection plus consistency setting.
   - Issue conflicting option groups as separate `BatchGetItem` requests; never silently weaken or merge their settings.
   - Continue chunking each compatible group at 100 keys.

3. Build each BatchGet request correctly:

   - Generate `ProjectionExpression` and `ExpressionAttributeNames` from the group’s projection paths.
   - Add the physical partition and sort-key attributes internally whenever a projection omitted them.
   - Set `ConsistentRead: true` only for consistent groups.
   - Correlate each returned item to its queued request using the physical key before removing internally added key attributes.
   - Preserve explicitly requested key fields, but remove keys added only for correlation.
   - Use the queued request metadata—not an item’s hard-coded `entityType` property—to populate existing `itemsByType` results. This is an internal correctness requirement, not a new ordered-result API.
   - Preserve the current flat item result and DynamoDB response ordering.
   - Share one low-level chunk/send/collect-unprocessed implementation between this grouped/projected path and the existing plain-key `Table.batchGet(keys, options)`/`batchWrite(operations, options)` entry points. Parameterize only how each request is built (plain `Keys` vs. group-with-projection/consistency); do not grow two independent `BatchGetItem`-issuing code paths.

4. Add one private retry mechanism in `table.ts`, shared by batch reads and writes:

   - Its attempt budget applies independently to each original chunk or compatible read group.
   - Attempt 1 sends the original request immediately.
   - Later attempts send only DynamoDB’s returned unprocessed subset.
   - Before retry attempt `n`, wait a full-jitter delay in: `0 <= delay < baseDelayMs * 2 ** (n - 2)`.
   - Stop immediately when the unprocessed collection is empty.
   - After `maxAttempts`, return only the final unresolved subset.
   - Pass `{ abortSignal }` as the AWS SDK request option for every request. Confirmed viable: `DynamoDBDocument.batchGet`/`batchWrite` accept `(input, options?: HttpHandlerOptions)` and `HttpHandlerOptions.abortSignal` exists (`@smithy/types`). No call site in `src/table.ts` currently passes a second argument to any `dynamoClient.*()` method, so this is the first use of that shape in the codebase — keep it scoped to batch reads/writes rather than reaching into get/put/query, since consistent cross-API cancellation is a separate, broader concern than this task.
   - Make the backoff wait abortable and remove its abort listener when the timer finishes.
   - Check for an already-aborted signal before every wait and request.
   - Do not retry thrown AWS errors; the AWS SDK already handles request-level retries.
   - Add a shared `isAbortError(error)` guard to `src/utils/error-utils.ts`, matching the existing `isConfigurationError()` convention. No abort-detection helper exists anywhere in `src/` today (zero matches for `AbortError`/`aborted`/`AbortSignal`) — this is new, and the retry loop and `BatchBuilder.execute()` (item 5) both need it.

5. Thread `BatchExecutionOptions` through `BatchBuilder.execute()`, its read/write executors, and the table closures.

   - Concrete bug to fix: `BatchBuilder.execute()`’s catch blocks (`src/builders/batch-builder.ts:419-460`) currently wrap *any* non-`BatchError`—including an abort—into a generic `BatchError` and push it into `errors`, then return a `TypedBatchResult` rather than reject. The "critical" rethrow check (`:463-469`) compares `unprocessed.length === totalItems.length`, but on this catch path `writeResults`/`getResults` still hold their zero-length initializers, so that check can never trigger. Left unfixed, an abort would silently produce a `success: false` partial result instead of rejecting.
   - Fix: in both the write and get catch blocks, check the new `isAbortError(error)` guard first and rethrow immediately, before the generic `BatchError`-wrapping/`errors.push` branch runs.
   - Because `executeWrites()` and `executeGets()` run strictly sequentially (writes fully finish before gets start; there is no `Promise.all`), also check `abortSignal?.aborted` before starting the get phase, so an abort landing between the two phases can’t let gets proceed.

6. Update documentation:

   - Document automatic retries, defaults, exhaustion behavior, and `maxAttempts: 1`.
   - Show `.select(...).consistentRead().withBatch(...)` preserving both options.
   - Replace the manual retry loop in `docs/error-handling.md` with configuration plus a final `unprocessedItems` check.
   - Mark only the option-loss and retry portions of DT-02 as addressed; leave ordered public results and duplicate-key validation open.

## Test plan

Rewrite the existing characterization tests in `src/__tests__/table-batch.test.ts` into regression tests:

- A projected consistent builder get sends `ProjectionExpression`, attribute names, and `ConsistentRead: true`.
- Physical keys added for correlation are absent from the returned projected item unless explicitly selected.
- Gets with identical normalized options share one request.
- Conflicting projections or consistency settings produce separate requests with the correct options.
- A partial BatchGet response is retried with only its unprocessed key, and items from every attempt are aggregated.
- A partial BatchWrite response is retried with only its unprocessed write.
- Exhaustion returns the final remainder and makes `BatchBuilder.success` false.
- Successful retry leaves no unprocessed work and makes `BatchBuilder.success` true.
- `maxAttempts: 1` makes exactly one request.
- Invalid option values fail before contacting DynamoDB, each with its own dedicated error code (not a single shared generic code).
- Aborting before execution makes no request.
- Aborting during backoff prevents the next request.
- Aborting after the write phase completes but before the get phase starts prevents any get request.
- An abort thrown mid-operation rejects `BatchBuilder.execute()` with the signal's reason; it does not appear inside the result's `errors` array or produce a `success: false` partial result.
- The signal is passed to in-flight AWS client calls.
- Fake timers and a fixed `Math.random()` value verify the exponential full-jitter delay ceilings.
- Existing 100-read and 25-write chunk boundaries still apply, with separate retry budgets per chunk.

Add one DynamoDB-local integration case to `table-batch.itest.ts`:

- Store a full item, batch-read it with `.select("name").consistentRead()`, and assert the returned item contains only `name`.
- Do not attempt an integration test for unprocessed work; local DynamoDB cannot produce it deterministically.

Validate with:

```sh
rtk pnpm test
rtk pnpm run check-types
rtk pnpm exec biome check src
rtk pnpm run test:int
```

## Assumptions and boundaries

- Automatic retry with five attempts and a 25 ms base delay is the chosen default.
- Existing unprocessed result fields remain the exhaustion signal; no new exception is introduced.
- No public ordered/correlated result collection is added.
- Duplicate-key validation and broader DT-02 ordering work remain out of scope.
- Preserve the existing user changes in `docs/README.md` and `docs/electrodb-dynamodb-gap-analysis.md`.
