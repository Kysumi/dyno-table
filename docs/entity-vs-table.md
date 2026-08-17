# Entity vs Table: Choose Your Approach

Understand when to use entities vs direct table access in your applications.

## Quick Decision Guide

### Use **Entity Pattern** When:
- 🏢 Building applications for users
- ✅ You want schema validation
- 🎯 You prefer semantic method names (`getDinosaursByDiet()`)
- 👥 Working with a team
- 🛡️ Type safety is important
- 📈 You're building for the long term

### Use **Direct Table Access** When:
- 🔧 Building tooling or utilities
- 🎛️ You need granular control over queries
- 📊 Building data pipelines or ETL processes

## 📊 Side-by-Side Comparison

| Feature | Entity Pattern | Direct Table |
|---------|----------------|--------------|
| **Learning Curve** | 🟢 Easy | 🟡 Moderate |
| **Type Safety** | 🟢 Automatic | 🟡 Manual |
| **Schema Validation** | 🟢 Built-in | 🔴 None |
| **Query Builders** | 🟢 Full Support | 🟢 Full Support |
| **Query Syntax** | 🟢 Semantic | 🟡 DynamoDB-native |
| **Performance** | 🟡 Very Good | 🟢 Maximum |
| **Team Productivity** | 🟢 High | 🟡 Depends on expertise |
| **Maintenance** | 🟢 Easy | 🟡 Requires DynamoDB knowledge |

> **Important:** Both entity pattern and direct table access support the same powerful query builder functionality. The difference is in how you access and structure your queries, not in the capabilities available.

## 🦴 Entity Pattern Deep Dive

### What You Get

```ts
import { createIndex, createQueries, defineEntity } from "dyno-table/entity";
import { partitionKey, sortKey } from "dyno-table/utils";

const createQuery = createQueries<Dinosaur>();

// ✅ Define reusable key templates to avoid typos
const DINO_PK = partitionKey`DINO#${"id"}`;
const DINO_SK = sortKey`SPECIES#${"species"}#PERIOD#${"period"}`;
const DIET_PK = partitionKey`DIET#${"diet"}`;
const PERIOD_PK = partitionKey`PERIOD#${"period"}`;

// ✅ Define entity with schema validation and key templating
const DinosaurEntity = defineEntity({
  name: "Dinosaur",
  schema: DinosaurSchema, // Zod, ArkType, Valibot, etc.
  primaryKey: createIndex()
    .input(DinosaurSchema)
    .partitionKey(DINO_PK) // Reusable template
    .sortKey(DINO_SK), // Reusable template
  indexes: {
    byDiet: createIndex().input(DinosaurSchema).partitionKey(DIET_PK).sortKey(() => "DINO"),
    byPeriod: createIndex().input(DinosaurSchema).partitionKey(PERIOD_PK).sortKey(() => "DINO"),
    byFeatured: createIndex().input(DinosaurSchema).partitionKey(() => "FEATURED#true").sortKey(() => "DINO"),
  },
  // ✅ Define semantic query methods using reusable templates
  queries: {
    getDinosaursByDiet: createQuery
      .input(z.object({ diet: z.string() }))
      .query(({ input, entity }) =>
        entity.query({ pk: DIET_PK(input) }).useIndex("byDiet")
      ),
    getDinosaursByPeriod: createQuery
      .input(z.object({ period: z.string() }))
      .query(({ input, entity }) =>
        entity.query({ pk: PERIOD_PK(input) }).useIndex("byPeriod")
      ),
    getFeaturedDinosaurs: createQuery
      .input(z.object({}))
      .query(({ entity }) =>
        entity.query({ pk: "FEATURED#true" }).useIndex("byFeatured")
      ),
  }
});

// ✅ Create repository for operations
const dinoRepo = DinosaurEntity.createRepository(table);

// This will fail at runtime with clear error
await dinoRepo.create({
  id: "rex-1",
  species: "", // ❌ Empty string fails validation
  period: "future", // ❌ Invalid enum value
  weight: -100 // ❌ Negative weight not allowed
}).execute();

// ✅ Semantic method names with full query builder support
const carnivores = await dinoRepo.query
  .getDinosaursByDiet({ diet: "carnivore" })
  .filter(op => op.and(
    op.gte("weight", 1000),
    op.lt("length", 20)
  ))
  .limit(50)
  .execute();

// ✅ Automatic key generation with templating
const { item: tRex } = await dinoRepo.get({ id: "t-rex-001" }).execute(); // Becomes pk: "DINO#t-rex-001"

