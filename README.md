# 🦖 dyno-table [![npm version](https://img.shields.io/npm/v/dyno-table.svg?style=flat-square)](https://www.npmjs.com/package/dyno-table) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

**A type-safe, fluent interface for DynamoDB single-table designs**  
*Tame the NoSQL wilderness with a robust abstraction layer that brings order to DynamoDB operations*

<img src="docs/images/geoff-the-dyno.png" width="400" height="250" alt="Geoff the Dyno" style="float: right; margin-left: 20px; margin-bottom: 20px;">

```ts
// Type-safe DynamoDB operations made simple
await table
  .update<Dinosaur>({
    pk: 'SPECIES#trex',
    sk: 'PROFILE#001'
  })
  .set('diet', 'Carnivore')
  .add('sightings', 1)
  .condition(op => op.eq('status', 'ACTIVE'))
  .execute();
```

## 🌟 Why dyno-table?

- **🧩 Single-table design made simple** - Clean abstraction layer for complex DynamoDB patterns
- **🛡️ Type-safe operations** - Full TypeScript support with strict type checking
- **⚡ Fluent API** - Chainable builder pattern for complex operations
- **🔒 Transactional safety** - ACID-compliant operations with easy-to-use transactions
- **📈 Scalability built-in** - Automatic batch chunking and pagination handling

## 📦 Installation

```bash
npm install dyno-table
```

*Note: Requires AWS SDK v3 as peer dependency*

```bash
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

## 🚀 Quick Start

### 1. Configure Your Table

```ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Table } from "dyno-table";

// Configure AWS SDK clients
const client = new DynamoDBClient({ region: "us-west-2" });
const docClient = DynamoDBDocument.from(client);

// Initialize table with single-table design schema
const dinoTable = new Table(docClient, {
  name: "DinosaurPark",
  partitionKey: "pk",
  sortKey: "sk",
  gsis: [
    {
      name: "GSI1",
      keySchema: {
        pk: "GSI1PK",
        sk: "GSI1SK",
      },
    },
  ],
});
```

### 2. Define Your Repository

```ts
import { Entity } from "dyno-table";

type Dinosaur = {
  speciesId: string;
  name: string;
  diet: "herbivore" | "carnivore" | "omnivore";
  length: number;
  discoveryYear: number;
};

// Create an entity for dinosaurs
const dinoEntity = dinoTable.entity<Dinosaur>({
  discriminator: "DINOSAUR", // Automatic type scoping
  timestamps: true, // Adds createdAt and updatedAt
});

// Or extend with custom methods
class DinoRepository extends Entity<Dinosaur> {
  // Custom query methods
  async findCarnivores() {
    return this.query("SPECIES#carnivore")
      .whereEquals("diet", "carnivore")
      .execute();
  }
}

const dinoRepo = new DinoRepository(dinoTable, {
  discriminator: "DINOSAUR",
  timestamps: true,
});
```

### 3. Perform Type-Safe Operations

**🦖 Creating a new dinosaur**
```ts
const rex = await dinoTable
  .create<Dinosaur>({
    pk: "SPECIES#trex",
    sk: "PROFILE#trex",
    speciesId: "trex",
    name: "Tyrannosaurus Rex",
    diet: "carnivore",
    length: 12.3,
    discoveryYear: 1902
  })
  .execute();
```

**🔍 Query with conditions**
```ts
const largeDinos = await dinoTable
  .query<Dinosaur>({ 
    pk: "SPECIES#trex",
    sk: (op) => op.beginsWith("PROFILE#")
  })
  .filter((op) => op.and(
    op.gte("length", 10),
    op.eq("diet", "carnivore")
  ))
  .limit(10)
  .execute();
```

**🔄 Complex update operation**
```ts
await dinoTable
  .update<Dinosaur>({ 
    pk: "SPECIES#trex", 
    sk: "PROFILE#trex" 
  })
  .set("diet", "omnivore")
  .add("discoveryYear", 1)
  .remove("outdatedField")
  .condition((op) => op.attributeExists("discoverySite"))
  .execute();
```

## 🧩 Advanced Features

### Transactional Operations

**Atomic updates across multiple entities**
```ts
// Start a transaction session
await dinoTable.transaction(async (tx) => {
  // Use familiar table methods with transaction context
  // All operations are collected and executed as a single transaction
  
  // Create a new dinosaur
  await dinoTable
    .create<Dinosaur>({
      pk: "SPECIES#trex",
      sk: "PROFILE#001",
      name: "Tyrannosaurus Rex",
      diet: "carnivore",
      length: 12.3,
      discoveryYear: 1902
    })
    .withTransaction(tx);
  
  // Update enclosure occupancy
  await dinoTable
    .update<Enclosure>({ 
      pk: "ENCLOSURE#NW", 
      sk: "STATUS#current" 
    })
    .set("occupants", 1)
    .set("lastUpdated", new Date().toISOString())
    .withTransaction(tx);
  
  // Remove from waitlist with condition
  await dinoTable
    .delete({ 
      pk: "WAITLIST#trex", 
      sk: "PROFILE#001" 
    })
    .condition(op => op.eq("status", "PENDING"))
    .withTransaction(tx);
    
  // Add a condition check without modifying data
  await dinoTable
    .conditionCheck({ 
      pk: "PARK#main", 
      sk: "STATUS#current" 
    })
    .condition(op => op.eq("status", "OPEN"))
    .withTransaction(tx);
});

