# 🔒 ACID Transactions

ACID transactions let you perform multiple operations atomically - either all succeed or all fail. Perfect for maintaining data consistency in your dinosaur research database!

## 📋 Quick Reference

```typescript
// Multi-table atomic operations
await table.transactWrite([
  dinoRepo.put({
    id: "trex-001",
    species: "T-Rex",
    status: "discovered"
  }),
  expeditionRepo.update({ expeditionId: "exp-123" })
    .set({ remainingSlots: op => op.subtract(1) })
    .condition(op => op.gt("remainingSlots", 0)),
  budgetRepo.update({ department: "paleontology" })
    .set({ spentAmount: op => op.add(50000) })
]);
```

## ✨ Transaction Types

### Write Transactions
Perform up to 25 write operations atomically:

```typescript
// Dinosaur discovery workflow
await table.transactWrite([
  // 1. Register the discovery
  dinoRepo.put({
    id: "spino-042",
    species: "Spinosaurus",
    discoveredAt: new Date(),
    status: "pending-verification"
  }),

  // 2. Update expedition progress
  expeditionRepo.update({ id: "sahara-2024" })
    .set({
      totalDiscoveries: op => op.add(1),
      lastDiscovery: new Date()
    }),

  // 3. Reserve lab slot
  labRepo.update({ location: "paleontology-lab" })
    .set({ occupiedSlots: op => op.add(1) })
    .condition(op => op.lt("occupiedSlots", "maxCapacity"))
]);
```

### Read Transactions
Get consistent snapshot across multiple items:

```typescript
// Get expedition status with consistent data
const snapshot = await table.transactGet([
  dinoRepo.get({ id: "trex-001" }),
  expeditionRepo.get({ id: "montana-dig" }),
  budgetRepo.get({ department: "paleontology" })
]);

// All data is from the same point in time
const [dino, expedition, budget] = snapshot;
```

## 🎯 Common Patterns

### Conditional Updates
Ensure business rules are enforced:

```typescript
// Transfer dinosaur between expeditions
await table.transactWrite([
  // Remove from source expedition
  expeditionRepo.update({ id: "expedition-a" })
    .set({ dinoCount: op => op.subtract(1) })
    .condition(op => op.gt("dinoCount", 0)),

  // Add to target expedition
  expeditionRepo.update({ id: "expedition-b" })
    .set({ dinoCount: op => op.add(1) })
    .condition(op => op.lt("dinoCount", "maxCapacity")),

  // Update dinosaur assignment
  dinoRepo.update({ id: "trex-001" })
    .set({ assignedExpedition: "expedition-b" })
    .condition(op => op.eq("status", "active"))
]);
```

### Inventory Management
Track resources atomically:

```typescript
// Equipment checkout system
await table.transactWrite([
  // Reserve equipment
  equipmentRepo.update({ id: "excavator-pro" })
    .set({
      status: "checked-out",
      checkedOutBy: "researcher-123",
      checkedOutAt: new Date()
    })
    .condition(op => op.eq("status", "available")),

  // Update researcher's equipment list
  researcherRepo.update({ id: "researcher-123" })
    .set({
      checkedOutEquipment: op => op.listAppend(["excavator-pro"])
    }),

  // Log the transaction
  activityLogRepo.put({
    id: `checkout-${Date.now()}`,
    action: "equipment-checkout",
    equipment: "excavator-pro",
    researcher: "researcher-123",
    timestamp: new Date()
  })
]);
```

## 🚨 Error Handling

Transactions can fail for several reasons:

```typescript
try {
  await table.transactWrite([
    dinoRepo.put({ id: "new-dino", species: "Unknown" }),
    expeditionRepo.update({ id: "exp-1" })
      .set({ dinoCount: op => op.add(1) })
  ]);
} catch (error) {
  if (error.name === "TransactionCanceledException") {
    // One of the conditions failed
    console.log("Transaction cancelled:", error.CancellationReasons);
  } else if (error.name === "ValidationException") {
    // Invalid operation or too many items
    console.log("Invalid transaction:", error.message);
  }
}
```

### Handling Cancellation Reasons

```typescript
try {
  await table.transactWrite(operations);
} catch (error) {
  if (error.name === "TransactionCanceledException") {
    error.CancellationReasons?.forEach((reason, index) => {
      if (reason.Code === "ConditionalCheckFailed") {
        console.log(`Operation ${index} failed condition check`);
      } else if (reason.Code === "ItemCollectionSizeLimitExceeded") {
        console.log(`Operation ${index} exceeded item collection limit`);
      }
    });
  }
}
```

## ⚡ Performance Tips

### Minimize Cross-Partition Operations
```typescript
// ❌ Avoid: Operations across many partitions
await table.transactWrite([
  dinoRepo.update({ id: "dino-1" }), // partition: DINO#dino-1
  dinoRepo.update({ id: "dino-2" }), // partition: DINO#dino-2
  dinoRepo.update({ id: "dino-3" }), // partition: DINO#dino-3
]);

// ✅ Better: Group operations by partition when possible
await table.transactWrite([
  expeditionRepo.update({ id: "exp-1" }), // partition: EXP#exp-1
  expeditionRepo.update({ id: "exp-1", type: "timeline" }), // Same partition
  expeditionRepo.update({ id: "exp-1", type: "budget" }), // Same partition
]);
```

### Batch Related Operations
```typescript
// Process discoveries in logical groups
const discoveries = await getNewDiscoveries();

for (const batch of chunks(discoveries, 25)) {
  await table.transactWrite(
    batch.map(discovery =>
      dinoRepo.put(discovery)
        .condition(op => op.attributeNotExists("id"))
    )
  );
}
```

## 🔧 Advanced Patterns

### Saga Pattern for Complex Workflows
```typescript
class DinosaurDiscoveryWorkflow {
  async execute(discoveryData: DinosaurDiscovery) {
    const steps = [
      () => this.registerDiscovery(discoveryData),
      () => this.assignToExpedition(discoveryData),
      () => this.allocateResources(discoveryData),
      () => this.notifyTeam(discoveryData)
    ];

    const rollbacks = [];

    try {
      for (const step of steps) {
        const rollback = await step();
        rollbacks.push(rollback);
      }
    } catch (error) {
      // Execute rollbacks in reverse order
      for (const rollback of rollbacks.reverse()) {
        await rollback();
      }
      throw error;
    }
  }
}
```

### Optimistic Locking with Transactions
```typescript
// Update with version check
await table.transactWrite([
  dinoRepo.update({ id: "trex-001" })
    .set({
      classification: "updated-classification",
      version: op => op.add(1)
    })
    .condition(op => op.eq("version", currentVersion))
]);
```

## 📚 Related Guides

- [Batch Operations](./batch-operations.md) - For non-transactional bulk operations
- [Error Handling](./error-handling.md) - Comprehensive error handling strategies
- [Performance](./performance.md) - Optimization techniques
- [Type Safety](./type-safety.md) - TypeScript integration

## 🎓 Best Practices

1. **Keep transactions small** - Max 25 operations, fewer is better
2. **Use conditions wisely** - Prevent race conditions and enforce business rules
3. **Handle failures gracefully** - Always implement proper error handling
4. **Group by partition** - Minimize cross-partition operations for better performance
5. **Version your data** - Use version fields for optimistic locking patterns
