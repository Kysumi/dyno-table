# Key design patterns

Patterns for partition keys, sort keys, and indexes when designing entities with dyno-table.

## Quick reference

```typescript
// Good key design principles
const DinosaurEntity = defineEntity({
  primaryKey: createIndex()
    .partitionKey(({ id }) => `DINO#${id}`)        // Unique, well-distributed
    .sortKey(() => "METADATA"),                      // Allows for related items

  indexes: {
    byExpedition: createIndex()
      .partitionKey(({ expeditionId }) => `EXP#${expeditionId}`) // Group related items
      .sortKey(({ discoveredAt, species }) =>                     // Hierarchical sorting
        `${discoveredAt.toISOString()}#${species}`
      )
  }
});
```

## Partition key patterns

### Entity prefixing
Use prefixes to namespace different entity types:

```typescript
// ✅ Good: Clear entity separation
const keyPatterns = {
  dinosaur: (id: string) => `DINO#${id}`,
  expedition: (id: string) => `EXP#${id}`,
  researcher: (id: string) => `RESEARCHER#${id}`,
  publication: (id: string) => `PUB#${id}`,
  sample: (id: string) => `SAMPLE#${id}`
};

// ❌ Bad: No prefixes, potential conflicts
const badPatterns = {
  dinosaur: (id: string) => id,  // Could conflict with other entities
  expedition: (id: string) => id // "123" could be dino or expedition
};
```

### Access pattern grouping
Design partition keys around how you query data:

```typescript
// Access pattern: "Get all dinosaurs from an expedition"
const byExpeditionIndex = createIndex()
  .input(dinosaurSchema)
  .partitionKey(({ expeditionId }) => `EXP#${expeditionId}`) // Groups by expedition
  .sortKey(({ discoveredAt }) => discoveredAt.toISOString()); // Chronological order

// Access pattern: "Get all discoveries by a researcher"
const byResearcherIndex = createIndex()
  .input(dinosaurSchema)
  .partitionKey(({ discoveredBy }) => `RESEARCHER#${discoveredBy}`) // Groups by researcher
  .sortKey(({ discoveredAt }) => discoveredAt.toISOString());

// Access pattern: "Get dinosaurs by diet type"
const byDietIndex = createIndex()
  .input(dinosaurSchema)
  .partitionKey(({ diet }) => `DIET#${diet}`) // Groups by diet
  .sortKey(({ period, species }) => `${period}#${species}`); // Secondary grouping
```

### Distribution strategies
Avoid hot partitions by distributing load:

```typescript
// ❌ Bad: Hot partition (all writes go to one partition)
const hotPartition = createIndex()
  .partitionKey(() => "ALL_DINOSAURS") // Everything in one partition!
  .sortKey(({ discoveredAt }) => discoveredAt.toISOString());

// ✅ Good: Distributed by time period
const distributedPartition = createIndex()
  .partitionKey(({ discoveredAt }) => {
    const month = discoveredAt.toISOString().substring(0, 7); // YYYY-MM
    return `TIMELINE#${month}`;
  })
  .sortKey(({ discoveredAt, id }) => `${discoveredAt.toISOString()}#${id}`);

// ✅ Good: Distributed by geographic region
const byRegionIndex = createIndex()
  .partitionKey(({ location }) => `REGION#${location.country}#${location.region}`)
  .sortKey(({ species, discoveredAt }) => `${species}#${discoveredAt.toISOString()}`);
```

## Sort key patterns

### Hierarchical sorting
Create sort keys that enable range queries:

```typescript
// Timeline pattern: Date-based sorting
const timelineSort = createIndex()
  .partitionKey(({ expeditionId }) => `EXP#${expeditionId}`)
  .sortKey(({ discoveredAt, eventType, id }) =>
    `${discoveredAt.toISOString()}#${eventType}#${id}`
  );

// Enables queries like:
// - All events: PK = "EXP#sahara-2024"
// - Events after date: PK = "EXP#sahara-2024", SK > "2024-06-01T00:00:00.000Z"
// - Discovery events: PK = "EXP#sahara-2024", SK begins_with "2024-06-01T00:00:00.000Z#discovery"

// Categorical pattern: Type-based sorting
const categoricalSort = createIndex()
  .partitionKey(({ diet }) => `DIET#${diet}`)
  .sortKey(({ period, size, species }) =>
    `${period}#${size}#${species}`
  );