// You can also set transaction options
await dinoTable.transaction(
  async (tx) => {
    await dinoTable.create(newDino).withTransaction(tx);
    await dinoTable.delete(oldDinoKey).withTransaction(tx);
  },
  {
    clientRequestToken: "unique-request-id",
    returnConsumedCapacity: "TOTAL"
  }
);
```

**Benefits of this transaction approach:**
- 🔄 Uses the same familiar API as non-transactional operations
- 🧠 Maintains consistent mental model for developers
- 🔒 All operations within the callback are executed as a single transaction
- ✅ All-or-nothing operations (ACID compliance)
- 🛡️ Prevents race conditions and data inconsistencies
- 📊 Supports up to 100 actions per transaction
```

### Batch Processing

**Efficient bulk operations with automatic chunking**
```ts
// Batch get multiple items at once
const keys = [
  { pk: "SPECIES#trex", sk: "PROFILE#001" },
  { pk: "SPECIES#raptor", sk: "PROFILE#001" },
  { pk: "SPECIES#stego", sk: "PROFILE#001" }
];

const { items, unprocessedKeys } = await dinoTable.batchGet<Dinosaur>(keys);
console.log(`Retrieved ${items.length} dinosaurs`);

// Batch write (create/update) multiple items
const newDinos = [
  { pk: "SPECIES#anky", sk: "PROFILE#001", name: "Ankylosaurus", diet: "herbivore" },
  { pk: "SPECIES#brach", sk: "PROFILE#001", name: "Brachiosaurus", diet: "herbivore" }
];

await dinoTable.batchWrite(
  newDinos.map(dino => ({
    type: "put",
    item: dino
  }))
);

// Batch write with mixed operations
await dinoTable.batchWrite([
  { type: "delete", key: { pk: "SPECIES#trex", sk: "PROFILE#001" } },
  { type: "put", item: { pk: "SPECIES#raptor", sk: "PROFILE#002", name: "Velociraptor 2" } },
  { type: "delete", key: { pk: "SPECIES#stego", sk: "PROFILE#001" } }
]);

// Large batches are automatically chunked to respect DynamoDB limits
// (25 items per batch write, 100 items per batch get)
const manyOperations = generateManyOperations(); // Even if this has hundreds of operations
await dinoTable.batchWrite(manyOperations); // Will be automatically chunked
```

### Pagination Made Simple

**Page large datasets effortlessly**
```ts
// Create a paginator with a page size of 10
const paginator = dinoTable
  .query<Dinosaur>({
    pk: "SPECIES#herbivore"
  })
  .filter((op) => op.gt("length", 5))
  .paginate(10); // Get pages of 10 items

// Check if there are more pages
while (paginator.hasNextPage()) {
  // Get the next page of results
  const page = await paginator.getNextPage();
  console.log(`Processing page ${page.page} with ${page.items.length} items`);
  processBatch(page.items);
}

// Or get all pages at once
const allDinos = await dinoTable
  .query<Dinosaur>({ pk: "SPECIES#carnivore" })
  .paginate(25)
  .getAllPages();

// You can also set an overall limit on the total number of items
// The paginator will respect this limit even if more data is available
const limitedPaginator = dinoTable
  .query<Dinosaur>({ pk: "SPECIES#all" })
  .limit(100) // Retrieve at most 100 items total
  .paginate(20); // In pages of 20 items each
```

## 🛡️ Type-Safe Query Building

Dyno-table provides comprehensive query methods that match DynamoDB's capabilities while maintaining type safety:

| Operation                  | Method Example                                               |
|----------------------------|--------------------------------------------------------------|
| **Conditional Updates**    | `.filter(op => op.eq("status", "ACTIVE"))`                   |
| **Attribute Existence**    | `.filter(op => op.attributeExists("migrationPath"))`         |
| **Begins With**            | `.filter({ sk: op => op.beginsWith("PROFILE#2023") })`       |
| **Nested Attributes**      | `.filter(op => op.eq("address.city", "London"))`             |
| **Between Values**         | `.filter(op => op.between("age", 18, 65))`                   |
| **Type Checks**            | `.filter(op => op.attributeType("score", "N"))`              |
| **Between**                | `.filter(op => op.between("score", 20, 100))`                |

```ts
// Complex type-safe query example
const results = await dinoTable
  .query<Dinosaur>({
    pk: "SPECIES#carnivore",
    sk: (op) => op.between("PROFILE#100", "PROFILE#200")
  })
  .filter((op) => op.and(
    op.beginsWith("discoverySite", "Canada"),
    op.attributeType("mass", "N"),
    op.gte("length", 8.5)
  ))
  .useIndex("GSI1")
  .execute();
```

