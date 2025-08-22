import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { defineEntity, createIndex } from "../entity/entity";
import type { Table } from "../table";
import { eq } from "../conditions";
import type { DynamoItem } from "../types";
import type { StandardSchemaV1 } from "../standard-schema";

// Define a test entity type with attributes that would be used in indexes
interface TestEntity extends DynamoItem {
  id: string;
  name: string;
  category: string;
  status: string;
  userId: string;
  organizationId: string;
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

// Create a mock table with GSI configurations
const mockTable = {
  create: vi.fn(),
  put: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  scan: vi.fn(),
  query: vi.fn(),
  partitionKey: "pk",
  sortKey: "sk",
  gsis: {
    "user-index": {
      partitionKey: "gsi1pk",
      sortKey: "gsi1sk",
    },
    "category-status-index": {
      partitionKey: "gsi2pk",
      sortKey: "gsi2sk",
    },
    "readonly-index": {
      partitionKey: "gsi3pk",
      sortKey: "gsi3sk",
    },
  },
};

describe("Entity Index Update Operations", () => {
  describe("index regeneration on updates", () => {
    // Define an entity repository with multiple indexes
    const entityRepository = defineEntity({
      name: "TestEntity",
      schema: testSchema,
      primaryKey: createIndex()
        .input(primaryKeySchema)
        .partitionKey((item) => `ENTITY#${item.id}`)
        .sortKey(() => "METADATA"),
      indexes: {
        "user-index": createIndex()
          .input(testSchema)
          .partitionKey((item) => `USER#${item.userId}`)
          .sortKey((item) => `ENTITY#${item.id}`),
        "category-status-index": createIndex()
          .input(testSchema)
          .partitionKey((item) => `CATEGORY#${item.category}`)
          .sortKey((item) => `STATUS#${item.status}#${item.id}`),
        "readonly-index": createIndex()
          .input(testSchema)
          .partitionKey((item) => `ORG#${item.organizationId}`)
          .sortKey((item) => `ENTITY#${item.id}`)
          .readOnly(true),
      },
      queries: {},
    });

    let repository: ReturnType<typeof entityRepository.createRepository>;

    beforeEach(() => {
      // Reset all mocks
      vi.clearAllMocks();

      // Create repository instance
      repository = entityRepository.createRepository(mockTable as unknown as Table);
    });

    it("should regenerate indexes when relevant attributes are updated", async () => {
      const key = { id: "123" };
      const updateData = {
        name: "Updated Name",
        userId: "user456", // This should trigger user-index regeneration
        // Not updating category to avoid triggering category-status-index without status
      };

      const mockBuilder = {
        condition: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ item: { ...key, ...updateData } }),
      };

      mockTable.update.mockReturnValue(mockBuilder);

      await repository.update(key, updateData).execute();

      // Verify that the update was called with the correct primary key
      expect(mockTable.update).toHaveBeenCalledWith({
        pk: "ENTITY#123",
        sk: "METADATA",
      });

      // Verify that the entity type condition was added
      expect(mockBuilder.condition).toHaveBeenCalledWith(eq("entityType", "TestEntity"));

      // Verify that the set method was called with both the update data and regenerated indexes
      expect(mockBuilder.set).toHaveBeenCalledOnce();
      expect(mockBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Updated Name",
          userId: "user456",
          gsi1pk: "USER#user456",
          gsi1sk: "ENTITY#123",
        }),
      );

      // Should NOT include category-status-index keys because category wasn't updated
      expect(mockBuilder.set).not.toHaveBeenCalledWith(
        expect.objectContaining({
          gsi2pk: expect.anything(),
          gsi2sk: expect.anything(),
        }),
      );
    });

    it("should not update readOnly indexes", async () => {
      const key = { id: "123" };
      const updateData = {
        name: "Updated Name",
        organizationId: "org789", // This would normally trigger readonly-index, but should be ignored
      };

      const mockBuilder = {
        condition: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ item: { ...key, ...updateData } }),
      };

      mockTable.update.mockReturnValue(mockBuilder);

      await repository.update(key, updateData).execute();

