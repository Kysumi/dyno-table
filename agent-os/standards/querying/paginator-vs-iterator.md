# Paginator vs ResultIterator

Two different tools for two different jobs.

| | `ResultIterator` (via `execute()`) | `Paginator` (via `paginate(n)`) |
|---|---|---|
| Use case | Processing / ETL / background jobs | UI pagination, cursor-based APIs |
| Control | Stream automatically | Fetch one page at a time, manually |
| API | `for await (const item of iterator)` | `while (paginator.hasNextPage()) { await paginator.getNextPage() }` |
| Page size | Set via `.limit()` on query | Set via `paginate(pageSize)` |

## Pattern — Paginator (UI pagination)

```typescript
const paginator = table.query({ pk: "CATEGORY#shoes" }).paginate(20);

while (paginator.hasNextPage()) {
  const page = await paginator.getNextPage();
  renderPage(page.items);
  // page.hasNextPage, page.page, page.lastEvaluatedKey available
}
```

## Rules

- `paginate(n)` page size and query `.limit(n)` are independent — `limit` is a global cap, `paginate` is per-page.
- `paginator.getAllPages()` collects all pages into an array — same OOM risk as `toArray()`.
- Use `ResultIterator` for processing; use `Paginator` when the caller needs page-by-page control.
