import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Table } from "../table";

import { docClient } from "../../tests/ddb-client";
import { defineEntity, createIndex } from "../entity";
import type { DynamoItem } from "../types";
import type { StandardSchemaV1 } from "../standard-schema";

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
    try {
      await userRepository.delete({ id: "tx-user-1" }).execute();
      await userRepository.delete({ id: "tx-user-2" }).execute();
      await orderRepository.delete({ id: "tx-order-1" }).execute();
      await orderRepository.delete({ id: "tx-order-2" }).execute();
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
});
