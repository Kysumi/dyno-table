import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIndex, defineEntity } from "../entity/entity";
import type { StandardSchemaV1 } from "../standard-schema";
import type { Table } from "../table";
import type { DynamoItem } from "../types";

/**
 * This test file verifies that the timestamp functionality in the entity module works as expected.
 * It tests various timestamp configurations:
 * 1. Both createdAt and updatedAt timestamps
 * 2. Only createdAt timestamp
 * 3. Only updatedAt timestamp
 * 4. Custom attribute names for timestamps
 * 5. No timestamps
 *
 * For each configuration, it tests the behavior during entity creation, updates, and (where applicable) upserts.
 */

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

const mockPutExecutor = vi.fn();
const mockUpdateExecutor = vi.fn();

// Create a mock table
const mockTable = {
  _getPutExecutor: vi.fn().mockReturnValue(mockPutExecutor),
  _getUpdateExecutor: vi.fn().mockReturnValue(mockUpdateExecutor),
  _getGetExecutor: vi.fn(),
  _getDeleteExecutor: vi.fn(),
  getIndexAttributeNames: vi.fn().mockReturnValue([]),
  tableName: "TestTable",
  partitionKey: "pk",
  sortKey: "sk",
  gsis: {},
  scan: vi.fn(),
  query: vi.fn(),
};

