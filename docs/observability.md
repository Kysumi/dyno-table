# Observability

Configure `plugins` on `Table` to observe every physical DynamoDB request it sends. Because the Entity layer always delegates to `Table`, plugins configured once cover entity repositories too.

```typescript
import { Table, type TablePlugin } from 'dyno-table';

const logger: TablePlugin = {
  name: 'logger',
  onRequestStart(event) {
    console.log(`[dynamo] → ${event.operation} ${event.tableName}`);
  },
  onRequestEnd(event) {
    console.log(`[dynamo] ← ${event.operation} ${event.tableName} in ${event.durationMs.toFixed(1)}ms`, {
      error: 'error' in event ? event.error : undefined,
    });
  },
};

const table = new Table({ client, tableName: 'Dinosaurs', indexes: { partitionKey: 'pk', sortKey: 'sk' }, plugins: [logger] });
```

`plugins` is a list, so logging, tracing, and metrics can remain separate:

```typescript
const table = new Table({
  client, tableName: 'Dinosaurs', indexes: { partitionKey: 'pk', sortKey: 'sk' },
  plugins: [logger, tracingPlugin, metricsPlugin],
});
```

## What fires, and when

`onRequestStart` and `onRequestEnd` fire once per **physical** request sent to DynamoDB, not once per builder call. A query fires a pair per page. Batch writes and gets fire a pair per 25/100-item chunk, including retries.

Hooks may be synchronous or asynchronous. dyno-table awaits them in plugin registration order. A plugin can return state from `onRequestStart`; its `onRequestEnd` receives that state for the same physical request. State is kept separate across plugins and concurrent requests. Every eligible end hook runs even if an earlier end hook fails.

- `RequestEvent` (passed to `onRequestStart`, and as the base of the `onRequestEnd` payload): `operation`, `tableName`, `entityNames`, `params`, a snapshot of the command input sent to the AWS SDK Document Client, already resolved with no `#alias` or `:alias` placeholders to decode.
- `RequestResult` (passed to `onRequestEnd`): adds `durationMs`, plus `result` on success or `error` on failure (the original error, before it's wrapped in a `DynoTableError` subclass).

`params` and `result` are typed per `operation` — narrow on it and TypeScript gives you the matching `@aws-sdk/lib-dynamodb` `*CommandInput`/`*CommandOutput` shape, not `unknown`:

```typescript
onRequestStart(event) {
  if (event.operation === "query") {
    event.params.KeyConditionExpression; // typed, no cast needed
  }
},
```

## Which entities fired a request

`entityNames` tells you which `defineEntity` repositories a request came from, so you can log or group by entity instead of just by table:

```typescript
onRequestStart(event) {
  console.log(`[dynamo] → ${event.operation} [${event.entityNames.join(", ") || "raw table call"}]`);
},
```

It's an array because a transaction, batch, or collection query can involve more than one entity. A request touching `Order`, `Inventory`, and `Payment` reports `entityNames: ["Inventory", "Order", "Payment"]`. Direct `Table` calls and requests that cannot be attributed report `[]`.

Plugins receive snapshots of `params` and successful `result` values. Plain objects, arrays, maps, sets, and binary values are copied recursively, so mutations to those copied containers cannot affect the AWS request or the value returned to the caller. Class instances, including custom `wrapNumbers` results, are retained by identity to preserve their prototypes and behavior. These instances are shared with the request or returned result, so treat them as read-only. Mutating one from a hook changes the original instance.

Snapshotting costs CPU and memory for large payloads. With no plugins, dyno-table skips all hook and snapshot work; start-only plugins do not cause successful results to be copied.

Plugin failures are isolated from the database operation:

- A start-hook failure is reported to that plugin's optional `onError` callback. The plugin is skipped for the rest of this request, remaining plugins start normally, and the DynamoDB request continues.
- An end-hook failure is reported to that plugin's optional `onError` callback. Remaining end hooks still run.
- Errors from `onError` itself are ignored.
- The DynamoDB operation resolves or rejects based only on its own outcome, so an unavailable telemetry backend cannot make a successful write appear to fail.

Plugins are observers. They cannot rewrite, cancel, or short-circuit a request.

```typescript
const plugin: TablePlugin = {
  name: 'metrics',
  onRequestEnd(event) {
    metrics.record(event);
  },
  onError({ hook, error }) {
    console.warn(`metrics plugin ${hook} failed`, error);
  },
};
```

## Wiring into an APM span

```typescript
import * as Sentry from '@sentry/node';
import type { TablePlugin } from 'dyno-table';

const sentryPlugin: TablePlugin<ReturnType<typeof Sentry.startInactiveSpan>> = {
  name: 'sentry',
  onRequestStart(event) {
    return Sentry.startInactiveSpan({
      name: `dynamodb.${event.operation}`,
      attributes: {
        'db.dynamodb.table': event.tableName,
        'dyno_table.entities': event.entityNames.join(','),
      },
    });
  },
  onRequestEnd(event, span) {
    if (!span) return;
    if ('error' in event) span.setStatus({ code: 2 });
    span.end();
  },
};
```

## Counting requests per business transaction

dyno-table does not aggregate a "requests per transaction" count for you — that's the same job your APM already does (a New Relic/Sentry transaction, or an OpenTelemetry span) or a couple of lines with `AsyncLocalStorage`:

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';

const requestCount = new AsyncLocalStorage<{ count: number }>();

const countingPlugin: TablePlugin = {
  name: 'request-counter',
  onRequestEnd() {
    const store = requestCount.getStore();
    if (store) store.count++;
  },
};

await requestCount.run({ count: 0 }, async () => {
  // ...handle one web request/job here...
  await doWork(table);
  console.log(`fired ${requestCount.getStore()?.count} DynamoDB requests`);
});
```