## 🏗️ Entity Pattern Best Practices

The entity implementation provides automatic type isolation:

```ts
// All operations are automatically scoped to DINOSAUR type
const dinosaur = await dinoEntity.get("SPECIES#trex", "PROFILE#trex"); 
// Returns Dinosaur | undefined

// Cross-type operations are prevented at compile time
dinoEntity.create({ /* invalid shape */ }); // TypeScript error
```

**Key benefits:**
- 🚫 Prevents accidental cross-type data access
- 🔍 Automatically filters queries/scans to repository type
- 🛡️ Ensures consistent key structure across entities
- 📦 Encapsulates domain-specific query logic

## 🚨 Error Handling - TODO

Dyno-table provides enhanced error handling for DynamoDB operations:

Taking DynamoDB errors and adding additional context specific to the operation and entity. To allow easier debugging and handling of errors.

```ts
try {
  await dinoTable
    .put<Dinosaur>(existingDino)
    .condition((op) => op.attributeNotExists("pk"))
    .execute();
} catch (error) {
  if (error instanceof ConditionalCheckFailedError) {
    // Handle conditional failure
    console.log("Dinosaur already exists!");
  }

  if (error instanceof TransactionCanceledException) {
    // Inspect transaction cancellation reasons
    error.cancellationReasons?.forEach(reason => {
      console.log(`Transaction failed: ${reason.Code}`);
    });
  }
}
```

## 📚 API Reference

### Condition Operators

All condition operators are type-safe and will validate against your item type. For detailed information about DynamoDB conditions and expressions, see the [AWS DynamoDB Developer Guide](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html).

#### Comparison Operators
- `eq(attr, value)` - Equals (=)
- `ne(attr, value)` - Not equals (≠)
- `lt(attr, value)` - Less than (<)
- `lte(attr, value)` - Less than or equal to (≤)
- `gt(attr, value)` - Greater than (>)
- `gte(attr, value)` - Greater than or equal to (≥)
- `between(attr, lower, upper)` - Between two values (inclusive)
- `beginsWith(attr, value)` - Checks if string begins with value
- `contains(attr, value)` - Checks if string/set contains value

```ts
// Example: Using comparison operators
await dinoTable
  .query<Dinosaur>({
    pk: "SPECIES#trex"
  })
  .filter((op) => op.and(
    op.gte("length", 10),
    op.contains("diet", "carnivore"),
    op.between("discoveryYear", 1900, 2000)
  ))
  .execute();
```

#### Attribute Operators
- `attributeExists(attr)` - Checks if attribute exists
- `attributeNotExists(attr)` - Checks if attribute does not exist

```ts
// Example: Using attribute operators
await dinoTable
  .update<Dinosaur>({
    pk: "SPECIES#trex", 
    sk: "PROFILE#trex"
  })
  .set("status", "VERIFIED")
  .condition((op) => op.and(
    op.attributeExists("discoveryDate"),
    op.attributeNotExists("deletedAt")
  ))
  .execute();
```

#### Logical Operators
- `and(...conditions)` - Combines conditions with AND
- `or(...conditions)` - Combines conditions with OR
- `not(condition)` - Negates a condition

```ts
// Example: Complex logical conditions
await dinoTable
  .query<Dinosaur>({
    pk: "SPECIES#all"
  })
  .filter((op) => op.or(
    op.and(
      op.eq("status", "ACTIVE"),
      op.gt("length", 15)
    ),
    op.and(
      op.eq("diet", "carnivore"),
      op.not(op.eq("status", "EXTINCT"))
    )
  ))
  .execute();
```

### Key Condition Operators

Special operators for sort key conditions in queries. See [AWS DynamoDB Key Condition Expressions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.html#Query.KeyConditionExpressions) for more details.

```ts
// Example: Key condition with begins_with
const recentProfiles = await dinoTable
  .query<Dinosaur>({
    pk: "SPECIES#carnivore",
    sk: (op) => op.beginsWith("PROFILE#2023")
  })
  .execute();

// Example: Key condition with between
const alphabeticalProfiles = await dinoTable
  .query<Dinosaur>({
    pk: "SPECIES#herbivore",
    sk: (op) => op.between("PROFILE#A", "PROFILE#Z")
  })
  .execute();
```

Available key conditions:
- `eq(value)` - Equals
- `lt(value)` - Less than
- `lte(value)` - Less than or equal
- `gt(value)` - Greater than
- `gte(value)` - Greater than or equal
- `between(lower, upper)` - Between range
- `beginsWith(value)` - Begins with prefix

## 🔮 Future Roadmap

- [ ] Enhanced query plan visualization
- [ ] Migration tooling
- [ ] Local secondary index support
- [ ] Multi-table transaction support

## 🤝 Contributing

```bash
# Set up development environment
pnpm install

# Run tests (requires local DynamoDB)
pnpm run ddb:start
pnpm test

# Build the project
pnpm build
```
