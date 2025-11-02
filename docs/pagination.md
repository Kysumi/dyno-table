# 📄 Pagination & Memory Management

Handle large datasets efficiently with dyno-table's memory-conscious pagination patterns. Perfect for browsing through millions of dinosaur fossils without breaking your server!

## 📋 Quick Reference

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

## ✨ Pagination Strategies

### Streaming Iterator (Best for Processing)
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

### Explicit Pagination (Best for UIs)
Perfect for implementing paginated lists in applications:

```typescript
class DinosaurExplorer {
  async getExpeditionPage(expeditionId: string, pageSize = 25) {
    const paginator = dinoRepo.query
      .getByExpedition({ expeditionId })
      .sort("desc") // Newest first
      .paginate(pageSize);

    return {
      hasData: paginator.hasNextPage(),
      getNext: () => paginator.getNextPage(),
      reset: () => paginator.reset()
    };
  }
}

// Usage in UI
const explorer = new DinosaurExplorer();
const pager = await explorer.getExpeditionPage("sahara-2024");

while (pager.hasData) {
  const page = await pager.getNext();

  page.items.forEach(dino => {
    console.log(`${dino.species} - ${dino.discoveredAt}`);
  });

  // Ask user if they want to continue
  const continue = await askUser("Load more dinosaurs? (y/n)");
  if (continue !== 'y') break;
}
```

### Batch Loading (Small Datasets Only)
Load all results into memory - use sparingly:

```typescript
// ✅ Good for small, known datasets
const recentDiscoveries = await dinoRepo.query
  .getByDateRange({
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-12-31')
  })
  .limit(100) // Explicit limit for safety
  .toArray();

// ❌ Dangerous for large datasets
const allDinosaurs = await dinoRepo.scan().toArray(); // Could cause OOM!
```

## 🎯 Pagination Patterns

### Cursor-Based Navigation
Navigate forward and backward through results:

```typescript
class DinosaurCatalog {
  private currentCursor?: string;

  async getNextPage(pageSize = 20) {
    const result = await dinoRepo.scan()
      .limit(pageSize)
      .startAfter(this.currentCursor ? { id: this.currentCursor } : undefined)
      .execute();

    const items = await result.toArray();

    if (items.length > 0) {
      this.currentCursor = items[items.length - 1].id;
    }

    return {
      items,
      hasMore: items.length === pageSize,
      cursor: this.currentCursor
    };
  }

  reset() {
    this.currentCursor = undefined;
  }
}
```

### Offset-Based Pagination (Not Recommended)
❌ Avoid offset-based pagination with DynamoDB - it's inefficient:

```typescript
// ❌ Don't do this - DynamoDB doesn't support efficient offset
async function getPageWithOffset(pageNumber: number, pageSize: number) {
  const offset = pageNumber * pageSize;

  // This is inefficient - DynamoDB has to scan through all skipped items
  const items = await dinoRepo.scan()
    .limit(offset + pageSize)
    .toArray();

  return items.slice(offset, offset + pageSize);
}

// ✅ Use cursor-based pagination instead
async function getPageWithCursor(cursor?: string, pageSize = 20) {
  return await dinoRepo.scan()
    .limit(pageSize)
    .startAfter(cursor ? { id: cursor } : undefined)
    .execute();
}
```

## 🎨 Advanced Pagination

### Bidirectional Pagination
Navigate both forward and backward:

```typescript
class BidirectionalPaginator<T> {
  private forwardCursor?: string;
  private backwardCursor?: string;
  private history: string[] = [];

  async getNextPage(pageSize = 20) {
    const items = await dinoRepo.scan()
      .limit(pageSize)
      .startAfter(this.forwardCursor ? { id: this.forwardCursor } : undefined)
      .toArray();

    if (items.length > 0) {
      // Track history for backward navigation
      if (this.forwardCursor) {
        this.history.push(this.forwardCursor);
      }

      this.forwardCursor = items[items.length - 1].id;
    }

    return { items, hasNext: items.length === pageSize };
  }

  async getPreviousPage(pageSize = 20) {
    if (this.history.length === 0) {
      return { items: [], hasPrevious: false };
    }

    this.forwardCursor = this.history.pop();

    const items = await dinoRepo.scan()
      .limit(pageSize)
      .startAfter(this.forwardCursor ? { id: this.forwardCursor } : undefined)
      .toArray();

    return { items, hasPrevious: this.history.length > 0 };
  }
}
```

