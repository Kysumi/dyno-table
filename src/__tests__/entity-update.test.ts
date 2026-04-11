import { beforeEach, describe, expect, it, vi } from "vitest";
import { createIndex, defineEntity } from "../entity/entity";
import type { StandardSchemaV1 } from "../standard-schema";
import type { Table } from "../table";
import type { DynamoItem } from "../types";

// Define a test entity type
interface TestEntity extends DynamoItem {
  id: string;
  name: string;
  type: string;
  status: string;
}

// Create a mock schema with a proper StandardSchemaV1 structure
const testSchema: StandardSchemaV1<TestEntity> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: vi.fn().mockImplementation((data) => ({
      value: data,
    })) as unknown as (value: unknown) => { value: TestEntity } | { issues: Array<{ message: string }> },
  },
};

const primaryKeySchema: StandardSchemaV1<{ id: string }> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: vi.fn().mockImplementation((data) => ({
      value: data,
    })) as unknown as (value: unknown) => { value: { id: string } } | { issues: Array<{ message: string }> },
  },
};

const mockUpdateExecutor = vi.fn();

// Create a mock table with the specific primary key configuration mentioned in the issue
const mockTable = {
  getUpdateExecutor: vi.fn().mockReturnValue(mockUpdateExecutor),
  getPutExecutor: vi.fn(),
  getGetExecutor: vi.fn(),
  getDeleteExecutor: vi.fn(),
  getIndexAttributeNames: vi.fn().mockReturnValue([]),
  tableName: "TestTable",
  partitionKey: "thisIsMyPK",
  sortKey: "wowSearching",
  gsis: {},
  scan: vi.fn(),
  query: vi.fn(),
};

describe("Entity Update Operations", () => {
  describe("with specific primary key configuration (pk: thisIsMyPK, sk: wowSearching)", () => {
    // Define an entity repository with the specific primary key configuration
    const entityRepository = defineEntity({
      name: "TestEntity",
      schema: testSchema,
      primaryKey: createIndex()
        .input(primaryKeySchema)
        .partitionKey((item) => `thisIsMyPK#${item.id}`)
        .sortKey(() => "wowSearching#METADATA"),
      queries: {},
    });

    let repository: ReturnType<typeof entityRepository.createRepository>;

    beforeEach(() => {
      vi.clearAllMocks();
      mockUpdateExecutor.mockResolvedValue({ item: undefined });
      mockTable.getUpdateExecutor.mockReturnValue(mockUpdateExecutor);
      repository = entityRepository.createRepository(mockTable as unknown as Table);
    });

    it("should update an item with the correct primary key structure", async () => {
      const key = { id: "123" };
      const updateData = { name: "Updated Name", status: "active" };

      const builder = repository.update(key, updateData);

      // Verify that getUpdateExecutor was called with the correct primary key
      expect(mockTable.getUpdateExecutor).toHaveBeenCalledWith({
        pk: "thisIsMyPK#123",
        sk: "wowSearching#METADATA",
      });

      // Verify the entity type condition is set
      const { readable } = builder.debug();
      expect(readable.conditionExpression).toBe('entityType = "TestEntity"');

      // Verify the update data is included
      expect(readable.updateExpression).toContain('name = "Updated Name"');
      expect(readable.updateExpression).toContain('status = "active"');
    });

    it("should handle complex update operations", async () => {
      const key = { id: "456" };
      const updateData = { name: "Complex Update", status: "processing", type: "advanced" };

      const builder = repository.update(key, updateData);

      // Verify the update key
      expect(mockTable.getUpdateExecutor).toHaveBeenCalledWith({
        pk: "thisIsMyPK#456",
        sk: "wowSearching#METADATA",
      });

      // Verify entity type condition is set initially
      const { readable } = builder.debug();
      expect(readable.conditionExpression).toBe('entityType = "TestEntity"');
      expect(readable.updateExpression).toContain('name = "Complex Update"');
      expect(readable.updateExpression).toContain('status = "processing"');

      await builder.execute();
      expect(mockUpdateExecutor).toHaveBeenCalledTimes(1);
    });

    it("should add timestamps when configured", async () => {
      // Create a new entity repository with timestamps configured
      const entityWithTimestamps = defineEntity({
        name: "TestEntityWithTimestamps",
        schema: testSchema,
        primaryKey: createIndex()
          .input(primaryKeySchema)
          .partitionKey((item) => `thisIsMyPK#${item.id}`)
          .sortKey(() => "wowSearching#METADATA"),
        queries: {},
        settings: {
          timestamps: {
            updatedAt: {
              format: "UNIX",
              attributeName: "modifiedAt",
            },
          },
        },
      });

      const repoWithTimestamps = entityWithTimestamps.createRepository(mockTable as unknown as Table);

      const key = { id: "789" };
      const updateData = { name: "Timestamped Update" };

      const builder = repoWithTimestamps.update(key, updateData);

      // Verify that the update was called with the correct primary key
      expect(mockTable.getUpdateExecutor).toHaveBeenCalledWith({
        pk: "thisIsMyPK#789",
        sk: "wowSearching#METADATA",
      });

      // Verify entity type condition
      const { readable } = builder.debug();
      expect(readable.conditionExpression).toBe('entityType = "TestEntityWithTimestamps"');

      // Verify the timestamp was added
      expect(readable.updateExpression).toContain('name = "Timestamped Update"');
      expect(readable.updateExpression).toContain("modifiedAt");
    });
  });
});
