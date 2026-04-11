# PutBuilder returnValues

Default is `NONE`. Always be explicit about what you expect back.

| Option | Returns | Notes |
|---|---|---|
| `NONE` | `undefined` | Default for `table.put()`. Use when you don't need the result. |
| `INPUT` | The input item as passed | Default for `table.create()`. Cheap — no extra DynamoDB read. |
| `ALL_OLD` | Previous item state | `undefined` if item didn't exist before the put. Always guard. |
| `CONSISTENT` | Fresh GET of the new item | Costs extra read capacity. Rarely needed — prefer `INPUT`. |

## Rules

- Prefer `INPUT` over `CONSISTENT` — returns the same written data without consuming read capacity.
- `ALL_OLD` is always nullable. Guard against `undefined` before accessing properties.
- `table.put()` defaults to `NONE`. `table.create()` defaults to `INPUT`.
