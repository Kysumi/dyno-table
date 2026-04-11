# UpdateBuilder returnValues

`update.execute()` returns `{ item?: T }`, not `T` directly.

| Option | Returns |
|---|---|
| `NONE` | `{ item: undefined }` |
| `ALL_NEW` | All attributes after the update (default) |
| `UPDATED_NEW` | Only the updated attributes after the update |
| `ALL_OLD` | All attributes before the update |
| `UPDATED_OLD` | Only the updated attributes before the update |

## Rules

- Always destructure: `const { item } = await repo.update(key, data).execute()`
- Default is `ALL_NEW` — `item` will contain the full item post-update.
- Use `NONE` for better performance if you don't need the returned item.
