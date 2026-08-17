# 🔒 ACID Transactions

ACID transactions let you perform multiple operations atomically - either all succeed or all fail.

## 📋 Quick Reference

```typescript
await table.transaction(async (tx) => {
  dinoRepo.create({
    id: "trex-001",
    species: "T-Rex",
    status: "discovered"
  }).withTransaction(tx);

  expeditionRepo.update({ expeditionId: "exp-123" }, {})
    .add("remainingSlots", -1)
    .condition(op => op.gt("remainingSlots", 0))
    .withTransaction(tx);

  budgetRepo.update({ department: "paleontology" }, {})
    .add("spentAmount", 50000)
    .withTransaction(tx);
});

// Alternative: Builder pattern (for programmatic construction)
const tx = table.transactionBuilder();
dinoRepo.create({ id: "trex-001", species: "T-Rex", status: "discovered" }).withTransaction(tx);
expeditionRepo.update({ expeditionId: "exp-123" }, {})
  .add("remainingSlots", -1)
  .condition(op => op.gt("remainingSlots", 0))
  .withTransaction(tx);
await tx.execute();
```

## 🎨 Choosing a Pattern

### Callback Pattern (Recommended)

```typescript
// ✅ Preferred approach
await table.transaction(async (tx) => {
  repo.create({ id: "1", name: "Item 1" }).withTransaction(tx);
  repo.update({ id: "2" }, {}).add("count", 1).withTransaction(tx);
});
```

### Builder Pattern
Use `table.transactionBuilder()` when you need to:
- Conditionally build transactions based on runtime logic
- Construct transactions programmatically across multiple functions
- Defer execution until a specific point

```typescript
// Use builder for conditional/programmatic construction
const tx = table.transactionBuilder();

if (shouldCreateNew) {
  repo.create(newItem).withTransaction(tx);
} else {
  repo.update(existingKey, updates).withTransaction(tx);
}

if (updateRelated) {
  relatedRepo.update(relatedKey, relatedUpdates).withTransaction(tx);
}

await tx.execute(); // Explicit execution when ready
```

## ✨ Transaction Types

### Write Transactions
Perform up to 25 write operations atomically:

```typescript
// Dinosaur discovery workflow
await table.transaction(async (tx) => {
  // 1. Register the discovery
  dinoRepo.create({
    id: "spino-042",
    species: "Spinosaurus",
    discoveredAt: new Date(),
    status: "pending-verification"
  }).withTransaction(tx);

  // 2. Update expedition progress
  expeditionRepo.update({ id: "sahara-2024" }, { lastDiscovery: new Date() })
    .add("totalDiscoveries", 1)
    .withTransaction(tx);

  // 3. Reserve lab slot
  expeditionRepo.update({ location: "paleontology-lab" }, {})
    .add("occupiedSlots", 1)
    .condition(op => op.lt("occupiedSlots", "maxCapacity"))
    .withTransaction(tx);
});
```

### Read Transactions
Get consistent snapshot across multiple items:

```typescript
// Note: Read transactions are not currently supported in this library
// For consistent reads, use DynamoDB's native transactGet via AWS SDK
// This library focuses on write transactions for now
```

## 🎯 Common Patterns

Transactions become powerful when combined with conditions to enforce business rules atomically.

**→ For comprehensive conditional operation patterns, see [Conditions Guide](./conditions.md)**

### Conditional Updates
Ensure business rules are enforced:

**→ For detailed condition patterns and examples, see [Conditions Guide](./conditions.md)**

```typescript
// Transfer dinosaur between expeditions
await table.transaction(async (tx) => {
  // Remove from source expedition
  expeditionRepo.update({ id: "expedition-a" }, {})
    .add("dinoCount", -1)
    .condition(op => op.gt("dinoCount", 0))
    .withTransaction(tx);

  // Add to target expedition
  expeditionRepo.update({ id: "expedition-b" }, {})
    .add("dinoCount", 1)
    .condition(op => op.lt("dinoCount", "maxCapacity"))
    .withTransaction(tx);

  // Update dinosaur assignment
  dinoRepo.update({ id: "trex-001" }, { assignedExpedition: "expedition-b" })
    .condition(op => op.eq("status", "active"))
    .withTransaction(tx);
});
```

### Inventory Management
Track resources atomically:

```typescript
// Equipment checkout system
await table.transaction(async (tx) => {
  // Reserve equipment
  equipmentRepo.update({ id: "excavator-pro" }, {
      status: "checked-out",
      checkedOutBy: "researcher-123",
      checkedOutAt: new Date()
    })
    .condition(op => op.eq("status", "available"))
    .withTransaction(tx);

  // Add to researcher's checked-out-equipment set
  researcherRepo.update({ id: "researcher-123" }, {})
    .add("checkedOutEquipment", new Set(["excavator-pro"]))
    .withTransaction(tx);

  // Log the transaction
  activityLogRepo.create({
    id: `checkout-${Date.now()}`,
    action: "equipment-checkout",
    equipment: "excavator-pro",
    researcher: "researcher-123",
    timestamp: new Date()
  }).withTransaction(tx);
});
```

### Optimistic Locking with Transactions
```typescript
// Update with version check
await table.transaction(async (tx) => {
  dinoRepo.update({ id: "trex-001" }, { classification: "updated-classification" })
    .add("version", 1)
    .condition(op => op.eq("version", currentVersion))
    .withTransaction(tx);
});
```

## 📚 Related Guides

- [Batch Operations](./batch-operations.md) - For non-transactional bulk operations