describe("Entity Timestamp Operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mockPutExecutor.mockImplementation(async (params: any) => {
      if (params.returnValues === "INPUT") return params.item;
      return undefined;
    });
    mockUpdateExecutor.mockResolvedValue({ item: undefined });
    mockTable._getPutExecutor.mockReturnValue(mockPutExecutor);
    mockTable._getUpdateExecutor.mockReturnValue(mockUpdateExecutor);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("with both createdAt and updatedAt timestamps", () => {
    const entityWithBothTimestamps = defineEntity({
      name: "TestEntityWithBothTimestamps",
      schema: testSchema,
      primaryKey: createIndex()
        .input(primaryKeySchema)
        .partitionKey((item) => `TEST#${item.id}`)
        .sortKey(() => "METADATA#"),
      queries: {},
      settings: {
        timestamps: {
          createdAt: {
            format: "ISO",
          },
          updatedAt: {
            format: "UNIX",
          },
        },
      },
    });

    let repository: ReturnType<typeof entityWithBothTimestamps.createRepository>;

    beforeEach(() => {
      repository = entityWithBothTimestamps.createRepository(mockTable as unknown as Table);
    });

    it("should add both timestamps when creating an entity", async () => {
      vi.useFakeTimers();
      const mockDate = new Date("2023-01-01T12:00:00Z");
      vi.setSystemTime(mockDate);

      const testData: TestEntity = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
      };

      const result = await repository.create(testData).execute();

      expect(result).toMatchObject({
        createdAt: mockDate.toISOString(),
        updatedAt: Math.floor(mockDate.getTime() / 1000),
      });
    });

    it("should only update the updatedAt timestamp when updating an entity", () => {
      vi.useFakeTimers();
      const mockDate = new Date("2023-01-01T12:00:00Z");
      vi.setSystemTime(mockDate);

      const key = { id: "123" };
      const updateData = { name: "Updated Name" };

      const builder = repository.update(key, updateData);
      const { readable } = builder.debug();

      // Verify that only updatedAt was included in the update
      expect(readable.updateExpression).toContain('name = "Updated Name"');
      expect(readable.updateExpression).toContain("updatedAt");
      expect(readable.updateExpression).not.toContain("createdAt");
    });

    it("should add both timestamps when upserting an entity", async () => {
      vi.useFakeTimers();
      const mockDate = new Date("2023-01-01T12:00:00Z");
      vi.setSystemTime(mockDate);

      const testData: TestEntity & { id: string } = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
      };

      const result = await repository.upsert(testData).execute();

      expect(result).toMatchObject({
        createdAt: mockDate.toISOString(),
        updatedAt: Math.floor(mockDate.getTime() / 1000),
      });
    });
  });

  describe("with only createdAt timestamp", () => {
    const entityWithCreatedAtOnly = defineEntity({
      name: "TestEntityWithCreatedAtOnly",
      schema: testSchema,
      primaryKey: createIndex()
        .input(primaryKeySchema)
        .partitionKey((item) => `TEST#${item.id}`)
        .sortKey(() => "METADATA#"),
      queries: {},
      settings: {
        timestamps: {
          createdAt: {
            format: "ISO",
          },
        },
      },
    });

    let repository: ReturnType<typeof entityWithCreatedAtOnly.createRepository>;

    beforeEach(() => {
      repository = entityWithCreatedAtOnly.createRepository(mockTable as unknown as Table);
    });

    it("should add only createdAt timestamp when creating an entity", async () => {
      vi.useFakeTimers();
      const mockDate = new Date("2023-01-01T12:00:00Z");
      vi.setSystemTime(mockDate);

      const testData: TestEntity = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
      };

      const result = await repository.create(testData).execute();

      expect(result).toMatchObject({ createdAt: mockDate.toISOString() });
      expect(result).not.toHaveProperty("updatedAt");
    });

    it("should not add any timestamps when updating an entity", () => {
      const key = { id: "123" };
      const updateData = { name: "Updated Name" };

      const builder = repository.update(key, updateData);
      const { readable } = builder.debug();

      expect(readable.updateExpression).toContain('name = "Updated Name"');
      expect(readable.updateExpression).not.toContain("createdAt");
      expect(readable.updateExpression).not.toContain("updatedAt");
    });
  });

  describe("with only updatedAt timestamp", () => {
    const entityWithUpdatedAtOnly = defineEntity({
      name: "TestEntityWithUpdatedAtOnly",
      schema: testSchema,
      primaryKey: createIndex()
        .input(primaryKeySchema)
        .partitionKey((item) => `TEST#${item.id}`)
        .sortKey(() => "METADATA#"),
      queries: {},
      settings: {
        timestamps: {
          updatedAt: {
            format: "UNIX",
          },
        },
      },
    });

    let repository: ReturnType<typeof entityWithUpdatedAtOnly.createRepository>;

    beforeEach(() => {
      repository = entityWithUpdatedAtOnly.createRepository(mockTable as unknown as Table);
    });

    it("should add only updatedAt timestamp when creating an entity", async () => {
      vi.useFakeTimers();
      const mockDate = new Date("2023-01-01T12:00:00Z");
      vi.setSystemTime(mockDate);

      const testData: TestEntity = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
      };

      const result = await repository.create(testData).execute();

      expect(result).not.toHaveProperty("createdAt");
      expect(result).toMatchObject({
        updatedAt: Math.floor(mockDate.getTime() / 1000),
      });
    });

    it("should add updatedAt timestamp when updating an entity", () => {
      vi.useFakeTimers();
      const mockDate = new Date("2023-01-01T12:00:00Z");
      vi.setSystemTime(mockDate);

      const key = { id: "123" };
      const updateData = { name: "Updated Name" };

      const builder = repository.update(key, updateData);
      const { readable } = builder.debug();

      expect(readable.updateExpression).toContain('name = "Updated Name"');
      expect(readable.updateExpression).toContain("updatedAt");
    });
  });

  describe("with custom attribute names for timestamps", () => {
    const entityWithCustomTimestampNames = defineEntity({
      name: "TestEntityWithCustomTimestampNames",
      schema: testSchema,
      primaryKey: createIndex()
        .input(primaryKeySchema)
        .partitionKey((item) => `TEST#${item.id}`)
        .sortKey(() => "METADATA#"),
      queries: {},
      settings: {
        timestamps: {
          createdAt: {
            format: "ISO",
            attributeName: "dateCreated",
          },
          updatedAt: {
            format: "UNIX",
            attributeName: "dateModified",
          },
        },
      },
    });

    let repository: ReturnType<typeof entityWithCustomTimestampNames.createRepository>;

    beforeEach(() => {
      repository = entityWithCustomTimestampNames.createRepository(mockTable as unknown as Table);
    });

    it("should use custom attribute names for timestamps", async () => {
      vi.useFakeTimers();
      const mockDate = new Date("2023-01-01T12:00:00Z");
      vi.setSystemTime(mockDate);

      const testData: TestEntity = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
      };

      const result = await repository.create(testData).execute();

      expect(result).toMatchObject({
        dateCreated: mockDate.toISOString(),
        dateModified: Math.floor(mockDate.getTime() / 1000),
      });
      expect(result).not.toHaveProperty("createdAt");
      expect(result).not.toHaveProperty("updatedAt");
    });
  });

  describe("without timestamps configuration", () => {
    const entityWithoutTimestamps = defineEntity({
      name: "TestEntityWithoutTimestamps",
      schema: testSchema,
      primaryKey: createIndex()
        .input(primaryKeySchema)
        .partitionKey((item) => `TEST#${item.id}`)
        .sortKey(() => "METADATA#"),
      queries: {},
    });

    let repository: ReturnType<typeof entityWithoutTimestamps.createRepository>;

    beforeEach(() => {
      repository = entityWithoutTimestamps.createRepository(mockTable as unknown as Table);
    });

    it("should not add any timestamps when creating an entity", async () => {
      const testData: TestEntity = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
      };

      const result = await repository.create(testData).execute();

      expect(result).not.toHaveProperty("createdAt");
      expect(result).not.toHaveProperty("updatedAt");
    });

    it("should not add any timestamps when updating an entity", () => {
      const key = { id: "123" };
      const updateData = { name: "Updated Name" };

      const builder = repository.update(key, updateData);
      const { readable } = builder.debug();

      expect(readable.updateExpression).toContain('name = "Updated Name"');
      expect(readable.updateExpression).not.toContain("createdAt");
      expect(readable.updateExpression).not.toContain("updatedAt");
    });
  });
});
