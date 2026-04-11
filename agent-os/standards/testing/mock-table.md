# Mock Table Shape

When unit-testing entity repositories, the mock table must match the shape the entity layer expects.

## Required shape

```typescript
const mockTable = {
  create: vi.fn(),
  put: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  scan: vi.fn(),
  query: vi.fn(),
  partitionKey: "pk",      // string — name of the partition key attribute
  sortKey: "sk",           // string | undefined
  gsis: {},                // Record<string, Index> — empty object if no GSIs
};

// Cast when passing to createRepository
const repo = entityDef.createRepository(mockTable as unknown as Table);
```

## Rules

- `partitionKey` and `sortKey` must be plain strings — the entity layer reads them to build keys.
- `gsis` must be present (even if `{}`). Missing it will cause index-building to fail.
- Mock return values with `mockTable.put.mockReturnValue(mockBuilder)` before calling repo methods.
