import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { docClient } from "../../tests/ddb-client";
import { createIndex, defineEntity } from "../entity/entity";
import type { StandardSchemaV1 } from "../standard-schema";
import { Table } from "../table";
import type { DynamoItem } from "../types";

// Define test entity types
interface UserEntity extends DynamoItem {
  id: string;
  name: string;
  email: string;
  status: string;
  credits?: number;
}

interface OrderEntity extends DynamoItem {
  id: string;
  userId: string;
  amount: number;
  status: string;
  items: string[];
}

// Create schemas
const userSchema: StandardSchemaV1<UserEntity> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (data: unknown) => ({ value: data as UserEntity }),
  },
};

const orderSchema: StandardSchemaV1<OrderEntity> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (data: unknown) => ({ value: data as OrderEntity }),
  },
};

const primaryKeySchema: StandardSchemaV1<{ id: string }> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (data: unknown) => ({ value: data as { id: string } }),
  },
};

// Create test table
function createTestTable(): Table {
  return new Table({
    client: docClient,
    tableName: "TestTable",
    indexes: {
      partitionKey: "demoPartitionKey",
      sortKey: "demoSortKey",
    },
  });
}

// Create entity repositories
function createRepositories() {
  const table = createTestTable();

  const userEntity = defineEntity({
    name: "User",
    schema: userSchema,
    primaryKey: createIndex()
      .input(primaryKeySchema)
      .partitionKey((item) => `USER#${item.id}`)
      .sortKey(() => "PROFILE"),
    queries: {},
    settings: {
      timestamps: {
        createdAt: { format: "ISO" },
        updatedAt: { format: "UNIX", attributeName: "modifiedAt" },
      },
    },
  });

  const orderEntity = defineEntity({
    name: "Order",
    schema: orderSchema,
    primaryKey: createIndex()
      .input(primaryKeySchema)
      .partitionKey((item) => `ORDER#${item.id}`)
      .sortKey(() => "DETAILS"),
    queries: {},
  });

  return {
    table,
    userRepository: userEntity.createRepository(table),
    orderRepository: orderEntity.createRepository(table),
  };
}

