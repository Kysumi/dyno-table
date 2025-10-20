# 🔒 ACID Transactions

ACID transactions let you perform multiple operations atomically - either all succeed or all fail.

## 📋 Quick Reference

```typescript
// Multi-table atomic operations using callback-based API
await table.transaction(async (tx) => {
  tx.putWithCommand(dinoRepo.put({
    id: "trex-001",
    species: "T-Rex",
    status: "discovered"
  }));

  tx.updateWithCommand(expeditionRepo.update({ expeditionId: "exp-123" })
    .set({ remainingSlots: op => op.subtract(1) })
    .condition(op => op.gt("remainingSlots", 0)));

  tx.updateWithCommand(budgetRepo.update({ department: "paleontology" })
    .set({ spentAmount: op => op.add(50000) }));
});

// Or using builder pattern
const tx = table.transactionBuilder();
tx.putWithCommand(dinoRepo.put({ id: "trex-001", species: "T-Rex", status: "discovered" }));
tx.updateWithCommand(expeditionRepo.update({ expeditionId: "exp-123" })
  .set({ remainingSlots: op => op.subtract(1) })
  .condition(op => op.gt("remainingSlots", 0)));
await tx.execute();
```

## ✨ Transaction Types

### Write Transactions
Perform up to 25 write operations atomically:

```typescript
// Dinosaur discovery workflow
await table.transaction(async (tx) => {
  // 1. Register the discovery
  tx.putWithCommand(dinoRepo.put({
    id: "spino-042",
    species: "Spinosaurus",
    discoveredAt: new Date(),
    status: "pending-verification"
  }));

  // 2. Update expedition progress
  tx.updateWithCommand(expeditionRepo.update({ id: "sahara-2024" })
    .set({
      totalDiscoveries: op => op.add(1),
      lastDiscovery: new Date()
    }));

  // 3. Reserve lab slot
  tx.updateWithCommand(expeditionRepo.update({ location: "paleontology-lab" })
    .set({ occupiedSlots: op => op.add(1) })
    .condition(op => op.lt("occupiedSlots", "maxCapacity")));
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
  tx.updateWithCommand(expeditionRepo.update({ id: "expedition-a" })
    .set({ dinoCount: op => op.subtract(1) })
    .condition(op => op.gt("dinoCount", 0)));

  // Add to target expedition
  tx.updateWithCommand(expeditionRepo.update({ id: "expedition-b" })
    .set({ dinoCount: op => op.add(1) })
    .condition(op => op.lt("dinoCount", "maxCapacity")));

  // Update dinosaur assignment
  tx.updateWithCommand(dinoRepo.update({ id: "trex-001" })
    .set({ assignedExpedition: "expedition-b" })
    .condition(op => op.eq("status", "active")));
});
```

### Inventory Management
Track resources atomically:

```typescript
// Equipment checkout system
await table.transaction(async (tx) => {
  // Reserve equipment
  tx.updateWithCommand(equipmentRepo.update({ id: "excavator-pro" })
    .set({
      status: "checked-out",
      checkedOutBy: "researcher-123",
      checkedOutAt: new Date()
    })
    .condition(op => op.eq("status", "available")));

  // Update researcher's equipment list
  tx.updateWithCommand(researcherRepo.update({ id: "researcher-123" })
    .set({
      checkedOutEquipment: op => op.listAppend(["excavator-pro"])
    }));

  // Log the transaction
  tx.putWithCommand(activityLogRepo.put({
    id: `checkout-${Date.now()}`,
    action: "equipment-checkout",
    equipment: "excavator-pro",
    researcher: "researcher-123",
    timestamp: new Date()
  }));
});
```

## 🚨 Error Handling

Transactions can fail for several reasons:

```typescript
try {
  await table.transaction(async (tx) => {
    tx.putWithCommand(dinoRepo.put({ id: "new-dino", species: "Unknown" }));
    tx.updateWithCommand(expeditionRepo.update({ id: "exp-1" })
      .set({ dinoCount: op => op.add(1) }));
  });
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

### Optimistic Locking with Transactions
```typescript
// Update with version check
await table.transaction(async (tx) => {
  tx.updateWithCommand(dinoRepo.update({ id: "trex-001" })
    .set({
      classification: "updated-classification",
      version: op => op.add(1)
    })
    .condition(op => op.eq("version", currentVersion)));
});
```

## 📚 Related Guides

- [Batch Operations](./batch-operations.md) - For non-transactional bulk operations
- [Error Handling](./error-handling.md) - Comprehensive error handling strategies
- [Type Safety](./type-safety.md) - TypeScript integration
