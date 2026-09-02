# Observability

Configure `hooks` on `Table` to observe every physical DynamoDB request it sends — the same seam a SQL library gives you for logging or spanning every query. Because the Entity layer always delegates to `Table`, hooks configured once cover entity repositories too, with no extra wiring.

```typescript
import { Table, type TableHooks } from 'dyno-table';

const hooks: TableHooks = {
  onRequestStart(event) {
    console.log(`[dynamo] → ${event.operation} ${event.tableName}`, event.params);
  },
  onRequestEnd(event) {
    console.log(`[dynamo] ← ${event.operation} ${event.tableName} in ${event.durationMs.toFixed(1)}ms`, {
      error: event.error,
    });
  },
};

const table = new Table({ client, tableName: 'Dinosaurs', indexes: { partitionKey: 'pk', sortKey: 'sk' }, hooks });
```

## What fires, and when

`onRequestStart`/`onRequestEnd` fire once per **physical** request sent to DynamoDB — not once per builder call. A single `table.query(...)` that pages through multiple `LastEvaluatedKey`s fires a pair per page, and `table.batchWrite(...)`/`table.batchGet(...)` fire a pair per 25/100-item chunk (including retried chunks). This is what lets you count real DynamoDB request volume, the same way a PDO/SQL query logger counts real queries rather than app-level calls.

- `RequestHookEvent` (passed to `onRequestStart`, and as the base of the `onRequestEnd` payload): `operation`, `tableName`, `entityNames`, `params` — a copy of the command input sent to the AWS SDK Document Client, already resolved (no `#alias`/`:alias` placeholders to decode).
- `RequestHookResult` (passed to `onRequestEnd`): adds `durationMs`, plus `result` on success or `error` on failure (the original error, before it's wrapped in a `DynoTableError` subclass).

`params` and `result` are typed per `operation` — narrow on it and TypeScript gives you the matching `@aws-sdk/lib-dynamodb` `*CommandInput`/`*CommandOutput` shape, not `unknown`:

```typescript
onRequestStart(event) {
  if (event.operation === "query") {
    event.params.KeyConditionExpression; // typed, no cast needed
  }
},
```

## Which entities fired a request

`entityNames` tells you which `defineEntity` repositories a request came from — so you can log or group by entity instead of just by table:

```typescript
onRequestStart(event) {
  console.log(`[dynamo] → ${event.operation} [${event.entityNames.join(", ") || "raw table call"}]`);
},
```

It's an array, not a single name, because a `transactWrite` or `batchWrite`/`batchGet` can bundle operations from more than one entity into a single physical request — a checkout transaction touching `Order`, `Inventory`, and `Payment` reports `entityNames: ["Inventory", "Order", "Payment"]` on that one event. It's `[]` when the call was made directly against `Table` rather than through a repository, or when nothing could be attributed (e.g. collection queries via `defineCollection`, which span entity types by design).

Hooks are observers, not interceptors: `params` is a shallow copy, so mutating it inside `onRequestStart` has no effect on the request actually sent. There is no supported way to rewrite, cancel, or short-circuit a request from a hook.

## Wiring into an APM span

```typescript
import * as Sentry from '@sentry/node';

const hooks: TableHooks = {
  onRequestEnd(event) {
    Sentry.startInactiveSpan({ name: `dynamodb.${event.operation}` }, (span) => {
      span.setAttribute("db.dynamodb.table", event.tableName);
      span.setAttribute("dyno_table.entities", event.entityNames.join(","));
      if (event.error) span.setStatus({ code: 2 /* ERROR */ });
    });
  },
};
```

## Counting requests per business transaction

dyno-table does not aggregate a "requests per transaction" count for you — that's the same job your APM already does (a New Relic/Sentry transaction, or an OpenTelemetry span) or a couple of lines with `AsyncLocalStorage`:

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';

const requestCount = new AsyncLocalStorage<{ count: number }>();

const hooks: TableHooks = {
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