      // Verify that the set method was called
      expect(mockBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Updated Name",
          organizationId: "org789",
        }),
      );

      // Should NOT include readonly index keys
      expect(mockBuilder.set).not.toHaveBeenCalledWith(
        expect.objectContaining({
          gsi3pk: expect.anything(),
          gsi3sk: expect.anything(),
        }),
      );
    });

    it("should throw error when insufficient data to regenerate index", async () => {
      const key = { id: "123" };
      // Updating category and userId - category should trigger category-status-index but status is missing
      // userId should trigger user-index and succeed
      const updateData = {
        category: "newCategory", // This will trigger category-status-index error
        userId: "user456", // This should work fine
      };

      const mockBuilder = {
        condition: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ item: { ...key, ...updateData } }),
      };

      mockTable.update.mockReturnValue(mockBuilder);

      // This should throw an error because we can't regenerate the category-status-index
      // without both category and status
      expect(() => repository.update(key, updateData)).toThrowError(
        /Cannot update entity: insufficient data to regenerate index.*category-status-index/,
      );
    });

    it("should successfully update when all required attributes are provided", async () => {
      const key = { id: "123" };
      const updateData = {
        category: "newCategory",
        status: "active", // Now providing both category and status
        userId: "user456",
      };

      const mockBuilder = {
        condition: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ item: { ...key, ...updateData } }),
      };

      mockTable.update.mockReturnValue(mockBuilder);

      await repository.update(key, updateData).execute();

      // Should include regenerated index keys
      expect(mockBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "newCategory",
          status: "active",
          userId: "user456",
          gsi1pk: "USER#user456",
          gsi1sk: "ENTITY#123",
          gsi2pk: "CATEGORY#newCategory",
          gsi2sk: "STATUS#active#123",
        }),
      );
    });

    it("should add timestamps to updates without affecting index regeneration", async () => {
      // Create a new entity repository with timestamps configured
      const entityWithTimestamps = defineEntity({
        name: "TestEntityWithTimestamps",
        schema: testSchema,
        primaryKey: createIndex()
          .input(primaryKeySchema)
          .partitionKey((item) => `ENTITY#${item.id}`)
          .sortKey(() => "METADATA"),
        indexes: {
          "user-index": createIndex()
            .input(testSchema)
            .partitionKey((item) => `USER#${item.userId}`)
            .sortKey((item) => `ENTITY#${item.id}`),
        },
        queries: {},
        settings: {
          timestamps: {
            updatedAt: {
              format: "ISO",
              attributeName: "updatedAt",
            },
          },
        },
      });

      const repoWithTimestamps = entityWithTimestamps.createRepository(mockTable as unknown as Table);

      const key = { id: "123" };
      const updateData = {
        userId: "user456",
        name: "Updated with timestamp",
      };

      const mockBuilder = {
        condition: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ item: { ...key, ...updateData } }),
      };

      mockTable.update.mockReturnValue(mockBuilder);

      await repoWithTimestamps.update(key, updateData).execute();

      // Should include the original update data, timestamp, and regenerated index keys
      expect(mockBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user456",
          name: "Updated with timestamp",
          updatedAt: expect.any(String), // ISO format
          gsi1pk: "USER#user456",
          gsi1sk: "ENTITY#123",
        }),
      );
    });

    it("should handle updates that don't affect any indexes", async () => {
      const key = { id: "123" };
      const updateData = {
        name: "Just updating name", // This doesn't affect any index
      };

      const mockBuilder = {
        condition: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ item: { ...key, ...updateData } }),
      };

      mockTable.update.mockReturnValue(mockBuilder);

      await repository.update(key, updateData).execute();

      // Should only include the original update data
      expect(mockBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Just updating name",
        }),
      );

      // Should not include any index keys since no indexes were affected
      expect(mockBuilder.set).not.toHaveBeenCalledWith(
        expect.objectContaining({
          gsi1pk: expect.anything(),
          gsi1sk: expect.anything(),
          gsi2pk: expect.anything(),
          gsi2sk: expect.anything(),
          gsi3pk: expect.anything(),
          gsi3sk: expect.anything(),
        }),
      );
    });
  });

  describe("readOnly index configuration", () => {
    it("should allow creating readOnly indexes", () => {
      const readOnlyIndex = createIndex()
        .input(testSchema)
        .partitionKey((item) => `ORG#${item.organizationId}`)
        .sortKey((item) => `ENTITY#${item.id}`)
        .readOnly(true);

      expect(readOnlyIndex._isReadOnly).toBe(true);
    });

    it("should allow creating readOnly indexes without sort key", () => {
      const readOnlyIndex = createIndex()
        .input(testSchema)
        .partitionKey((item) => `ORG#${item.organizationId}`)
        .withoutSortKey()
        .readOnly(true);

      expect(readOnlyIndex._isReadOnly).toBe(true);
    });

    it("should default readOnly to false", () => {
      const normalIndex = createIndex()
        .input(testSchema)
        .partitionKey((item) => `USER#${item.userId}`)
        .sortKey((item) => `ENTITY#${item.id}`);

      // The index builder returns an object with both the readOnly property and a readOnly method
      // We need to check the internal _isReadOnly property for the actual boolean value

      // Check the internal _isReadOnly property which should default to false
      expect(normalIndex._isReadOnly).toBe(false);
    });
  });
});
