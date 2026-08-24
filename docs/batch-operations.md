# Batch operations guide

Read or write multiple dinosaur records in a single batch call instead of issuing one request per item.

## Why use batch operations?

A batch call processes multiple items per API request, which cuts round trips compared to looping over individual `.execute()` calls. DynamoDB still enforces per-item limits (see [Performance considerations](#performance-considerations)), but the batch APIs handle chunking for you.

## Table of contents

- [Batch get operations](#batch-get-operations)
- [Batch write operations](#batch-write-operations)
- [Entity batch operations](#entity-batch-operations)
- [Performance considerations](#performance-considerations)
- [Error handling](#error-handling)
- [Advanced patterns](#advanced-patterns)

## Batch get operations

### Basic batch get

Get multiple dinosaurs in one call:

```ts
// Get several dinosaurs at once
const { items: dinosaurs } = await table.batchGet<Dinosaur>([
  { pk: "DINO#t-rex-001", sk: "PROFILE" },
  { pk: "DINO#triceratops-001", sk: "PROFILE" },
  { pk: "DINO#stegosaurus-001", sk: "PROFILE" },
  { pk: "DINO#brontosaurus-001", sk: "PROFILE" }
]);

for (const dino of dinosaurs) {
  console.log(`Found ${dino.species} from ${dino.period} period`);
}
```

### Entity batch get

Entity repositories don't have their own `batchGet`. Queue individual `.get()` calls on a shared batch instead; that keeps the automatic key generation and schema typing:

```ts
// Batch get with entities (automatic key generation)
const batch = table.batchBuilder();

[{ id: "t-rex-001" }, { id: "triceratops-001" }, { id: "stegosaurus-001" }, { id: "velociraptor-001" }]
  .forEach(key => dinoRepo.get(key).withBatch(batch));

const { reads } = await batch.execute();
const expeditionDinosaurs = reads.itemsByType.Dinosaur;

// Process results
const expeditionReport = expeditionDinosaurs.map(dino => ({
  species: dino.species,
  period: dino.period,
  dangerLevel: dino.diet === "carnivore" ? "HIGH" : "LOW",
  weight: dino.weight
}));
```

Projection and consistency settings are preserved when a get is queued:

```ts
const batch = table.batchBuilder();

dinoRepo
  .get({ id: "t-rex-001" })
  .select("name")
  .consistentRead()
  .withBatch(batch);

const { reads } = await batch.execute();
// reads.items contains only the selected name field
```

### Cross-collection batch get

Get items from different collections:

```ts
// Mix dinosaurs, paleontologists, and discoveries
const { items: expeditionData } = await table.batchGet([
  { pk: "DINO#t-rex-001", sk: "PROFILE" },
  { pk: "PALEO#brown-001", sk: "PROFILE" },
  { pk: "DISCOVERY#montana-1905", sk: "DETAILS" },
  { pk: "MUSEUM#amnh", sk: "COLLECTION" }
]);
```

## Batch write operations

### Batch create multiple items

```ts
// Batch create new dinosaur discoveries
const newDiscoveries = [
  {
    id: "allo-001",
    species: "Allosaurus",
    period: "jurassic",
    diet: "carnivore",
    discoveryYear: 1877,
    weight: 2300,
    length: 8.5,
    discoveredBy: "Othniel Charles Marsh",
    fossilLocation: "Colorado, USA"
  },
  {
    id: "diplo-001",
    species: "Diplodocus",
    period: "jurassic",
    diet: "herbivore",
    discoveryYear: 1878,
    weight: 15000,
    length: 26,
    discoveredBy: "Samuel Wendell Williston",
    fossilLocation: "Colorado, USA"
  },
  {
    id: "ankylo-001",
    species: "Ankylosaurus",
    period: "cretaceous",
    diet: "herbivore",
    discoveryYear: 1908,
    weight: 6000,
    length: 6.25,
    discoveredBy: "Barnum Brown",
    fossilLocation: "Montana, USA"
  }
];

// Batch write with table using BatchBuilder
const batch = table.batchBuilder();

newDiscoveries.forEach(dino => {
  table.put({
    pk: `DINO#${dino.id}`,
    sk: "PROFILE",
    ...dino
  }).withBatch(batch);
});

await batch.execute();
```

### Entity batch write

```ts
// Batch write with entities (automatic validation!)
const batch = table.batchBuilder();

newDiscoveries.forEach(dino => {
  dinoRepo.create(dino).withBatch(batch);
});

await batch.execute();
```

### Mixed batch operations

```ts
// Mix puts and deletes in one batch
const batch = table.batchBuilder();

// Add newly discovered dinosaurs
jurassicDiscoveries.forEach(dino => {
  dinoRepo.create(dino).withBatch(batch);
});

// Remove outdated classifications
outdatedClassifications.forEach(({ id }) => {
  dinoRepo.delete({ id }).withBatch(batch);
});

await batch.execute();
```

## Entity batch operations

### Repository batch methods

```ts
// Batch get with type safety
const getBatch = table.batchBuilder();

[{ id: "t-rex-001" }, { id: "triceratops-001" }, { id: "stegosaurus-001" }]
  .forEach(key => dinoRepo.get(key).withBatch(getBatch));

const { reads: museumReads } = await getBatch.execute();
const museumCollection = museumReads.itemsByType.Dinosaur;

// Batch operations with validation
const batch = table.batchBuilder();

// All creates are validated against schema
cretaceousDinosaurs.forEach(dino => {
  dinoRepo.create(dino).withBatch(batch);
});

// Updates with conditions
discoveryUpdates.forEach(({ id, updates }) => {
  dinoRepo.update({ id }, updates)
    .condition(op => op.attributeExists("pk"))
    .withBatch(batch);
});

await batch.execute();
```

### Batch with different entities

```ts
// Coordinate operations across multiple entities
const batch = table.batchBuilder();

// Create dinosaur record
dinoRepo.create(newDinosaur).withBatch(batch);

// Update paleontologist's discovery count
paleoRepo.update({ id: newDinosaur.discoveredBy }, {})
  .add("discoveriesCount", 1)
  .withBatch(batch);

// Create discovery event
discoveryRepo.create({
  id: `discovery-${Date.now()}`,
  dinosaurId: newDinosaur.id,
  paleontologistId: newDinosaur.discoveredBy,
  year: newDinosaur.discoveryYear,
  location: newDinosaur.fossilLocation
}).withBatch(batch);

await batch.execute();
```

## Performance considerations

### Batch size limits

DynamoDB has built-in limits that dyno-table handles automatically:

```ts
// ✅ dyno-table automatically chunks large batches
const massiveDiscoveryList = Array.from({ length: 150 }, (_, i) => ({
  id: `discovery-${i}`,
  species: `Species ${i}`,
  // ... other fields
}));

// This will be automatically split into multiple batches
const batch = table.batchBuilder();

massiveDiscoveryList.forEach(dino => {
  dinoRepo.create(dino).withBatch(batch);
});

await batch.execute();
```

**Limits handled automatically:**
- **Batch Write**: 25 items max per batch
- **Batch Get**: 100 items max per batch
- **Item Size**: 400KB max per item
- **Total Size**: 16MB max per batch

### Conditional failures

```ts
// Batch with conditional operations
const batch = table.batchBuilder();

discoveries.forEach(dino => {
  dinoRepo.create(dino)
    .condition(op => op.attributeNotExists("pk")) // Only create if doesn't exist
    .withBatch(batch);
});

await batch.execute();
```

## Error handling

Batch gets and writes automatically retry DynamoDB's unprocessed remainder. The default is five total attempts with full-jitter exponential backoff starting at a 25 ms ceiling. After the attempt budget is exhausted, only the final remainder is returned in `unprocessedKeys`, `unprocessedItems`, or the builder result's `unprocessed` fields.

```ts
const result = await batch.execute({
  maxAttempts: 5,
  baseDelayMs: 25,
  abortSignal,
});

if (!result.success) {
  console.warn("Batch work remains unprocessed", result.writes.unprocessed, result.reads.unprocessed);
}
```

Use `{ maxAttempts: 1 }` for the former single-request behavior. Aborting rejects with the signal's reason instead of returning a partial result.

## Advanced patterns

### Batch with transactions

For ACID compliance across batches:

```ts
// Use transactions for smaller, consistent operations
await table.transaction(async (tx) => {
  dinoRepo.create(newDinosaur).withTransaction(tx);
  paleoRepo.update({ id: paleontologistId }, {}).add("discoveriesCount", 1).withTransaction(tx);
  museumRepo.update({ id: museumId }, {}).add("collectionsCount", 1).withTransaction(tx);
});
```

### Batch data migration

```ts
// Migrate data between schemas
async function migrateDinosaurData(oldRecords: OldDinosaurFormat[]) {
  const migratedRecords = oldRecords.map(old => ({
    id: old.dinosaur_id,
    species: old.dinosaur_name,
    period: old.time_period.toLowerCase(),
    diet: mapOldDietFormat(old.eating_habits),
    discoveryYear: old.year_found,
    weight: old.weight_kg,
    length: old.length_meters,
    discoveredBy: old.discoverer,
    fossilLocation: old.location
  }));

  // Batch write new format
  const writeBatch = table.batchBuilder();

  migratedRecords.forEach(dino => {
    dinoRepo.create(dino).withBatch(writeBatch);
  });

  await writeBatch.execute();

  // Batch delete old format (separate operation)
  const deleteBatch = table.batchBuilder();

  oldRecords.forEach(old => {
    deleteBatch.delete({
      pk: `OLD_DINO#${old.dinosaur_id}`,
      sk: "LEGACY"
    });
  });

  await deleteBatch.execute();
}
```

### Batch analytics

```ts
// Batch operations for analytics
async function generateExpeditionReport(expeditionId: string) {
  // Get all dinosaurs found in expedition
  const getBatch = table.batchBuilder();
  expeditionDinosaurIds.forEach(id => dinoRepo.get({ id }).withBatch(getBatch));
  const { reads } = await getBatch.execute();
  const expeditionDinosaurs = reads.itemsByType.Dinosaur;

  // Batch create analytics records
  const batch = table.batchBuilder();

  const analytics = {
    totalDiscoveries: expeditionDinosaurs.length,
    periodBreakdown: groupByPeriod(expeditionDinosaurs),
    dietBreakdown: groupByDiet(expeditionDinosaurs),
    averageWeight: calculateAverageWeight(expeditionDinosaurs)
  };

  // Store various analytics views
  analyticsRepo.create({
    id: `expedition-${expeditionId}`,
    type: "summary",
    data: analytics
  }).withBatch(batch);

  // Individual period analytics
  Object.entries(analytics.periodBreakdown).forEach(([period, count]) => {
    analyticsRepo.create({
      id: `expedition-${expeditionId}-${period}`,
      type: "period",
      period,
      count
    }).withBatch(batch);
  });

  await batch.execute();
}
```

## Related guides

- **[Transactions →](transactions.md)** - ACID operations for consistency
- **[Table Operations →](table-query-builder.md)** - Indexes, scans, and parallel scan segments
- **[Error Handling →](error-handling.md)** - Handle batch failures gracefully
- **[Entity Pattern →](entities.md)** - Type-safe entity operations