// Enables queries like:
// - All carnivores: PK = "DIET#carnivore"
// - Jurassic carnivores: PK = "DIET#carnivore", SK begins_with "jurassic"
// - Large Jurassic carnivores: PK = "DIET#carnivore", SK begins_with "jurassic#large"
```

### Lexical sorting considerations
Remember that DynamoDB sorts lexically (as strings):

```typescript
// ❌ Bad: Numbers sort incorrectly
const badNumericSort = createIndex()
  .sortKey(({ weight }) => weight.toString()); // "10" comes before "2"!

// ✅ Good: Zero-padded numbers
const goodNumericSort = createIndex()
  .sortKey(({ weight }) => weight.toString().padStart(8, '0')); // "00000010" after "00000002"

// ❌ Bad: Dates as strings
const badDateSort = createIndex()
  .sortKey(({ discoveredAt }) =>
    `${discoveredAt.getMonth()}/${discoveredAt.getDate()}/${discoveredAt.getFullYear()}`
  ); // "12/1/2024" comes before "2/1/2024"!

// ✅ Good: ISO date format
const goodDateSort = createIndex()
  .sortKey(({ discoveredAt }) => discoveredAt.toISOString()); // Naturally sorts chronologically
```

### Reverse sorting patterns
Get newest items first by designing the sort key to invert chronological order:

```typescript
// ✅ Reverse chronological order (newest first)
const reverseChronological = createIndex()
  .partitionKey(({ expeditionId }) => `EXP#${expeditionId}`)
  .sortKey(({ discoveredAt }) => {
    // Subtract from a future date to reverse order
    const futureDate = new Date('2099-12-31');
    const reverseTimestamp = futureDate.getTime() - discoveredAt.getTime();
    return reverseTimestamp.toString().padStart(15, '0');
  });

// ✅ Alternative: Use limit + scan forward pattern
const newestFirst = createIndex()
  .partitionKey(({ expeditionId }) => `EXP#${expeditionId}`)
  .sortKey(({ discoveredAt, id }) => `${discoveredAt.toISOString()}#${id}`);

// Query with scanIndexForward: false for newest first
// const newest = await repo.query.getByExpedition({ expeditionId }).sortDescending().limit(10).execute();
```

## Advanced key patterns

### Composite key strategies
Combine multiple attributes for complex access patterns:

```typescript
// Multi-faceted classification system
const classificationIndex = createIndex()
  .input(dinosaurSchema)
  .partitionKey(({ period, diet }) => `CLASS#${period}#${diet}`)
  .sortKey(({ family, genus, species }) => `${family}#${genus}#${species}`);

// Enables precise queries:
// - All Jurassic carnivores: PK = "CLASS#jurassic#carnivore"
// - Jurassic carnivore families: PK = "CLASS#jurassic#carnivore", group by family
// - Specific lineage: PK = "CLASS#jurassic#carnivore", SK begins_with "Allosauridae"

// Geographic + temporal patterns
const spatioTemporalIndex = createIndex()
  .input(dinosaurSchema)
  .partitionKey(({ location }) => `GEO#${location.country}#${location.region}`)
  .sortKey(({ discoveredAt, confidence }) =>
    `${discoveredAt.toISOString()}#${confidence}`
  );
```

### Overloaded indexes
Use one index for multiple access patterns:

```typescript
const overloadedIndex = createIndex()
  .input(z.union([dinosaurSchema, expeditionSchema, researcherSchema]))
  .partitionKey((item) => {
    switch (item.type) {
      case "dinosaur":
        return `DINO#${item.expeditionId}`; // Group dinosaurs by expedition
      case "expedition":
        return `EXP#${item.leadResearcher}`; // Group expeditions by leader
      case "researcher":
        return `RESEARCHER#${item.specialization}`; // Group researchers by specialty
    }
  })
  .sortKey((item) => {
    switch (item.type) {
      case "dinosaur":
        return `DINO#${item.discoveredAt.toISOString()}#${item.id}`;
      case "expedition":
        return `EXP#${item.startDate.toISOString()}#${item.id}`;
      case "researcher":
        return `RESEARCHER#${item.name}#${item.id}`;
    }
  });

// Supports multiple queries with one index:
// - Dinosaurs in expedition: PK = "DINO#expedition-id"
// - Expeditions by leader: PK = "EXP#researcher-id"
// - Researchers by specialty: PK = "RESEARCHER#paleontology"
```

When an overloaded partition contains multiple entity types, [entity collections](collections.md) can return each query page grouped by entity.

### Sparse index patterns
Create indexes only for items that have certain attributes:

```typescript
const publishedDinosaurIndex = createIndex()
  .input(dinosaurSchema)
  .partitionKey(() => "PUBLISHED") // Only items with publications
  .sortKey(({ publications, discoveredAt }) =>
    publications.length > 0 ? // Only index if published
      `${publications[0].publishedAt.toISOString()}#${discoveredAt.toISOString()}` :
      undefined // Undefined means don't index this item
  );

