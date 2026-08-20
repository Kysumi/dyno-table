# Pagination and memory management

dyno-table gives you two ways to work through large result sets without loading everything into memory: an async iterator for streaming, and a paginator for page-by-page control.

## Quick reference

```typescript
// Memory-efficient streaming (recommended for large datasets)
const iterator = await dinoRepo.query.getBySpecies({ species: "T-Rex" }).execute();
for await (const dino of iterator) {
  processDinosaur(dino); // Only one item in memory at a time
}

// Explicit pagination (recommended for UI)
const paginator = dinoRepo.scan().paginate(20);
while (paginator.hasNextPage()) {
  const page = await paginator.getNextPage();
  displayDinosaurs(page.items);
}
```

## Pagination strategies

### Streaming iterator (best for processing)
Memory-efficient processing of large result sets:

```typescript
// Process all carnivorous dinosaurs without loading into memory
const carnivores = await dinoRepo.query
  .getByDiet({ diet: "carnivore" })
  .execute();

let processedCount = 0;
for await (const carnivore of carnivores) {
  await analyzeDinosaur(carnivore);
  processedCount++;

  if (processedCount % 100 === 0) {
    console.log(`Processed ${processedCount} carnivores...`);
  }
}
```

### Explicit pagination (best for UIs)
Use this for paginated lists in applications:

```typescript
const paginator = dinoRepo.query
  .getByExpedition({ expeditionId: "sahara-2024" })
  .sortDescending() // Newest first
  .paginate(25);

while (paginator.hasNextPage()) {
  const page = await paginator.getNextPage();

  page.items.forEach(dino => {
    console.log(`${dino.species} - ${dino.discoveredAt}`);
  });

  // Ask user if they want to continue
  const keepGoing = await askUser("Load more dinosaurs? (y/n)");
  if (keepGoing !== 'y') break;
}
```

### Batch loading (small datasets only)
Load all results into memory. Use sparingly:

```typescript
// ✅ Good for small, known datasets
const recentDiscoveriesResult = await dinoRepo.query
  .getByDateRange({
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-12-31')
  })
  .limit(100) // Explicit limit for safety
  .execute();
const recentDiscoveries = await recentDiscoveriesResult.toArray();

// ❌ Dangerous for large datasets
const allDinosaurs = await (await dinoRepo.scan().execute()).toArray(); // Could cause OOM!
```

## Pagination patterns

### Cursor-based navigation
Navigate forward and backward through results:

```typescript
class DinosaurCatalog {
  private cursor?: Record<string, unknown>;

  async getNextPage(pageSize = 20) {
    let query = dinoRepo.scan().limit(pageSize);
    if (this.cursor) {
      query = query.startFrom(this.cursor);
    }

    const result = await query.execute();
    const items = await result.toArray();
    this.cursor = result.getLastEvaluatedKey();

    return {
      items,
      hasMore: !!this.cursor,
      cursor: this.cursor
    };
  }

  reset() {
    this.cursor = undefined;
  }
}
```

### Offset-based pagination (not recommended)
Avoid offset-based pagination with DynamoDB. It's inefficient:

```typescript
// ❌ Don't do this - DynamoDB doesn't support efficient offset
async function getPageWithOffset(pageNumber: number, pageSize: number) {
  const offset = pageNumber * pageSize;

  // This is inefficient - DynamoDB has to scan through all skipped items
  const result = await dinoRepo.scan()
    .limit(offset + pageSize)
    .execute();
  const items = await result.toArray();

  return items.slice(offset, offset + pageSize);
}

// ✅ Use cursor-based pagination instead
async function getPageWithCursor(cursor?: Record<string, unknown>, pageSize = 20) {
  let query = dinoRepo.scan().limit(pageSize);
  if (cursor) {
    query = query.startFrom(cursor);
  }
  return await query.execute();
}
```

## Advanced pagination

### Bidirectional pagination
Navigate both forward and backward:

```typescript
class BidirectionalPaginator<T> {
  private forwardCursor?: Record<string, unknown>;
  private history: Record<string, unknown>[] = [];

  async getNextPage(pageSize = 20) {
    let query = dinoRepo.scan().limit(pageSize);
    if (this.forwardCursor) {
      query = query.startFrom(this.forwardCursor);
    }

    const result = await query.execute();
    const items = await result.toArray();
    const nextCursor = result.getLastEvaluatedKey();

    // Track history for backward navigation
    if (this.forwardCursor) {
      this.history.push(this.forwardCursor);
    }
    this.forwardCursor = nextCursor;

    return { items, hasNext: !!nextCursor };
  }

  async getPreviousPage(pageSize = 20) {
    if (this.history.length === 0) {
      return { items: [], hasPrevious: false };
    }

    this.forwardCursor = this.history.pop();

    let query = dinoRepo.scan().limit(pageSize);
    if (this.forwardCursor) {
      query = query.startFrom(this.forwardCursor);
    }

    const result = await query.execute();
    const items = await result.toArray();

    return { items, hasPrevious: this.history.length > 0 };
  }
}
```

### Filtered pagination
Combine pagination with complex filters:

