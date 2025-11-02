# ⚡ Batch Operations Guide

Efficiently handle multiple dinosaur records with dyno-table's powerful batch operations.

## 🦕 Why Use Batch Operations?

Batch operations let you:
- **Process multiple items** in a single API call
- **Reduce latency** compared to individual operations
- **Handle bulk operations** efficiently
- **Maintain consistency** across related items

Perfect for scenarios like importing fossil discoveries or updating museum collections!

## 📖 Table of Contents

- [Batch Get Operations](#-batch-get-operations)
- [Batch Write Operations](#-batch-write-operations)
- [Entity Batch Operations](#-entity-batch-operations)
- [Performance Considerations](#-performance-considerations)
- [Error Handling](#-error-handling)
- [Advanced Patterns](#-advanced-patterns)

## 🔍 Batch Get Operations

### Basic Batch Get

Get multiple dinosaurs efficiently:

```ts
// Get several dinosaurs at once
const dinosaurs = await table.batchGet<Dinosaur>([
  { pk: "DINO#t-rex-001", sk: "PROFILE" },
  { pk: "DINO#triceratops-001", sk: "PROFILE" },
  { pk: "DINO#stegosaurus-001", sk: "PROFILE" },
  { pk: "DINO#brontosaurus-001", sk: "PROFILE" }
]).execute();

for await (const dino of dinosaurs) {
  console.log(`Found ${dino.species} from ${dino.period} period`);
}
```

### Entity Batch Get

Use entities for type-safe batch operations:

```ts
// Batch get with entities (automatic key generation)
const expeditionDinosaurs = await dinoRepo.batchGet([
  { id: "t-rex-001" },
  { id: "triceratops-001" },
  { id: "stegosaurus-001" },
  { id: "velociraptor-001" }
]).execute();

// Process results
const expeditionReport = expeditionDinosaurs.map(dino => ({
  species: dino.species,
  period: dino.period,
  dangerLevel: dino.diet === "carnivore" ? "HIGH" : "LOW",
  weight: dino.weight
}));
```

### Cross-Collection Batch Get

Get items from different collections:

```ts
// Mix dinosaurs, paleontologists, and discoveries
const expeditionData = await table.batchGet([
  { pk: "DINO#t-rex-001", sk: "PROFILE" },
  { pk: "PALEO#brown-001", sk: "PROFILE" },
  { pk: "DISCOVERY#montana-1905", sk: "DETAILS" },
  { pk: "MUSEUM#amnh", sk: "COLLECTION" }
]).execute();
```

## 📝 Batch Write Operations

### Batch Create Multiple Items

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

### Entity Batch Write

```ts
// Batch write with entities (automatic validation!)
const batch = table.batchBuilder();

newDiscoveries.forEach(dino => {
  dinoRepo.create(dino).withBatch(batch);
});

await batch.execute();
```

### Mixed Batch Operations

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

## 🦴 Entity Batch Operations

### Repository Batch Methods

```ts
// Batch get with type safety
const museumCollection = await dinoRepo.batchGet([
  { id: "t-rex-001" },
  { id: "triceratops-001" },
  { id: "stegosaurus-001" }
]).execute();

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

### Batch with Different Entities

```ts
// Coordinate operations across multiple entities
const batch = table.batchBuilder();

// Create dinosaur record
dinoRepo.create(newDinosaur).withBatch(batch);

// Update paleontologist's discovery count
paleoRepo.update(
  { id: newDinosaur.discoveredBy },
  { discoveriesCount: val => val.add(1) }
).withBatch(batch);

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

## ⚡ Performance Considerations

### Batch Size Limits

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

### Conditional Failures

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

## 🎯 Advanced Patterns

### Batch with Transactions

For ACID compliance across batches:

```ts
// Use transactions for smaller, consistent operations
await table.transaction(tx => [
  dinoRepo.create(newDinosaur).withTransaction(tx),
  paleoRepo.update(
    { id: paleontologistId },
    { discoveriesCount: val => val.add(1) }
  ).withTransaction(tx),
  museumRepo.update(
    { id: museumId },
    { collectionsCount: val => val.add(1) }
  ).withTransaction(tx)
]);
```

### Batch Data Migration

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

### Batch Analytics

```ts
// Batch operations for analytics
async function generateExpeditionReport(expeditionId: string) {
  // Get all dinosaurs found in expedition
  const expeditionDinosaurs = await dinoRepo.batchGet(
    expeditionDinosaurIds.map(id => ({ id }))
  ).execute();

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

## 🧭 Related Guides

- **[Transactions →](transactions.md)** - ACID operations for consistency
- **[Performance →](performance.md)** - Optimize your database operations
- **[Error Handling →](error-handling.md)** - Handle batch failures gracefully
- **[Entity Pattern →](entities.md)** - Type-safe entity operations

---

*Batch operations: Because even paleontologists need to process multiple fossil discoveries efficiently! 🦕⚡*
