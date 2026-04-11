# table.create() vs table.put()

Both are PutBuilder operations. They differ in conditions and defaults.

| | `table.create(item)` | `table.put(item)` |
|---|---|---|
| Condition | Auto-adds `attributeNotExists(pk)` | None |
| If item exists | Throws ConditionalCheckFailed | Silent overwrite |
| returnValues default | `INPUT` | `NONE` |

## Rules

- `table.create()` is safe insert — use when duplicates are a bug.
- `table.put()` is raw replace — use for explicit overwrites or when you manage the condition yourself.
- Both return a `PutBuilder` — all fluent methods (`.condition()`, `.returnValues()`, `.withTransaction()`) apply to both.
