# UpdateBuilder returnValues

`update.execute()` returns `{ item?: T }`, not `T` directly.

| Option | Returns |
|---|---|
| `NONE` | `{ item: undefined }` (default) |
| `ALL_NEW` | All attributes after the update |
| `UPDATED_NEW` | Only the updated attributes after the update |
| `ALL_OLD` | All attributes before the update |
| `UPDATED_OLD` | Only the updated attributes before the update |

## Rules

- Always destructure: `const { item } = await repo.update(key, data).execute()`
- Default is `NONE` — `item` will be `undefined` unless returnValues is set.
- `ALL_NEW` is the most common non-default: returns the full item post-update.
