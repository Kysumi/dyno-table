import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { defineEntity, createIndex } from "../entity";
import type { Table } from "../table";
import { eq } from "../conditions";
import type { DynamoItem } from "../types";
import type { StandardSchemaV1 } from "../standard-schema";

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

// Create a mock table with the specific primary key configuration mentioned in the issue
const mockTable = {
  create: vi.fn(),
  put: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  scan: vi.fn(),
  query: vi.fn(),
  partitionKey: "thisIsMyPK",
  sortKey: "wowSearching",
  gsis: {},
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
      // Reset all mocks
      vi.clearAllMocks();

      // Create repository instance
      repository = entityRepository.createRepository(mockTable as unknown as Table);
    });

    it("should update an item with the correct primary key structure", async () => {
      const key = {
        id: "123",
      };

      const updateData = {
        name: "Updated Name",
        status: "active",
      };

      const mockBuilder = {
        condition: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ item: { ...key, ...updateData } }),
      };

      mockTable.update.mockReturnValue(mockBuilder);

      await repository.update(key, updateData).execute();

      // Verify that the update was called with the correct primary key structure
      expect(mockTable.update).toHaveBeenCalledWith({
        pk: "thisIsMyPK#123",
        sk: "wowSearching#METADATA",
      });

      // Verify that the entity type condition was added
      expect(mockBuilder.condition).toHaveBeenCalledWith(eq("entityType", "TestEntity"));

      // Verify that the update data was set correctly
      expect(mockBuilder.set).toHaveBeenCalledWith(updateData);
    });

    it("should handle complex update operations", async () => {
      const key = {
        id: "456",
      };

      const updateData = {
        name: "Complex Update",
        status: "processing",
        type: "advanced",
      };

      const mockBuilder = {
        condition: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        remove: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ item: { ...key, ...updateData } }),
      };

      mockTable.update.mockReturnValue(mockBuilder);

      // Perform a more complex update with additional conditions
      const updateBuilder = repository.update(key, updateData);

      // Add a custom condition
      updateBuilder.condition(eq("status", "pending"));

      await updateBuilder.execute();

      // Verify the update was called with the correct primary key
      expect(mockTable.update).toHaveBeenCalledWith({
        pk: "thisIsMyPK#456",
        sk: "wowSearching#METADATA",
      });

      // Verify that both conditions were applied (the entity type and our custom one)
      // Note: In a real scenario, the conditions would be combined with AND, but in our mock
      // we're just checking that condition was called twice
      expect(mockBuilder.condition).toHaveBeenCalledTimes(2);
      expect(mockBuilder.condition).toHaveBeenCalledWith(eq("entityType", "TestEntity"));
      expect(mockBuilder.condition).toHaveBeenCalledWith(eq("status", "pending"));

      // Verify the update data was set
      expect(mockBuilder.set).toHaveBeenCalledWith(updateData);
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

      const key = {
        id: "789",
      };

      const updateData = {
        name: "Timestamped Update",
      };

      const mockBuilder = {
        condition: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ item: { ...key, ...updateData } }),
      };

      mockTable.update.mockReturnValue(mockBuilder);

      await repoWithTimestamps.update(key, updateData).execute();

      // Verify that the update was called with the correct primary key
      expect(mockTable.update).toHaveBeenCalledWith({
        pk: "thisIsMyPK#789",
        sk: "wowSearching#METADATA",
      });

      // Verify that the entity type condition was added
      expect(mockBuilder.condition).toHaveBeenCalledWith(eq("entityType", "TestEntityWithTimestamps"));

      // Verify that the set method was called
      expect(mockBuilder.set).toHaveBeenCalled();

      // Verify that the timestamp was added to the update data
      // @ts-ignore
      const setCall = mockBuilder.set.mock.calls[0][0];
      expect(setCall).toHaveProperty("name", "Timestamped Update");
      expect(setCall).toHaveProperty("modifiedAt");
      expect(typeof setCall.modifiedAt).toBe("number"); // UNIX format
    });
  });
});
