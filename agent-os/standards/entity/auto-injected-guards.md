# Auto-injected Entity Guards

The entity layer silently modifies operations to scope them to the entity type.

## What gets injected automatically

| Operation | Auto-injection |
|---|---|
| `repo.scan()` | Adds `filter(eq("entityType", entityName))` |
| Query results via `repo.query.*` | Adds `filter(eq("entityType", entityName))` |
| `repo.update()` | Adds `condition(eq("entityType", entityName))` |
| `repo.delete()` | Adds `condition(eq("entityType", entityName))` |

## Rules

- `repo.scan()` only returns items for that entity type — not all table items. Use the table layer directly for cross-entity scans.
- Items written outside the entity layer (e.g. via `table.put()`) will lack `entityType` and will be invisible to entity scans/queries, and cause update/delete conditions to fail.
- The `entityType` attribute name defaults to `"entityType"` but can be overridden via `settings.entityTypeAttributeName`.