### Filtered Pagination
Combine pagination with complex filters:

```typescript
async function getPaginatedCarnivores(
  minWeight: number,
  cursor?: string,
  pageSize = 25
) {
  const iterator = await dinoRepo.query
    .getByDiet({ diet: "carnivore" })
    .filter(op =>
      op.and(
        op.gte("weight", minWeight),
        op.exists("measurements.length")
      )
    )
    .startAfter(cursor ? {
      diet: "carnivore",
      species: cursor
    } : undefined)
    .limit(pageSize)
    .execute();

  const items = [];
  for await (const item of iterator) {
    items.push(item);
  }

  return {
    items,
    nextCursor: items.length === pageSize ? items[items.length - 1].species : null,
    hasMore: items.length === pageSize
  };
}
```

### Infinite Scroll Pattern
Perfect for modern UIs:

```typescript
class InfiniteScrollDinosaurs {
  private items: Dinosaur[] = [];
  private cursor?: string;
  private loading = false;
  private hasMore = true;

  async loadMore(pageSize = 20) {
    if (this.loading || !this.hasMore) return;

    this.loading = true;

    try {
      const result = await dinoRepo.scan()
        .limit(pageSize)
        .startAfter(this.cursor ? { id: this.cursor } : undefined)
        .toArray();

      this.items.push(...result);
      this.hasMore = result.length === pageSize;

      if (result.length > 0) {
        this.cursor = result[result.length - 1].id;
      }
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

## ⚡ Performance Optimization

### Smart Page Sizing
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

### Parallel Page Loading
Load multiple pages concurrently:

```typescript
async function loadMultiplePages(
  startCursors: string[],
  pageSize = 20
): Promise<Dinosaur[][]> {
  const pagePromises = startCursors.map(cursor =>
    dinoRepo.scan()
      .startAfter({ id: cursor })
      .limit(pageSize)
      .toArray()
  );

  return Promise.all(pagePromises);
}

// Load 3 pages in parallel
const [page1, page2, page3] = await loadMultiplePages([
  "cursor1", "cursor2", "cursor3"
]);
```

### Memory-Conscious Processing
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

## 🚨 Common Pitfalls

### Memory Leaks
```typescript
// ❌ Don't hold references to large arrays
class BadDinosaurService {
  private allDinosaurs: Dinosaur[] = [];

  async loadAll() {
    // This keeps growing and never releases memory
    const newDinos = await dinoRepo.scan().toArray();
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

### Inefficient Filters
```typescript
// ❌ Don't filter after loading
const allDinos = await dinoRepo.scan().toArray();
const largeCarnivores = allDinos.filter(d =>
  d.diet === "carnivore" && d.weight > 5000
);

// ✅ Filter at the database level
const largeCarnivores = await dinoRepo.query
  .getByDiet({ diet: "carnivore" })
  .filter(op => op.gt("weight", 5000))
  .toArray();
```

## 📚 Related Guides

- [Performance](./performance.md) - Optimization strategies for large datasets
- [Query Builders](./table-query-builder.md) - Building efficient queries
- [Memory Management](./performance.md#memory-management) - Detailed memory patterns
- [Entity Queries](./entity-query-builder.md) - Entity-specific pagination

## 🎓 Best Practices

1. **Use streaming for processing** - Iterator pattern for large datasets
2. **Use explicit pagination for UIs** - Paginator pattern for user interfaces
3. **Set reasonable page sizes** - Balance between performance and memory
4. **Implement cursor-based navigation** - Avoid offset-based pagination
5. **Monitor memory usage** - Use streaming for unknown dataset sizes
6. **Add loading states** - Show progress for long-running operations
7. **Handle edge cases** - Empty results, network errors, incomplete pages