describe("Entity Integration Tests - Transaction with Create", () => {
  let table: Table;
  let userRepository: ReturnType<typeof createRepositories>["userRepository"];
  let orderRepository: ReturnType<typeof createRepositories>["orderRepository"];

  beforeAll(() => {
    const setup = createRepositories();
    table = setup.table;
    userRepository = setup.userRepository;
    orderRepository = setup.orderRepository;
  });

  beforeEach(async () => {
    // Clean up any existing test data
    const cleanupIds = [
      "tx-user-1",
      "tx-user-2",
      "tx-user-timestamps",
      "tx-user-keys",
      "tx-user-consistent",
      "existing-user",
      "new-user-tx",
      "comparison-test",
      "existing-user-mixed",
      "delete-user-mixed",
      "new-user-mixed",
      "upsert-user-tx",
      "multi-entity-user",
      "conditional-user",
      "multi-entity-order",
    ];

    // Add large transaction test users
    for (let i = 1; i <= 10; i++) {
      cleanupIds.push(`large-tx-user-${i}`);
    }

    try {
      for (const id of cleanupIds) {
        await Promise.allSettled([userRepository.delete({ id }).execute(), orderRepository.delete({ id }).execute()]);
      }
    } catch {
      // Ignore errors if items don't exist
    }
  });

  it("should create single item with transaction", async () => {
    const user: UserEntity = {
      id: "tx-user-1",
      name: "Transaction User",
      email: "tx-user@example.com",
      status: "active",
      credits: 100,
    };

    const transaction = table.transactionBuilder();

    // This should work now with our fix
    userRepository.create(user).withTransaction(transaction);

    await transaction.execute();

    // Verify the item was created
    const result = await userRepository.get({ id: "tx-user-1" }).execute();
    expect(result.item).toBeDefined();
    expect(result.item?.name).toBe("Transaction User");
    expect(result.item?.email).toBe("tx-user@example.com");
    expect(result.item?.status).toBe("active");
    expect(result.item?.credits).toBe(100);
  });

  it("should create multiple items in a single transaction", async () => {
    const user: UserEntity = {
      id: "tx-user-2",
      name: "Multi Transaction User",
      email: "multi-tx@example.com",
      status: "pending",
      credits: 50,
    };

    const order: OrderEntity = {
      id: "tx-order-1",
      userId: "tx-user-2",
      amount: 25.99,
      status: "pending",
      items: ["item1", "item2"],
    };

    const transaction = table.transactionBuilder();

    // Both creates should work with transactions
    userRepository.create(user).withTransaction(transaction);
    orderRepository.create(order).withTransaction(transaction);

    await transaction.execute();

    // Verify both items were created
    const userResult = await userRepository.get({ id: "tx-user-2" }).execute();
    const orderResult = await orderRepository.get({ id: "tx-order-1" }).execute();

    expect(userResult.item).toBeDefined();
    expect(userResult.item?.name).toBe("Multi Transaction User");
    expect(userResult.item?.status).toBe("pending");

    expect(orderResult.item).toBeDefined();
    expect(orderResult.item?.userId).toBe("tx-user-2");
    expect(orderResult.item?.amount).toBe(25.99);
    expect(orderResult.item?.status).toBe("pending");
  });

  it("should handle transaction rollback on failure", async () => {
    const user1: UserEntity = {
      id: "tx-user-1",
      name: "First User",
      email: "first@example.com",
      status: "active",
      credits: 100,
    };

    const user2: UserEntity = {
      id: "tx-user-1", // Same ID - will cause conflict
      name: "Second User",
      email: "second@example.com",
      status: "active",
      credits: 200,
    };

    // First, create user1 outside of transaction
    await userRepository.create(user1).execute();

    const transaction = table.transactionBuilder();

    // Try to create user2 with same ID (should fail due to create condition)
    userRepository.create(user2).withTransaction(transaction);

    // Transaction should fail
    await expect(transaction.execute()).rejects.toThrow();

    // Verify original user1 still exists and wasn't modified
    const result = await userRepository.get({ id: "tx-user-1" }).execute();
    expect(result.item?.name).toBe("First User");
    expect(result.item?.email).toBe("first@example.com");
    expect(result.item?.credits).toBe(100);
  });

  it("should create items with timestamps in transaction", async () => {
    const user: UserEntity = {
      id: "tx-user-timestamps",
      name: "Timestamp User",
      email: "timestamp@example.com",
      status: "active",
      credits: 75,
    };

    const transaction = table.transactionBuilder();
    const beforeCreate = new Date();

    userRepository.create(user).withTransaction(transaction);

    await transaction.execute();

    // Verify the item was created with timestamps
    const result = await userRepository.get({ id: "tx-user-timestamps" }).execute();
    expect(result.item).toBeDefined();
    expect(result.item?.name).toBe("Timestamp User");

    // Check timestamps were added
    expect(result.item?.createdAt).toBeDefined();
    expect(result.item?.modifiedAt).toBeDefined();

    if (result.item?.createdAt) {
      const createdAt = new Date(result.item.createdAt as string);
      expect(createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
    }

    if (result.item?.modifiedAt) {
      expect(typeof result.item.modifiedAt).toBe("number");
      expect(result.item.modifiedAt as number).toBeGreaterThanOrEqual(Math.floor(beforeCreate.getTime() / 1000));
    }
  });

  it("should create items with proper keys in transaction", async () => {
    const user: UserEntity = {
      id: "tx-user-keys",
      name: "Keys User",
      email: "keys@example.com",
      status: "premium",
      credits: 500,
    };

    const transaction = table.transactionBuilder();

    userRepository.create(user).withTransaction(transaction);

    await transaction.execute();

    // Verify the item was created
    const result = await userRepository.get({ id: "tx-user-keys" }).execute();
    expect(result.item).toBeDefined();
    expect(result.item?.status).toBe("premium");

    // Verify primary keys were properly set by checking the raw item
    const rawResult = await table.get({ pk: "USER#tx-user-keys", sk: "PROFILE" }).execute();
    expect(rawResult.item).toBeDefined();
    expect(rawResult.item?.demoPartitionKey).toBe("USER#tx-user-keys");
    expect(rawResult.item?.demoSortKey).toBe("PROFILE");
    expect(rawResult.item?.entityType).toBe("User");
  });

  it("should mix create and update operations in transaction", async () => {
    // First create a user outside transaction
    const existingUser: UserEntity = {
      id: "existing-user",
      name: "Existing User",
      email: "existing@example.com",
      status: "active",
      credits: 100,
    };
    await userRepository.create(existingUser).execute();

    // Now use transaction to create new user and update existing user
    const newUser: UserEntity = {
      id: "new-user-tx",
      name: "New User",
      email: "new@example.com",
      status: "pending",
      credits: 0,
    };

    const transaction = table.transactionBuilder();

    // Create new user
    userRepository.create(newUser).withTransaction(transaction);

    // Update existing user
    userRepository.update({ id: "existing-user" }, { credits: 150, status: "premium" }).withTransaction(transaction);

    await transaction.execute();

    // Verify new user was created
    const newUserResult = await userRepository.get({ id: "new-user-tx" }).execute();
    expect(newUserResult.item).toBeDefined();
    expect(newUserResult.item?.name).toBe("New User");
    expect(newUserResult.item?.status).toBe("pending");

    // Verify existing user was updated
    const existingUserResult = await userRepository.get({ id: "existing-user" }).execute();
    expect(existingUserResult.item).toBeDefined();
    expect(existingUserResult.item?.credits).toBe(150);
    expect(existingUserResult.item?.status).toBe("premium");
  });

  it("should demonstrate the fix - create works like upsert for transactions", async () => {
    const userData: UserEntity = {
      id: "comparison-test",
      name: "Comparison User",
      email: "comparison@example.com",
      status: "active",
      credits: 100,
    };

    // Test create with transaction
    const createTransaction = table.transactionBuilder();
    userRepository.create(userData).withTransaction(createTransaction);
    await createTransaction.execute();

    // Verify create worked
    const createResult = await userRepository.get({ id: "comparison-test" }).execute();
    expect(createResult.item).toBeDefined();
    expect(createResult.item?.name).toBe("Comparison User");

    // Clean up for upsert test
    await userRepository.delete({ id: "comparison-test" }).execute();

    // Test upsert with transaction (should work the same way)
    const upsertTransaction = table.transactionBuilder();
    userRepository.upsert(userData).withTransaction(upsertTransaction);
    await upsertTransaction.execute();

    // Verify upsert worked
    const upsertResult = await userRepository.get({ id: "comparison-test" }).execute();
    expect(upsertResult.item).toBeDefined();
    expect(upsertResult.item?.name).toBe("Comparison User");

    // Both should have created items with the same structure
    expect(createResult.item?.demoPartitionKey).toBe(upsertResult.item?.demoPartitionKey);
    expect(createResult.item?.demoSortKey).toBe(upsertResult.item?.demoSortKey);
    expect(createResult.item?.entityType).toBe(upsertResult.item?.entityType);
  });

  it("should create items with consistent key structure in transaction", async () => {
    // Use the same table configuration as the main tests
    const { table, userRepository } = createRepositories();

    const user: UserEntity = {
      id: "tx-user-consistent",
      name: "Consistent User",
      email: "consistent@example.com",
      status: "premium",
      credits: 500,
    };

    const transaction = table.transactionBuilder();

    userRepository.create(user).withTransaction(transaction);

    await transaction.execute();

    // Verify the item was created
    const result = await userRepository.get({ id: "tx-user-consistent" }).execute();
    expect(result.item).toBeDefined();
    expect(result.item?.status).toBe("premium");

    // Verify primary keys were properly set by checking the raw item
    const rawResult = await table.get({ pk: "USER#tx-user-consistent", sk: "PROFILE" }).execute();
    expect(rawResult.item).toBeDefined();
    expect(rawResult.item?.demoPartitionKey).toBe("USER#tx-user-consistent");
    expect(rawResult.item?.demoSortKey).toBe("PROFILE");
    expect(rawResult.item?.entityType).toBe("User");
  });

  it("should handle mixed create, update, and delete operations in transaction", async () => {
    // First create some existing data
    const existingUser: UserEntity = {
      id: "existing-user-mixed",
      name: "Existing User",
      email: "existing@example.com",
      status: "active",
      credits: 100,
    };
    await userRepository.create(existingUser).execute();

    const userToDelete: UserEntity = {
      id: "delete-user-mixed",
      name: "User to Delete",
      email: "delete@example.com",
      status: "inactive",
      credits: 0,
    };
    await userRepository.create(userToDelete).execute();

    // Now perform mixed operations in a transaction
    const newUser: UserEntity = {
      id: "new-user-mixed",
      name: "New User",
      email: "new@example.com",
      status: "pending",
      credits: 50,
    };

    const transaction = table.transactionBuilder();

    // Create new user
    userRepository.create(newUser).withTransaction(transaction);

    // Update existing user
    userRepository
      .update(
        { id: "existing-user-mixed" },
        {
          status: "premium",
          credits: 200,
        },
      )
      .withTransaction(transaction);

    // Delete user
    userRepository.delete({ id: "delete-user-mixed" }).withTransaction(transaction);

    await transaction.execute();

    // Verify all operations succeeded
    const newUserResult = await userRepository.get({ id: "new-user-mixed" }).execute();
    expect(newUserResult.item).toBeDefined();
    expect(newUserResult.item?.name).toBe("New User");
    expect(newUserResult.item?.status).toBe("pending");

    const updatedUserResult = await userRepository.get({ id: "existing-user-mixed" }).execute();
    expect(updatedUserResult.item).toBeDefined();
    expect(updatedUserResult.item?.status).toBe("premium");
    expect(updatedUserResult.item?.credits).toBe(200);

    const deletedUserResult = await userRepository.get({ id: "delete-user-mixed" }).execute();
    expect(deletedUserResult.item).toBeUndefined();
  });

  it("should handle upsert operations in transactions", async () => {
    const user: UserEntity = {
      id: "upsert-user-tx",
      name: "Upsert User",
      email: "upsert@example.com",
      status: "active",
      credits: 100,
    };

    const transaction = table.transactionBuilder();

    // First upsert (should create)
    userRepository.upsert(user).withTransaction(transaction);

    await transaction.execute();

    // Verify user was created
    const firstResult = await userRepository.get({ id: "upsert-user-tx" }).execute();
    expect(firstResult.item).toBeDefined();
    expect(firstResult.item?.name).toBe("Upsert User");
    expect(firstResult.item?.credits).toBe(100);

    // Now upsert again with different data (should update)
    const updatedUser: UserEntity = {
      id: "upsert-user-tx",
      name: "Updated Upsert User",
      email: "upsert@example.com",
      status: "premium",
      credits: 250,
    };

    const updateTransaction = table.transactionBuilder();
    userRepository.upsert(updatedUser).withTransaction(updateTransaction);

    await updateTransaction.execute();

    // Verify user was updated
    const secondResult = await userRepository.get({ id: "upsert-user-tx" }).execute();
    expect(secondResult.item).toBeDefined();
    expect(secondResult.item?.name).toBe("Updated Upsert User");
    expect(secondResult.item?.status).toBe("premium");
    expect(secondResult.item?.credits).toBe(250);
  });

  it("should handle multiple entity types in single transaction", async () => {
    const user: UserEntity = {
      id: "multi-entity-user",
      name: "Multi Entity User",
      email: "multi@example.com",
      status: "active",
      credits: 150,
    };

    const order: OrderEntity = {
      id: "multi-entity-order",
      userId: "multi-entity-user",
      amount: 75.5,
      status: "pending",
      items: ["item1", "item2", "item3"],
    };

    const transaction = table.transactionBuilder();

    // Add both entities to the same transaction
    userRepository.create(user).withTransaction(transaction);
    orderRepository.create(order).withTransaction(transaction);

    await transaction.execute();

    // Verify both entities were created
    const userResult = await userRepository.get({ id: "multi-entity-user" }).execute();
    expect(userResult.item).toBeDefined();
    expect(userResult.item?.name).toBe("Multi Entity User");
    expect(userResult.item?.credits).toBe(150);

    const orderResult = await orderRepository.get({ id: "multi-entity-order" }).execute();
    expect(orderResult.item).toBeDefined();
    expect(orderResult.item?.userId).toBe("multi-entity-user");
    expect(orderResult.item?.amount).toBe(75.5);
    expect(orderResult.item?.items).toEqual(["item1", "item2", "item3"]);
  });

  it("should handle transaction with conditional operations", async () => {
    // Create a user first
    const user: UserEntity = {
      id: "conditional-user",
      name: "Conditional User",
      email: "conditional@example.com",
      status: "active",
      credits: 100,
    };
    await userRepository.create(user).execute();

    const transaction = table.transactionBuilder();

    // Try to create another user with same ID (should fail due to create condition)
    const duplicateUser: UserEntity = {
      id: "conditional-user",
      name: "Duplicate User",
      email: "duplicate@example.com",
      status: "pending",
      credits: 50,
    };

    userRepository.create(duplicateUser).withTransaction(transaction);

    // Transaction should fail due to conditional check
    await expect(transaction.execute()).rejects.toThrow();

    // Verify original user is unchanged
    const result = await userRepository.get({ id: "conditional-user" }).execute();
    expect(result.item?.name).toBe("Conditional User");
    expect(result.item?.email).toBe("conditional@example.com");
    expect(result.item?.credits).toBe(100);
  });

  it("should handle large transactions with multiple operations", async () => {
    const transaction = table.transactionBuilder();

    // Create multiple users in a single transaction
    const users: UserEntity[] = [];
    for (let i = 1; i <= 10; i++) {
      const user: UserEntity = {
        id: `large-tx-user-${i}`,
        name: `Large TX User ${i}`,
        email: `largetx${i}@example.com`,
        status: i % 2 === 0 ? "active" : "pending",
        credits: i * 25,
      };
      users.push(user);
      userRepository.create(user).withTransaction(transaction);
    }

    await transaction.execute();

    // Verify all users were created
    for (const user of users) {
      const result = await userRepository.get({ id: user.id }).execute();
      expect(result.item).toBeDefined();
      expect(result.item?.name).toBe(user.name);
      expect(result.item?.credits).toBe(user.credits);
    }
  });
});
