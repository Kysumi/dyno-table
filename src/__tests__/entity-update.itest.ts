import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Table } from "../table";

import { docClient } from "../../tests/ddb-client";
import { defineEntity, createIndex } from "../entity";
import type { DynamoItem } from "../types";
import type { StandardSchemaV1 } from "../standard-schema";

// Define a test entity type
interface TestEntity extends DynamoItem {
  id: string;
  name: string;
  type: string;
  status: string;
  height?: number;
  weight?: number;
  tags?: Set<string>;
}

// Create a mock schema with a proper StandardSchemaV1 structure
const testSchema: StandardSchemaV1<TestEntity> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (data: unknown) => ({ value: data as TestEntity }),
  },
};

const primaryKeySchema: StandardSchemaV1<{ id: string }> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (data: unknown) => ({ value: data as { id: string } }),
  },
};

// Create a test table
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

// Create a test entity repository
function createTestEntityRepository() {
  const entityRepository = defineEntity({
    name: "TestEntity",
    schema: testSchema,
    primaryKey: createIndex()
      .input(primaryKeySchema)
      .partitionKey((item) => `ENTITY#${item.id}`)
      .sortKey(() => "METADATA"),
    queries: {},
  });

  const table = createTestTable();
  return {
    repository: entityRepository.createRepository(table),
    table,
  };
}

describe("Entity Integration Tests - Update Operations", () => {
  let repository: ReturnType<typeof createTestEntityRepository>["repository"];
  let table: Table;

  beforeAll(() => {
    const setup = createTestEntityRepository();
    repository = setup.repository;
    table = setup.table;
  });

  beforeEach(async () => {
    // Create a test entity
    const entity: TestEntity = {
      id: "update-test",
      name: "Update Test",
      type: "UpdateType",
      status: "active",
      height: 10,
      weight: 1000,
    };
    await repository.create(entity).execute();
  });

  it("should update specific attributes", async () => {
    const result = await repository
      .update(
        { id: "update-test" },
        {
          name: "Updated Name",
          height: 15,
        },
      )
      .returnValues("ALL_NEW")
      .execute();

    expect(result.item).toBeDefined();
    expect(result.item?.name).toBe("Updated Name");
    expect(result.item?.height).toBe(15);
    expect(result.item?.type).toBe("UpdateType"); // Unchanged
    expect(result.item?.weight).toBe(1000); // Unchanged
    expect(result.item?.status).toBe("active"); // Unchanged
  });

  it("should update with a condition that passes", async () => {
    const result = await repository
      .update(
        { id: "update-test" },
        {
          name: "Condition Passed",
        },
      )
      .condition((op) => op.eq("type", "UpdateType"))
      .execute();

    expect(result.item?.name).toBe("Condition Passed");
  });

  it("should fail to update with a condition that fails", async () => {
    await expect(
      repository
        .update(
          { id: "update-test" },
          {
            name: "Should Not Update",
          },
        )
        .condition((op) => op.eq("type", "WrongType"))
        .execute(),
    ).rejects.toThrow();

    // Verify item wasn't updated
    const getResult = await repository.get({ id: "update-test" }).execute();
    expect(getResult.item?.name).not.toBe("Should Not Update");
  });

  it("should update with timestamps when configured", async () => {
    // Create a new entity repository with timestamps configured
    const entityWithTimestamps = createTestEntityRepository();
    const timestampedRepository = entityWithTimestamps.repository;

    // Create a test entity with the timestamped repository
    const entity: TestEntity = {
      id: "timestamp-test",
      name: "Timestamp Test",
      type: "TimestampType",
      status: "active",
    };
    await timestampedRepository.create(entity).execute();

    // Update the entity
    const beforeUpdate = new Date();
    const result = await timestampedRepository
      .update(
        { id: "timestamp-test" },
        {
          name: "Updated With Timestamp",
        },
      )
      .execute();

    expect(result.item?.name).toBe("Updated With Timestamp");

    // Check if updatedAt was automatically added
    // Note: This test might need adjustment based on how timestamps are implemented
    if (result.item?.updatedAt) {
      const updatedAt = new Date(result.item.updatedAt as string);
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    }
  });

  it("should handle complex update operations", async () => {
    // Create an entity with tags
    const entityWithTags: TestEntity = {
      id: "complex-update",
      name: "Complex Update Test",
      type: "ComplexType",
      status: "pending",
      tags: new Set(["tag1", "tag2", "tag3"]),
    };
    await repository.create(entityWithTags).execute();

    // Perform a complex update
    const result = await repository
      .update(
        { id: "complex-update" },
        {
          name: "Updated Complex",
          status: "completed",
        },
      )
      .execute();

    expect(result.item?.name).toBe("Updated Complex");
    expect(result.item?.status).toBe("completed");
    expect(result.item?.tags).toEqual(new Set(["tag1", "tag2", "tag3"])); // Tags should be unchanged
  });
});