```typescript
async function getPaginatedCarnivores(
  minWeight: number,
  cursor?: Record<string, unknown>,
  pageSize = 25
) {
  let query = dinoRepo.query
    .getByDiet({ diet: "carnivore" })
    .filter(op =>
      op.and(
        op.gte("weight", minWeight),
        op.attributeExists("measurements.length")
      )
    )
    .limit(pageSize);

  if (cursor) {
    query = query.startFrom(cursor);
  }

  const result = await query.execute();
  const items = await result.toArray();
  const nextCursor = result.getLastEvaluatedKey();

  return {
    items,
    nextCursor: nextCursor ?? null,
    hasMore: !!nextCursor
  };
}
```

### Infinite scroll pattern
Load more items as the user scrolls:

```typescript
class InfiniteScrollDinosaurs {
  private items: Dinosaur[] = [];
  private cursor?: Record<string, unknown>;
  private loading = false;
  private hasMore = true;

  async loadMore(pageSize = 20) {
    if (this.loading || !this.hasMore) return;

    this.loading = true;

    try {
      let query = dinoRepo.scan().limit(pageSize);
      if (this.cursor) {
        query = query.startFrom(this.cursor);
      }

      const result = await query.execute();
      const newItems = await result.toArray();

      this.items.push(...newItems);
      this.cursor = result.getLastEvaluatedKey();
      this.hasMore = !!this.cursor;
    } finally {
      this.loading = false;
    }
  }

  get currentItems() {
    return [...this.items]; // Return copy
  }

  reset() {
    this.items = [];
    this.cursor = undefined;
    this.hasMore = true;
  }
}
```

## Performance optimization

### Smart page sizing
Adjust page size based on item complexity:

```typescript
function getOptimalPageSize(queryType: string): number {
  switch (queryType) {
    case "basic-info":
      return 50; // Small items, larger pages
    case "full-details":
      return 10; // Large items, smaller pages
    case "with-images":
      return 5;  // Very large items, tiny pages
    default:
      return 25; // Reasonable default
  }
}

const pageSize = getOptimalPageSize("basic-info");
const page = await dinoRepo.scan().paginate(pageSize).getNextPage();
```

### Parallel page loading
Load multiple pages concurrently:

```typescript
async function loadMultiplePages(
  startCursors: Record<string, unknown>[],
  pageSize = 20
): Promise<Dinosaur[][]> {
  const pagePromises = startCursors.map(async cursor => {
    const result = await dinoRepo.scan()
      .startFrom(cursor)
      .limit(pageSize)
      .execute();
    return result.toArray();
  });

  return Promise.all(pagePromises);
}

// Load pages in parallel from 3 previously saved cursors
// (each captured earlier via result.getLastEvaluatedKey())
const [page1, page2, page3] = await loadMultiplePages([
  savedCursor1, savedCursor2, savedCursor3
]);
```

### Memory-conscious processing
Process large datasets without memory issues:

```typescript
async function processLargeDataset(
  processor: (item: Dinosaur) => Promise<void>
) {
  const iterator = await dinoRepo.scan().execute();

  let processed = 0;
  let batch: Dinosaur[] = [];
  const batchSize = 10;

  for await (const item of iterator) {
    batch.push(item);

    if (batch.length >= batchSize) {
      // Process batch concurrently
      await Promise.all(batch.map(processor));
      batch = []; // Clear batch
      processed += batchSize;

      // Optional: Add backpressure
      if (processed % 1000 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  // Process remaining items
  if (batch.length > 0) {
    await Promise.all(batch.map(processor));
  }
}
```

## Common pitfalls

### Memory leaks
```typescript
// ❌ Don't hold references to large arrays
class BadDinosaurService {
  private allDinosaurs: Dinosaur[] = [];

  async loadAll() {
    // This keeps growing and never releases memory
    const result = await dinoRepo.scan().execute();
    const newDinos = await result.toArray();
    this.allDinosaurs.push(...newDinos);
  }
}

// ✅ Process and release
class GoodDinosaurService {
  async processAll(processor: (dino: Dinosaur) => void) {
    const iterator = await dinoRepo.scan().execute();

    for await (const dino of iterator) {
      processor(dino);
      // Item is automatically garbage collected after processing
    }
  }
}
```

### Inefficient filters
```typescript
// ❌ Don't filter after loading
const allDinosResult = await dinoRepo.scan().execute();
const allDinos = await allDinosResult.toArray();
const largeCarnivores = allDinos.filter(d =>
  d.diet === "carnivore" && d.weight > 5000
);

// ✅ Filter at the database level
const carnivoresResult = await dinoRepo.query
  .getByDiet({ diet: "carnivore" })
  .filter(op => op.gt("weight", 5000))
  .execute();
const largeCarnivores = await carnivoresResult.toArray();
```

## Related guides

- [Query builders](./table-query-builder.md) - Building efficient queries, including parallel scan segments
- [Entity queries](./entity-query-builder.md) - Entity-specific pagination

## Best practices

- Treat the value from `getLastEvaluatedKey()` as opaque. Pass it straight into `startFrom()` on the next request instead of parsing or rebuilding it from individual fields.
- Avoid offset-based pagination. DynamoDB has no efficient way to skip N items, so cursors are the only scalable option.
- Handle edge cases: empty result sets, and an `undefined` cursor once `getLastEvaluatedKey()` stops returning a value.
