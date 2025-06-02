import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { defineEntity, createIndex } from "../entity";
import type { Table } from "../table";
import type { DynamoItem } from "../types";
import type { StandardSchemaV1 } from "../standard-schema";

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

// Create a mock table
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
  gsis: {},
};

describe("Entity Timestamp Operations", () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    // Restore real timers after each test
    vi.useRealTimers();
  });

  describe("with both createdAt and updatedAt timestamps", () => {
    // Define an entity repository with both createdAt and updatedAt timestamps
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
      // Create repository instance
      repository = entityWithBothTimestamps.createRepository(mockTable as unknown as Table);
    });

    it("should add both timestamps when creating an entity", async () => {
      // Use fake timers to control the date
      vi.useFakeTimers();
      const mockDate = new Date("2023-01-01T12:00:00Z");
      vi.setSystemTime(mockDate);

      const testData: TestEntity = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
      };

      const mockBuilder = {
        execute: vi.fn().mockResolvedValue(testData),
      };

      mockTable.create.mockReturnValue(mockBuilder);

      const builder = repository.create(testData);
      await builder.execute();

      // Verify that both timestamps were added
      // @ts-ignore
      expect(builder.item).toHaveProperty("createdAt", mockDate.toISOString());
      // @ts-ignore
      expect(builder.item).toHaveProperty("updatedAt", Math.floor(mockDate.getTime() / 1000));
    });

    it("should only update the updatedAt timestamp when updating an entity", async () => {
      // Use fake timers to control the date
      vi.useFakeTimers();
      const mockDate = new Date("2023-01-01T12:00:00Z");
      vi.setSystemTime(mockDate);

      const key = {
        id: "123",
      };

      const updateData = {
        name: "Updated Name",
      };

      const mockBuilder = {
        condition: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ item: { ...key, ...updateData } }),
      };

      mockTable.update.mockReturnValue(mockBuilder);

      const builder = repository.update(key, updateData);
      await builder.execute();

      // Verify that only updatedAt was included in the update
      // @ts-ignore - ignore the type error
      const setCall = mockBuilder.set.mock.calls[0][0];
      expect(setCall).toHaveProperty("name", "Updated Name");
      expect(setCall).toHaveProperty("updatedAt", Math.floor(mockDate.getTime() / 1000));
      expect(setCall).not.toHaveProperty("createdAt");
    });

    it("should add both timestamps when upserting an entity", async () => {
      // Use fake timers to control the date
      vi.useFakeTimers();
      const mockDate = new Date("2023-01-01T12:00:00Z");
      vi.setSystemTime(mockDate);

      const testData: TestEntity & { id: string } = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
      };

      const mockBuilder = {
        execute: vi.fn().mockResolvedValue(testData),
      };

      mockTable.put.mockReturnValue(mockBuilder);

      const builder = repository.upsert(testData);
      await builder.execute();

      // Verify that both timestamps were added
      // @ts-ignore
      expect(builder.item).toHaveProperty("createdAt", mockDate.toISOString());
      // @ts-ignore
      expect(builder.item).toHaveProperty("updatedAt", Math.floor(mockDate.getTime() / 1000));
    });
  });

  describe("with only createdAt timestamp", () => {
    // Define an entity repository with only createdAt timestamp
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
      // Create repository instance
      repository = entityWithCreatedAtOnly.createRepository(mockTable as unknown as Table);
    });

    it("should add only createdAt timestamp when creating an entity", async () => {
      // Use fake timers to control the date
      vi.useFakeTimers();
      const mockDate = new Date("2023-01-01T12:00:00Z");
      vi.setSystemTime(mockDate);

      const testData: TestEntity = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
      };

      const mockBuilder = {
        execute: vi.fn().mockResolvedValue(testData),
      };

      mockTable.create.mockReturnValue(mockBuilder);

      const builder = repository.create(testData);
      await builder.execute();

      // Verify that only createdAt was added
      // @ts-ignore
      expect(builder.item).toHaveProperty("createdAt", mockDate.toISOString());
      // @ts-ignore
      expect(builder.item).not.toHaveProperty("updatedAt");
    });

    it("should not add any timestamps when updating an entity", async () => {
      const key = {
        id: "123",
      };

      const updateData = {
        name: "Updated Name",
      };

      const mockBuilder = {
        condition: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ item: { ...key, ...updateData } }),
      };

      mockTable.update.mockReturnValue(mockBuilder);

      const builder = repository.update(key, updateData);
      await builder.execute();

      // Verify that no timestamps were included in the update
      // @ts-ignore - ignore the type error
      const setCall = mockBuilder.set.mock.calls[0][0];
      expect(setCall).toEqual(updateData);
      expect(setCall).not.toHaveProperty("createdAt");
      expect(setCall).not.toHaveProperty("updatedAt");
    });
  });

  describe("with only updatedAt timestamp", () => {
    // Define an entity repository with only updatedAt timestamp
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
      // Create repository instance
      repository = entityWithUpdatedAtOnly.createRepository(mockTable as unknown as Table);
    });

    it("should add only updatedAt timestamp when creating an entity", async () => {
      // Use fake timers to control the date
      vi.useFakeTimers();
      const mockDate = new Date("2023-01-01T12:00:00Z");
      vi.setSystemTime(mockDate);

      const testData: TestEntity = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
      };

      const mockBuilder = {
        execute: vi.fn().mockResolvedValue(testData),
      };

      mockTable.create.mockReturnValue(mockBuilder);

      const builder = repository.create(testData);
      await builder.execute();

      // Verify that only updatedAt was added
      // @ts-ignore
      expect(builder.item).not.toHaveProperty("createdAt");
      // @ts-ignore
      expect(builder.item).toHaveProperty("updatedAt", Math.floor(mockDate.getTime() / 1000));
    });

    it("should add updatedAt timestamp when updating an entity", async () => {
      // Use fake timers to control the date
      vi.useFakeTimers();
      const mockDate = new Date("2023-01-01T12:00:00Z");
      vi.setSystemTime(mockDate);

      const key = {
        id: "123",
      };

      const updateData = {
        name: "Updated Name",
      };

      const mockBuilder = {
        condition: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ item: { ...key, ...updateData } }),
      };

      mockTable.update.mockReturnValue(mockBuilder);

      const builder = repository.update(key, updateData);
      await builder.execute();

      // Verify that updatedAt was included in the update
      // @ts-ignore - ignore the type error
      const setCall = mockBuilder.set.mock.calls[0][0];
      expect(setCall).toHaveProperty("name", "Updated Name");
      expect(setCall).toHaveProperty("updatedAt", Math.floor(mockDate.getTime() / 1000));
    });
  });

  describe("with custom attribute names for timestamps", () => {
    // Define an entity repository with custom attribute names for timestamps
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
      // Create repository instance
      repository = entityWithCustomTimestampNames.createRepository(mockTable as unknown as Table);
    });

    it("should use custom attribute names for timestamps", async () => {
      // Use fake timers to control the date
      vi.useFakeTimers();
      const mockDate = new Date("2023-01-01T12:00:00Z");
      vi.setSystemTime(mockDate);

      const testData: TestEntity = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
      };

      const mockBuilder = {
        execute: vi.fn().mockResolvedValue(testData),
      };

      mockTable.create.mockReturnValue(mockBuilder);

      const builder = repository.create(testData);
      await builder.execute();

      // Verify that custom attribute names were used
      // @ts-ignore
      expect(builder.item).toHaveProperty("dateCreated", mockDate.toISOString());
      // @ts-ignore
      expect(builder.item).toHaveProperty("dateModified", Math.floor(mockDate.getTime() / 1000));
      // @ts-ignore
      expect(builder.item).not.toHaveProperty("createdAt");
      // @ts-ignore
      expect(builder.item).not.toHaveProperty("updatedAt");
    });
  });

  describe("without timestamps configuration", () => {
    // Define an entity repository without timestamps configuration
    const entityWithoutTimestamps = defineEntity({
      name: "TestEntityWithoutTimestamps",
      schema: testSchema,
      primaryKey: createIndex()
        .input(primaryKeySchema)
        .partitionKey((item) => `TEST#${item.id}`)
        .sortKey(() => "METADATA#"),
      queries: {},
      // No timestamps configuration
    });

    let repository: ReturnType<typeof entityWithoutTimestamps.createRepository>;

    beforeEach(() => {
      // Create repository instance
      repository = entityWithoutTimestamps.createRepository(mockTable as unknown as Table);
    });

    it("should not add any timestamps when creating an entity", async () => {
      const testData: TestEntity = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
      };

      const mockBuilder = {
        execute: vi.fn().mockResolvedValue(testData),
      };

      mockTable.create.mockReturnValue(mockBuilder);

      const builder = repository.create(testData);
      await builder.execute();

      // Verify that no timestamps were added
      // @ts-ignore
      expect(builder.item).not.toHaveProperty("createdAt");
      // @ts-ignore
      expect(builder.item).not.toHaveProperty("updatedAt");
    });

    it("should not add any timestamps when updating an entity", async () => {
      const key = {
        id: "123",
      };

      const updateData = {
        name: "Updated Name",
      };

      const mockBuilder = {
        condition: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ item: { ...key, ...updateData } }),
      };

      mockTable.update.mockReturnValue(mockBuilder);

      const builder = repository.update(key, updateData);
      await builder.execute();

      // Verify that no timestamps were included in the update
      // @ts-ignore - ignore the type error
      const setCall = mockBuilder.set.mock.calls[0][0];
      expect(setCall).toEqual(updateData);
      expect(setCall).not.toHaveProperty("createdAt");
      expect(setCall).not.toHaveProperty("updatedAt");
    });
  });
});