// Creates a sparse index containing only published dinosaurs
```

## Performance optimization

### Hot partition detection
Identify and fix hot partitions:

```typescript
// Monitor partition access patterns
class PartitionMonitor {
  private accessCounts = new Map<string, number>();

  logAccess(partitionKey: string) {
    this.accessCounts.set(
      partitionKey,
      (this.accessCounts.get(partitionKey) || 0) + 1
    );
  }

  getHotPartitions(threshold = 100): string[] {
    return Array.from(this.accessCounts.entries())
      .filter(([, count]) => count > threshold)
      .map(([key]) => key);
  }

  suggestImprovements(hotPartitions: string[]) {
    return hotPartitions.map(partition => {
      if (partition.includes("TIMELINE")) {
        return `Consider time-based sharding for ${partition}`;
      }
      if (partition.includes("STATUS")) {
        return `Consider adding secondary grouping for ${partition}`;
      }
      return `Investigate distribution strategy for ${partition}`;
    });
  }
}
```

### Capacity planning
Design keys that distribute load evenly:

```typescript
// ✅ Good: Even distribution strategies
const distributionStrategies = {
  // Geographic distribution
  geographic: (location: Location) =>
    `GEO#${location.country}#${location.region}`,

  // Time-based distribution
  temporal: (date: Date) =>
    `TIME#${date.getFullYear()}#${String(date.getMonth() + 1).padStart(2, '0')}`,

  // Hash-based distribution (for truly random distribution)
  hash: (id: string) => {
    const hash = id.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
    const bucket = Math.abs(hash) % 10; // 10 buckets
    return `HASH#${bucket}`;
  }
};
```

## Common anti-patterns

### Avoid these patterns

```typescript
// ❌ Sequential IDs as partition keys (creates hot spots)
const badSequential = createIndex()
  .partitionKey(({ id }) => id); // If IDs are sequential: 1, 2, 3, 4...

// ❌ Timestamp-only partition keys (creates hot spots)
const badTimestamp = createIndex()
  .partitionKey(({ createdAt }) => createdAt.toISOString());

// ❌ Overly granular partition keys (too many small partitions)
const tooGranular = createIndex()
  .partitionKey(({ id, createdAt }) => `${id}#${createdAt.toISOString()}`);

// ❌ No prefixes (namespace collisions)
const noNamespace = createIndex()
  .partitionKey(({ userId }) => userId); // Could be dino ID, researcher ID, etc.

// ❌ Non-sortable sort keys
const badSort = createIndex()
  .sortKey(({ randomData }) => Math.random().toString()); // No meaningful order
```

## Testing key designs

### Validate your key patterns

```typescript
// Test key distribution
function testKeyDistribution(items: any[], keyFunction: (item: any) => string) {
  const distribution = new Map<string, number>();

  items.forEach(item => {
    const key = keyFunction(item);
    distribution.set(key, (distribution.get(key) || 0) + 1);
  });

  const counts = Array.from(distribution.values());
  const mean = counts.reduce((a, b) => a + b) / counts.length;
  const variance = counts.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / counts.length;

  return {
    partitions: distribution.size,
    averageItemsPerPartition: mean,
    variance,
    isWellDistributed: variance < mean * 0.5 // Rule of thumb
  };
}

// Test sort key effectiveness
function testSortKeyRangeQueries(items: any[], sortKeyFunction: (item: any) => string) {
  const sortedKeys = items.map(sortKeyFunction).sort();

  // Test if range queries would be effective
  const rangeTests = [
    { start: sortedKeys[0], end: sortedKeys[Math.floor(sortedKeys.length * 0.1)] },
    { start: sortedKeys[Math.floor(sortedKeys.length * 0.4)], end: sortedKeys[Math.floor(sortedKeys.length * 0.6)] }
  ];

  return rangeTests.map(({ start, end }) => ({
    start,
    end,
    itemsInRange: sortedKeys.filter(key => key >= start && key <= end).length
  }));
}
```

## Related guides

- [Table Operations](./table-query-builder.md) - Indexes, scans, and parallel scan segments
- [First Entity](./first-entity.md) - Basic key design tutorial
- [Entity vs Table](./entity-vs-table.md) - When to use different patterns
