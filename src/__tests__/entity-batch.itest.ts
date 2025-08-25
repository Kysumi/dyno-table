import { beforeAll, describe, expect, it } from "vitest";
import { Table } from "../table";

import { docClient } from "../../tests/ddb-client";
import type { DynamoItem } from "../types";
import type { StandardSchemaV1 } from "../standard-schema";
import { createIndex, defineEntity } from "../entity/entity";

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

interface ProductEntity extends DynamoItem {
  id: string;
  name: string;
  price: number;
  category: string;
  inStock: boolean;
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

const productSchema: StandardSchemaV1<ProductEntity> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (data: unknown) => ({ value: data as ProductEntity }),
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

  const productEntity = defineEntity({
    name: "Product",
    schema: productSchema,
    primaryKey: createIndex()
      .input(primaryKeySchema)
      .partitionKey((item) => `PRODUCT#${item.id}`)
      .sortKey(() => "INFO"),
    queries: {},
  });

  return {
    table,
    userRepository: userEntity.createRepository(table),
    orderRepository: orderEntity.createRepository(table),
    productRepository: productEntity.createRepository(table),
  };
}

describe("Entity Integration Tests - Batch Operations", () => {
  let table: Table;
  let userRepository: ReturnType<typeof createRepositories>["userRepository"];
  let orderRepository: ReturnType<typeof createRepositories>["orderRepository"];
  let productRepository: ReturnType<typeof createRepositories>["productRepository"];

  beforeAll(() => {
    const setup = createRepositories();
    table = setup.table;
    userRepository = setup.userRepository;
    orderRepository = setup.orderRepository;
    productRepository = setup.productRepository;
  });

  it("should create multiple items using batch operations", async () => {
    const users: UserEntity[] = [
      {
        id: "batch-user-1",
        name: "Batch User 1",
        email: "batch1@example.com",
        status: "active",
        credits: 100,
      },
      {
        id: "batch-user-2",
        name: "Batch User 2",
        email: "batch2@example.com",
        status: "pending",
        credits: 50,
      },
      {
        id: "batch-user-3",
        name: "Batch User 3",
        email: "batch3@example.com",
        status: "active",
        credits: 200,
      },
    ];

    const batch = table.batchBuilder();

    // Add multiple create operations to batch
    for (const user of users) {
      userRepository.create(user).withBatch(batch);
    }

    const result = await batch.execute();

    // Verify batch execution was successful
    expect(result.writes.processed).toBe(3);
    expect(result.writes.unprocessed).toHaveLength(0);

    // Verify all items were created by getting them individually
    for (const user of users) {
      const getResult = await userRepository.get({ id: user.id }).execute();
      expect(getResult.item).toBeDefined();
      expect(getResult.item?.name).toBe(user.name);
      expect(getResult.item?.email).toBe(user.email);
      expect(getResult.item?.status).toBe(user.status);
      expect(getResult.item?.credits).toBe(user.credits);
    }
  });

  it("should handle mixed entity types in batch operations", async () => {
    const user: UserEntity = {
      id: "mixed-user-1",
      name: "Mixed User",
      email: "mixed@example.com",
      status: "active",
      credits: 150,
    };

    const order: OrderEntity = {
      id: "mixed-order-1",
      userId: "mixed-user-1",
      amount: 99.99,
      status: "pending",
      items: ["item1", "item2"],
    };

    const product: ProductEntity = {
      id: "mixed-product-1",
      name: "Mixed Product",
      price: 29.99,
      category: "electronics",
      inStock: true,
    };

    const batch = table.batchBuilder();

    // Add different entity types to the same batch
    userRepository.create(user).withBatch(batch);
    orderRepository.create(order).withBatch(batch);
    productRepository.create(product).withBatch(batch);

    const result = await batch.execute();

    // Verify batch execution
    expect(result.writes.processed).toBe(3);
    expect(result.writes.unprocessed).toHaveLength(0);

    // Verify all items were created correctly
    const userResult = await userRepository.get({ id: "mixed-user-1" }).execute();
    const orderResult = await orderRepository.get({ id: "mixed-order-1" }).execute();
    const productResult = await productRepository.get({ id: "mixed-product-1" }).execute();

    expect(userResult.item?.name).toBe("Mixed User");
    expect(orderResult.item?.amount).toBe(99.99);
    expect(productResult.item?.price).toBe(29.99);
  });

  it("should handle batch get operations with entities", async () => {
    // First create some test data
    const users: UserEntity[] = [
      {
        id: "get-user-1",
        name: "Get User 1",
        email: "get1@example.com",
        status: "active",
        credits: 100,
      },
      {
        id: "get-user-2",
        name: "Get User 2",
        email: "get2@example.com",
        status: "inactive",
        credits: 0,
      },
      {
        id: "get-user-3",
        name: "Get User 3",
        email: "get3@example.com",
        status: "premium",
        credits: 500,
      },
    ];

    // Create users individually first
    for (const user of users) {
      await userRepository.create(user).execute();
    }

    // Now test batch get
    const batch = table.batchBuilder();

    // Add get operations to batch
    userRepository.get({ id: "get-user-1" }).withBatch(batch);
    userRepository.get({ id: "get-user-2" }).withBatch(batch);
    userRepository.get({ id: "get-user-3" }).withBatch(batch);

    const result = await batch.execute();

    // Verify batch get results
    expect(result.reads.found).toBe(3);
    expect(result.reads.items).toHaveLength(3);
    expect(result.reads.unprocessed).toHaveLength(0);

    // Verify we got the correct items
    const names = result.reads.items.map((item) => item.name).sort();
    expect(names).toEqual(["Get User 1", "Get User 2", "Get User 3"]);
  });

  it("should handle mixed read and write operations in batch", async () => {
    // First create a user to read
    const existingUser: UserEntity = {
      id: "get-user-1",
      name: "Existing User",
      email: "existing@example.com",
      status: "active",
      credits: 100,
    };
    await userRepository.create(existingUser).execute();

    // Now create a batch with mixed operations
    const newUser: UserEntity = {
      id: "batch-user-4",
      name: "New Batch User",
      email: "newbatch@example.com",
      status: "pending",
      credits: 25,
    };

    const batch = table.batchBuilder();

    // Mix read and write operations
    userRepository.get({ id: "get-user-1" }).withBatch(batch);
    userRepository.create(newUser).withBatch(batch);

    const result = await batch.execute();

    // Verify both operations succeeded
    expect(result.writes.processed).toBe(1);
    expect(result.reads.found).toBe(1);
    expect(result.reads.items).toHaveLength(1);
    expect(result.reads.items[0]?.name).toBe("Existing User");

    // Verify the new user was created
    const newUserResult = await userRepository.get({ id: "batch-user-4" }).execute();
    expect(newUserResult.item?.name).toBe("New Batch User");
  });

  it("should handle batch delete operations", async () => {
    // First create users to delete
    const usersToDelete: UserEntity[] = [
      {
        id: "batch-user-1",
        name: "Delete User 1",
        email: "delete1@example.com",
        status: "active",
        credits: 100,
      },
      {
        id: "batch-user-2",
        name: "Delete User 2",
        email: "delete2@example.com",
        status: "inactive",
        credits: 0,
      },
    ];

    // Create the users first
    for (const user of usersToDelete) {
      await userRepository.create(user).execute();
    }

    // Verify they exist
    for (const user of usersToDelete) {
      const result = await userRepository.get({ id: user.id }).execute();
      expect(result.item).toBeDefined();
    }

    // Now delete them using batch
    const batch = table.batchBuilder();

    userRepository.delete({ id: "batch-user-1" }).withBatch(batch);
    userRepository.delete({ id: "batch-user-2" }).withBatch(batch);

    const result = await batch.execute();

    // Verify batch deletion
    expect(result.writes.processed).toBe(2);
    expect(result.writes.unprocessed).toHaveLength(0);

    // Verify users were deleted
    for (const user of usersToDelete) {
      const getResult = await userRepository.get({ id: user.id }).execute();
      expect(getResult.item).toBeUndefined();
    }
  });

  it("should handle upsert operations in batch", async () => {
    const users: UserEntity[] = [
      {
        id: "batch-user-1",
        name: "Upsert User 1",
        email: "upsert1@example.com",
        status: "active",
        credits: 100,
      },
      {
        id: "batch-user-2",
        name: "Upsert User 2",
        email: "upsert2@example.com",
        status: "pending",
        credits: 50,
      },
    ];

    const batch = table.batchBuilder();

    // Use upsert operations in batch
    for (const user of users) {
      userRepository.upsert(user).withBatch(batch);
    }

    const result = await batch.execute();

    // Verify batch execution
    expect(result.writes.processed).toBe(2);
    expect(result.writes.unprocessed).toHaveLength(0);

    // Verify items were created
    for (const user of users) {
      const getResult = await userRepository.get({ id: user.id }).execute();
      expect(getResult.item).toBeDefined();
      expect(getResult.item?.name).toBe(user.name);
      expect(getResult.item?.email).toBe(user.email);
    }

    // Now update the same items using upsert again
    const updatedUsers: UserEntity[] = [
      {
        id: "batch-user-1",
        name: "Updated Upsert User 1",
        email: "upsert1@example.com",
        status: "premium",
        credits: 200,
      },
      {
        id: "batch-user-2",
        name: "Updated Upsert User 2",
        email: "upsert2@example.com",
        status: "active",
        credits: 100,
      },
    ];

    const updateBatch = table.batchBuilder();

    for (const user of updatedUsers) {
      userRepository.upsert(user).withBatch(updateBatch);
    }

    const updateResult = await updateBatch.execute();

    // Verify update batch execution
    expect(updateResult.writes.processed).toBe(2);

    // Verify items were updated
    for (const user of updatedUsers) {
      const getResult = await userRepository.get({ id: user.id }).execute();
      expect(getResult.item).toBeDefined();
      expect(getResult.item?.name).toBe(user.name);
      expect(getResult.item?.status).toBe(user.status);
      expect(getResult.item?.credits).toBe(user.credits);
    }
  });

  it("should preserve entity timestamps in batch operations", async () => {
    const user: UserEntity = {
      id: "timestamps-user",
      name: "Timestamps User",
      email: "timestamps@example.com",
      status: "active",
      credits: 100,
    };

    const batch = table.batchBuilder();
    const beforeCreate = new Date();

    userRepository.create(user).withBatch(batch);

    await batch.execute();

    // Verify the item was created with timestamps
    const result = await userRepository.get({ id: "timestamps-user" }).execute();
    expect(result.item).toBeDefined();
    expect(result.item?.name).toBe("Timestamps User");

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

  it("should preserve entity keys and metadata in batch operations", async () => {
    const user: UserEntity = {
      id: "keys-user",
      name: "Keys User",
      email: "keys@example.com",
      status: "premium",
      credits: 500,
    };

    const batch = table.batchBuilder();

    userRepository.create(user).withBatch(batch);

    await batch.execute();

    // Verify the item was created
    const result = await userRepository.get({ id: "keys-user" }).execute();
    expect(result.item).toBeDefined();
    expect(result.item?.status).toBe("premium");

    // Verify primary keys were properly set by checking the raw item
    const rawResult = await table.get({ pk: "USER#keys-user", sk: "PROFILE" }).execute();
    expect(rawResult.item).toBeDefined();
    expect(rawResult.item?.demoPartitionKey).toBe("USER#keys-user");
    expect(rawResult.item?.demoSortKey).toBe("PROFILE");
    expect(rawResult.item?.entityType).toBe("User");
  });

  it("should handle empty batch gracefully", async () => {
    const batch = table.batchBuilder();

    // Try to execute empty batch
    await expect(batch.execute()).rejects.toThrow("Cannot execute empty batch");
  });

  it("should handle large batch operations with chunking", async () => {
    // Create 30 users (exceeds the 25 item limit for a single batch write)
    const manyUsers: UserEntity[] = [];
    for (let i = 1; i <= 30; i++) {
      manyUsers.push({
        id: `batch-user-${i}`,
        name: `Batch User ${i}`,
        email: `batch${i}@example.com`,
        status: i % 2 === 0 ? "active" : "pending",
        credits: i * 10,
      });
    }

    const batch = table.batchBuilder();

    // Add all users to batch
    for (const user of manyUsers) {
      userRepository.create(user).withBatch(batch);
    }

    const result = await batch.execute();

    // Verify all operations were processed (chunking should handle the 25+ limit)
    expect(result.writes.processed).toBe(30);
    expect(result.writes.unprocessed).toHaveLength(0);

    for (const user of manyUsers) {
      const getResult = await userRepository.get({ id: user.id }).execute();
      expect(getResult.item).toBeDefined();
      expect(getResult.item?.name).toBe(user.name);
      expect(getResult.item?.credits).toBe(user.credits);
    }
  });

  it("should handle non-existent items in batch get operations", async () => {
    // Create only one user
    const existingUser: UserEntity = {
      id: "get-user-1",
      name: "Existing User",
      email: "existing@example.com",
      status: "active",
      credits: 100,
    };
    await userRepository.create(existingUser).execute();

    const batch = table.batchBuilder();

    // Try to get existing and non-existing users
    userRepository.get({ id: "get-user-1" }).withBatch(batch);
    userRepository.get({ id: "non-existent-user" }).withBatch(batch);
    userRepository.get({ id: "another-non-existent" }).withBatch(batch);

    const result = await batch.execute();

    // Should only find the existing user
    expect(result.reads.found).toBe(1);
    expect(result.reads.items).toHaveLength(1);
    expect(result.reads.items[0]?.name).toBe("Existing User");
    expect(result.reads.unprocessed).toHaveLength(0);
  });

  it("should automatically infer entity types without manual specification", async () => {
    // Test that entity names are automatically passed to batch operations
    const user: UserEntity = {
      id: "auto-type-user",
      name: "Auto Type User",
      email: "auto@example.com",
      status: "active",
    };

    const order: OrderEntity = {
      id: "auto-type-order",
      userId: "auto-type-user",
      amount: 99.99,
      status: "pending",
      items: ["item1", "item2"],
    };

    // Create a typed batch to verify entity type inference
    const batch = table.batchBuilder<{
      User: UserEntity;
      Order: OrderEntity;
    }>();

    // Add operations WITHOUT specifying entity types - they should be inferred automatically
    userRepository.create(user).withBatch(batch);
    orderRepository.create(order).withBatch(batch);

    const result = await batch.execute();

    // Verify batch execution
    expect(result.writes.processed).toBe(2);
    expect(result.writes.unprocessed).toHaveLength(0);

    // Verify items were created correctly
    const userResult = await userRepository.get({ id: "auto-type-user" }).execute();
    const orderResult = await orderRepository.get({ id: "auto-type-order" }).execute();

    expect(userResult.item).toBeDefined();
    expect(userResult.item?.name).toBe("Auto Type User");
    expect(orderResult.item).toBeDefined();
    expect(orderResult.item?.amount).toBe(99.99);
  });
});
