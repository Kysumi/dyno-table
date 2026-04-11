# create vs upsert

## Semantics

| | `repo.create(data)` | `repo.upsert(data)` |
|---|---|---|
| Input type | `TInput` | `TInput & I` (must include key fields) |
| If item exists | Throws (attributeNotExists condition) | Silent overwrite |
| Use when | Creating new items safely | Idempotent writes where full record is known |

## Rules

- `upsert` requires the caller to supply **all key fields** explicitly (`TInput & I`). Keys are not derived from data alone.
- `create` is safe by default — fails fast if a duplicate key is written.
- Prefer `create` unless idempotency is explicitly required.
- The library consumer must provide the complete record when calling `upsert`.
