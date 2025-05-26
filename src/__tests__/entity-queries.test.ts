import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { defineEntity, createQueries, createIndex } from "../entity";
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

const byIdInputSchema: StandardSchemaV1<{ id: string; test: string }> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: vi.fn().mockImplementation((data) => ({
      value: data,
    })) as unknown as (
      value: unknown,
    ) => { value: { id: string; test: string } } | { issues: Array<{ message: string }> },
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

const byStatusInputSchema: StandardSchemaV1<{ status: string; id: string; test: string }> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: vi.fn().mockImplementation((data) => ({
      value: data,
    })) as unknown as (
      value: unknown,
    ) => { value: { status: string; id: string; test: string } } | { issues: Array<{ message: string }> },
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

const queryBuilder = createQueries<TestEntity>();

describe("Entity Repository", () => {
  const entityRepository = defineEntity({
    name: "TestEntity",
    schema: testSchema,
    primaryKey: createIndex()
      .input(primaryKeySchema)
      .partitionKey((item) => `TEST#${item.id}`)
      .sortKey(() => "METADATA#"),
    queries: {
      byId: queryBuilder.input(byIdInputSchema).query(({ input, entity }) => {
        return entity.query({
          pk: `TEST#${input.id}`,
          sk: (op) => op.beginsWith("METADATA#"),
        });
      }),
      byStatus: queryBuilder.input(byStatusInputSchema).query(({ input, entity }) => {
        return entity.scan().filter(eq("status", input.status));
      }),
    },
  });

  let repository: ReturnType<typeof entityRepository.createRepository>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create repository instance
    repository = entityRepository.createRepository(mockTable as unknown as Table);
  });

  describe("create", () => {
    it("should create an item with entity type and validated data", async () => {
      const testData: TestEntity = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
        createdAt: "2024-01-01",
      };

      const mockBuilder = {
        execute: vi.fn().mockResolvedValue(testData),
      };

      mockTable.create.mockReturnValue(mockBuilder);

      const result = await repository.create(testData).execute();

      expect(mockTable.create).toHaveBeenCalledWith({
        ...testData,
        entityType: "TestEntity",
        pk: "TEST#123",
        sk: "METADATA#",
      });
      expect(result).toEqual(testData);
    });

    it("should add timestamps when configured", async () => {
      // Create a new entity repository with timestamps configured
      const entityWithTimestamps = defineEntity({
        name: "TestEntityWithTimestamps",
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
              attributeName: "modifiedAt",
            },
          },
        },
      });

      const repoWithTimestamps = entityWithTimestamps.createRepository(mockTable as unknown as Table);

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

      await repoWithTimestamps.create(testData).execute();

      // Verify that timestamps were added
      // @ts-expect-error
      const createCall = mockTable.create.mock.calls[0][0];
      expect(createCall).toHaveProperty("entityType", "TestEntityWithTimestamps");
      expect(createCall).toHaveProperty("createdAt");
      expect(createCall.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/); // ISO format
      expect(createCall).toHaveProperty("modifiedAt");
      expect(typeof createCall.modifiedAt).toBe("number"); // UNIX format
    });

    it("should throw error on validation failure", async () => {
      const testData: TestEntity = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
        createdAt: "2024-01-01",
      };

      (testSchema["~standard"].validate as Mock).mockImplementationOnce(() => ({
        issues: [{ message: "Validation failed" }],
      }));

      const mockBuilder = {
        execute: vi.fn(),
      };

      mockTable.create.mockReturnValue(mockBuilder);

      await expect(repository.create(testData).execute()).rejects.toThrow("Validation failed");
    });
  });

  describe("get", () => {
    it("should get an item with correct key transformation", async () => {
      const key = {
        id: "123",
        type: "test",
      };

      const mockBuilder = {
        execute: vi.fn().mockResolvedValue({ item: { id: "123", type: "test" } }),
      };

      mockTable.get.mockReturnValue(mockBuilder);

      await repository.get(key).execute();

      expect(mockTable.get).toHaveBeenCalledWith({
        pk: "TEST#123",
        sk: "METADATA#",
      });
    });
  });

  describe("update", () => {
    it("should update an item with entity type condition", async () => {
      const key = {
        id: "123",
        type: "test",
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

      await repository.update(key, updateData).execute();

      expect(mockTable.update).toHaveBeenCalledWith({
        pk: "TEST#123",
        sk: "METADATA#",
      });
      expect(mockBuilder.condition).toHaveBeenCalledWith(eq("entityType", "TestEntity"));
      expect(mockBuilder.set).toHaveBeenCalledWith(updateData);
    });

    it("should add updatedAt timestamp when configured", async () => {
      // Create a new entity repository with timestamps configured
      const entityWithTimestamps = defineEntity({
        name: "TestEntityWithTimestamps",
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
              attributeName: "modifiedAt",
            },
          },
        },
      });

      const repoWithTimestamps = entityWithTimestamps.createRepository(mockTable as unknown as Table);

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

      await repoWithTimestamps.update(key, updateData).execute();

      // Verify that only updatedAt timestamp was added (not createdAt)
      expect(mockBuilder.set).toHaveBeenCalled();
      // @ts-expect-error
      const setCall = mockBuilder.set.mock.calls[0][0];
      expect(setCall).toHaveProperty("name", "Updated Name");
      expect(setCall).toHaveProperty("modifiedAt");
      expect(typeof setCall.modifiedAt).toBe("number"); // UNIX format
      expect(setCall).not.toHaveProperty("createdAt"); // createdAt should not be added on updates
    });
  });

  describe("delete", () => {
    it("should delete an item with entity type condition", async () => {
      const key = {
        id: "123",
        type: "test",
      };

      const mockBuilder = {
        condition: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({}),
      };

      mockTable.delete.mockReturnValue(mockBuilder);

      await repository.delete(key).execute();

      expect(mockTable.delete).toHaveBeenCalledWith({
        pk: "TEST#123",
        sk: "METADATA#",
      });
      expect(mockBuilder.condition).toHaveBeenCalledWith(eq("entityType", "TestEntity"));
    });
  });

  describe("scan", () => {
    it("should scan with entity type filter", async () => {
      const mockBuilder = {
        filter: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ items: [] }),
      };

      mockTable.scan.mockReturnValue(mockBuilder);

      await repository.scan().execute();

      expect(mockTable.scan).toHaveBeenCalled();
      expect(mockBuilder.filter).toHaveBeenCalledWith(eq("entityType", "TestEntity"));
    });
  });

  describe("custom queries", () => {
    it("should execute custom query with input validation", async () => {
      const input = {
        id: "123",
        test: "test-value",
      };

      const mockBuilder = {
        filter: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ items: [] }),
      };

      mockTable.query.mockReturnValue(mockBuilder);

      await repository.query.byId(input).execute();

      expect(mockTable.query).toHaveBeenCalledWith({
        pk: "TEST#123",
        sk: expect.any(Function),
      });
      expect(mockBuilder.filter).toHaveBeenCalledWith(eq("entityType", "TestEntity"));
    });

    it("should throw error on query input validation failure", async () => {
      const input = {
        id: "123",
        test: "test-value",
        name: "Test Item",
        type: "test",
        status: "active",
        createdAt: "2024-01-01",
      };

      // Mock the validation function for byIdInputSchema
      (byIdInputSchema["~standard"].validate as Mock).mockImplementationOnce(() => ({
        issues: [{ message: "Validation failed" }],
      }));

      const mockBuilder = {
        filter: vi.fn().mockReturnThis(),
        execute: vi.fn(),
      };

      mockTable.query.mockReturnValue(mockBuilder);

      if (!repository.query.byId) {
        throw new Error("Query byId is not defined");
      }

      await expect(repository.query.byId(input).execute()).rejects.toThrow("Validation failed");
    });
  });

  describe("custom entity type column name", () => {
    it("should use custom entity type column name in constraints", async () => {
      // Create a new entity repository with custom entity type column name
      const customEntityRepository = defineEntity({
        name: "CustomEntity",
        schema: testSchema,
        primaryKey: createIndex()
          .input(primaryKeySchema)
          .partitionKey((item) => `TEST#${item.id}`)
          .sortKey(() => "METADATA#"),
        queries: {},
        settings: {
          entityTypeAttributeName: "customEntityType",
        },
      });

      // Create repository instance
      const customRepository = customEntityRepository.createRepository(mockTable as unknown as Table);

      // Test update method with custom entity type column name
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

      await customRepository.update(key, updateData).execute();

      // Verify that the custom entity type column name is used in the condition
      expect(mockBuilder.condition).toHaveBeenCalledWith(eq("customEntityType", "CustomEntity"));
    });
  });

  describe("upsert", () => {
    it("should upsert an item with entity type and validated data", async () => {
      const testData: TestEntity = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
      };

      const mockBuilder = {
        execute: vi.fn().mockResolvedValue(testData),
      };

      mockTable.put.mockReturnValue(mockBuilder);

      const result = await repository.upsert(testData).execute();

      expect(mockTable.put).toHaveBeenCalled();
      // @ts-expect-error
      const putCall = mockTable.put.mock.calls[0][0];
      expect(putCall).toHaveProperty("id", testData.id);
      expect(putCall).toHaveProperty("name", testData.name);
      expect(putCall).toHaveProperty("type", testData.type);
      expect(putCall).toHaveProperty("status", testData.status);
      expect(putCall).toHaveProperty("entityType", "TestEntity");
      expect(result).toEqual(testData);
    });

    it("should add timestamps when configured", async () => {
      // Create a new entity repository with timestamps configured
      const entityWithTimestamps = defineEntity({
        name: "TestEntityWithTimestamps",
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
              attributeName: "modifiedAt",
            },
          },
        },
      });

      const repoWithTimestamps = entityWithTimestamps.createRepository(mockTable as unknown as Table);

      const testData: TestEntity = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
      };

      const mockBuilder = {
        execute: vi.fn().mockResolvedValue(testData),
      };

      mockTable.put.mockReturnValue(mockBuilder);

      await repoWithTimestamps.upsert(testData).execute();

      // Verify that timestamps were added
      // @ts-expect-error
      const putCall = mockTable.put.mock.calls[0][0];
      expect(putCall).toHaveProperty("entityType", "TestEntityWithTimestamps");
      expect(putCall).toHaveProperty("createdAt");
      expect(putCall.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/); // ISO format
      expect(putCall).toHaveProperty("modifiedAt");
      expect(typeof putCall.modifiedAt).toBe("number"); // UNIX format
    });
  });
});
