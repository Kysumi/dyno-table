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
  createdAt: string;
}

// Create a mock schema with proper StandardSchemaV1 structure
const testSchema: StandardSchemaV1<TestEntity> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: vi.fn().mockImplementation((data) => ({
      value: data,
    })) as unknown as (value: unknown) => { value: TestEntity } | { issues: Array<{ message: string }> },
  },
};

const byIdInputSchema: StandardSchemaV1<{ id: string }> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: vi.fn().mockImplementation((data) => ({
      value: data,
    })) as unknown as (value: unknown) => { value: TestEntity } | { issues: Array<{ message: string }> },
  },
};

const primaryKeySchema: StandardSchemaV1<{ id: string; test: string }> = {
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
  let entityRepository: ReturnType<typeof defineEntity<TestEntity, { id: string }>>;
  let repository: ReturnType<typeof entityRepository.createRepository>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create test entity definition
    entityRepository = defineEntity({
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
      },
    });

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
      });
      expect(result).toEqual(testData);
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
      const key: Partial<TestEntity> = {
        id: "123",
        type: "test",
      };

      const mockBuilder = {
        execute: vi.fn().mockResolvedValue({ item: { id: "123", type: "test" } }),
      };

      mockTable.get.mockReturnValue(mockBuilder);

      await repository.get(key as TestEntity).execute();

      expect(mockTable.get).toHaveBeenCalledWith({
        pk: "TEST#123",
        sk: "METADATA#test",
      });
    });
  });

  describe("update", () => {
    it("should update an item with entity type condition", async () => {
      const key: Partial<TestEntity> = {
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

      await repository.update(key as TestEntity, updateData).execute();

      expect(mockTable.update).toHaveBeenCalledWith({
        pk: "TEST#123",
        sk: "METADATA#test",
      });
      expect(mockBuilder.condition).toHaveBeenCalledWith(eq("entityType", "TestEntity"));
      expect(mockBuilder.set).toHaveBeenCalledWith(updateData);
    });
  });

  describe("delete", () => {
    it("should delete an item with entity type condition", async () => {
      const key: Partial<TestEntity> = {
        id: "123",
        type: "test",
      };

      const mockBuilder = {
        condition: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({}),
      };

      mockTable.delete.mockReturnValue(mockBuilder);

      await repository.delete(key as TestEntity).execute();

      expect(mockTable.delete).toHaveBeenCalledWith({
        pk: "TEST#123",
        sk: "METADATA#test",
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
      const input: Partial<TestEntity> = {
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
        filter: vi.fn().mockReturnThis(),
        execute: vi.fn(),
      };

      mockTable.query.mockReturnValue(mockBuilder);

      await expect(repository.query.byId(input as TestEntity).execute()).rejects.toThrow("Validation failed");
    });
  });
});