// ✅ Advanced partition and sort key templating with multiple parameters
const AdvancedDinosaurEntity = defineEntity({
  name: "Dinosaur",
  schema: DinosaurSchema,
  primaryKey: createIndex()
    .input(z.object({ id: z.string(), location: z.string(), species: z.string(), diet: z.string() }))
    // Template: DINO#{id}#LOCATION#{location}
    .partitionKey(partitionKey`DINO#${"id"}#LOCATION#${"location"}`)
    // Template: SPECIES#{species}#DIET#{diet}
    .sortKey(sortKey`SPECIES#${"species"}#DIET#${"diet"}`),
});

const advancedDinoRepo = AdvancedDinosaurEntity.createRepository(table);
```

### Perfect For

**Application Development:**
```ts
// E-commerce dinosaur store
const DinosaurStore = {
  async getFeaturedDinosaurs() {
    return dinoRepo.query.getFeaturedDinosaurs().execute();
  },

  async searchByPeriod(period: Period) {
    return dinoRepo.query.getDinosaursByPeriod({ period }).execute();
  },

  async addToCollection(dinosaurData: CreateDinosaurRequest) {
    // Automatic validation ensures data quality
    return dinoRepo.create(dinosaurData).execute();
  }
};
```

**Team Collaboration:**
```ts
// Clear, self-documenting code
class PaleontologyService {
  async discoverNewSpecies(discovery: DinosaurDiscovery) {
    // Method name explains intent
    return dinoRepo.create(discovery).execute();
  }

  async getCarnivoresInPeriod(period: Period) {
    // Business logic is obvious
    return dinoRepo.query
      .getDinosaursByPeriod({ period })
      .filter(op => op.eq("diet", "carnivore"))
      .execute();
  }
}
```

## 🏗️ Direct Table Deep Dive

### What You Get

```ts
import { partitionKey, sortKey } from 'dyno-table/utils';

// ✅ Define reusable key templates for consistency across queries
const PERIOD_PK = partitionKey`PERIOD#${"period"}`;
const DINO_PK = partitionKey`DINO#${"id"}`;
const SPECIES_SK = sortKey`SPECIES#${"species"}`;
const LEGACY_PK = "LEGACY#dinosaurs"; // Static key

// ✅ Maximum control over queries with reusable templates
const results = await table
  .query({ pk: PERIOD_PK({ period: "cretaceous" }) })
  .filter(op => op.and(
    op.eq("diet", "carnivore"),
    op.gt("weight", 5000),
    op.between("discoveryYear", 1900, 2000)
  ))
  .useIndex("period-discovery-index")
  .consistentRead(true)
  .limit(50)
  .execute();

// ✅ Type safety with generics - perfect for migrations or one-off scripts
interface LegacyDinosaurRecord {
  pk: string;
  sk: string;
  oldSpeciesName: string;
  legacyWeight: number;
  migrationStatus?: string;
}

const legacyData = await table
  .query<LegacyDinosaurRecord>({ pk: LEGACY_PK })
  .filter(op => op.attributeNotExists("migrationStatus"))
  .execute();

// Now you have full type safety for migration scripts
for await (const record of legacyData) {
  // TypeScript knows about oldSpeciesName, legacyWeight, etc.
  await migrateRecord(record);
}

// ✅ Direct partition/sort key construction using templates
const dinosBySpecies = await table
  .query({
    pk: DINO_PK({ id: dinoId }), // Use template for consistency
    sk: op => op.beginsWith(SPECIES_SK({ species: speciesPrefix }))
  })
  .filter(op => op.or(
    op.and(
      op.eq("status", "display"),
      op.attributeExists("exhibitHall")
    ),
    op.eq("priority", "research")
  ))
  .execute();
```

### Perfect For

**Data Pipelines:**
```ts
// ETL process for dinosaur data
async function migrateDiscoveryData() {
  const legacyData = await table
    .scan()
    .filter(op => op.beginsWith("pk", "LEGACY#"))
    .execute();

  for await (const item of legacyData) {
    // Transform and rewrite with new schema
    await table.put({
      pk: `DINO#${item.oldId}`,
      sk: "PROFILE",
      species: transformSpeciesName(item.oldSpecies),
      // ... complex transformation logic
    }).execute();
  }
}
```

## 🧭 Next Steps

- **New to DynamoDB?** → Start with [Entity Pattern →](entities.md)
- **DynamoDB expert?** → Try [Direct Table Access →](table-query-builder.md)
- **Building apps?** → Check out [Key Design Patterns →](key-patterns.md)
- **Need validation?** → Learn about [Standard Schema Support →](entities.md#standard-schema-support)

*Choose your adventure, but remember: there's no wrong choice with dyno-table! 🦕*
