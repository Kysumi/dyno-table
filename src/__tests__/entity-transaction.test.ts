import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { defineEntity, createIndex } from "../entity";
import type { Table } from "../table";
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

// Mock transaction builder
const mockTransaction = {
  putWithCommand: vi.fn(),
  updateWithCommand: vi.fn(),
  deleteWithCommand: vi.fn(),
  execute: vi.fn(),
};

describe("Entity Transaction Support", () => {
  const entityRepository = defineEntity({
    name: "TestEntity",
    schema: testSchema,
    primaryKey: createIndex()
      .input(primaryKeySchema)
      .partitionKey((item) => `TEST#${item.id}`)
      .sortKey(() => "METADATA#"),
    queries: {},
  });

  let repository: ReturnType<typeof entityRepository.createRepository>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create repository instance
    repository = entityRepository.createRepository(mockTable as unknown as Table);
  });

  describe("create with transaction", () => {
    it("should work with withTransaction method", () => {
      const testData: TestEntity = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
      };

      const mockBuilder = {
        execute: vi.fn().mockResolvedValue(testData),
        withTransaction: vi.fn().mockReturnThis(),
      };

      mockTable.create.mockReturnValue(mockBuilder);

      // This should not throw an error
      const builder = repository.create(testData);
      // @ts-ignore
      builder.withTransaction(mockTransaction);

      // Verify that the builder has the correct data including keys after withTransaction is called
      // @ts-ignore
      expect(builder.item).toEqual({
        ...testData,
        entityType: "TestEntity",
        pk: "TEST#123",
        sk: "METADATA#",
      });

      // Verify that withTransaction was called
      expect(mockBuilder.withTransaction).toHaveBeenCalledWith(mockTransaction);
    });

    it("should include timestamps in transaction when configured", () => {
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
        withTransaction: vi.fn().mockReturnThis(),
      };

      mockTable.create.mockReturnValue(mockBuilder);

      // This should not throw an error
      const builder = repoWithTimestamps.create(testData);
      // @ts-ignore
      builder.withTransaction(mockTransaction);

      // Verify that the builder has the correct data including keys and timestamps after withTransaction is called
      // @ts-ignore
      expect(builder.item).toEqual({
        ...testData,
        entityType: "TestEntityWithTimestamps",
        pk: "TEST#123",
        sk: "METADATA#",
        createdAt: expect.any(String),
        modifiedAt: expect.any(Number),
      });

      // Verify that withTransaction was called
      expect(mockBuilder.withTransaction).toHaveBeenCalledWith(mockTransaction);
    });

    it("should generate keys when withTransaction is called", () => {
      const testData: TestEntity = {
        id: "456",
        name: "Another Item",
        type: "test",
        status: "pending",
      };

      const mockBuilder = {
        execute: vi.fn().mockResolvedValue(testData),
        withTransaction: vi.fn().mockReturnThis(),
        toDynamoCommand: vi.fn().mockReturnValue({
          tableName: "test-table",
          item: {
            ...testData,
            entityType: "TestEntity",
            pk: "TEST#456",
            sk: "METADATA#",
          },
        }),
      };

      mockTable.create.mockReturnValue(mockBuilder);

      // Create the builder
      const builder = repository.create(testData);

      // Keys should not be generated yet
      // @ts-ignore
      expect(builder.item).toBeUndefined();

      // Simulate what happens when withTransaction is called
      // This should trigger key generation
      // @ts-ignore
      builder.withTransaction(mockTransaction);

      // Verify that keys are generated when withTransaction is called
      // @ts-ignore
      expect(builder.item).toEqual({
        ...testData,
        entityType: "TestEntity",
        pk: "TEST#456",
        sk: "METADATA#",
      });

      // Verify that withTransaction was called successfully
      expect(mockBuilder.withTransaction).toHaveBeenCalledWith(mockTransaction);
    });

    it("should work with complex primary keys", () => {
      // Create entity with composite primary key
      const complexEntity = defineEntity({
        name: "ComplexEntity",
        schema: testSchema,
        primaryKey: createIndex()
          .input(testSchema)
          .partitionKey((item) => `USER#${item.id}`)
          .sortKey((item) => `${item.type}#${item.status}`),
        queries: {},
      });

      const complexRepo = complexEntity.createRepository(mockTable as unknown as Table);

      const testData: TestEntity = {
        id: "789",
        name: "Complex Item",
        type: "premium",
        status: "active",
      };

      const mockBuilder = {
        execute: vi.fn().mockResolvedValue(testData),
        withTransaction: vi.fn().mockReturnThis(),
      };

      mockTable.create.mockReturnValue(mockBuilder);

      // Create the builder
      const builder = complexRepo.create(testData);
      // @ts-ignore
      builder.withTransaction(mockTransaction);

      // Verify that complex keys are generated correctly after withTransaction is called
      // @ts-ignore
      expect(builder.item).toEqual({
        ...testData,
        entityType: "ComplexEntity",
        pk: "USER#789",
        sk: "premium#active",
      });

      expect(mockBuilder.withTransaction).toHaveBeenCalledWith(mockTransaction);
    });

    it("should handle entities without sort key", () => {
      // Create entity with only partition key
      const simpleEntity = defineEntity({
        name: "SimpleEntity",
        schema: testSchema,
        primaryKey: createIndex()
          .input(primaryKeySchema)
          .partitionKey((item) => `SIMPLE#${item.id}`)
          .withoutSortKey(),
        queries: {},
      });

      const simpleRepo = simpleEntity.createRepository(mockTable as unknown as Table);

      const testData: TestEntity = {
        id: "999",
        name: "Simple Item",
        type: "basic",
        status: "active",
      };

      const mockBuilder = {
        execute: vi.fn().mockResolvedValue(testData),
        withTransaction: vi.fn().mockReturnThis(),
      };

      mockTable.create.mockReturnValue(mockBuilder);

      // Create the builder
      const builder = simpleRepo.create(testData);
      // @ts-ignore
      builder.withTransaction(mockTransaction);

      // Verify that only partition key is generated (no sort key) after withTransaction is called
      // @ts-ignore
      expect(builder.item).toEqual({
        ...testData,
        entityType: "SimpleEntity",
        pk: "SIMPLE#999",
      });

      expect(mockBuilder.withTransaction).toHaveBeenCalledWith(mockTransaction);
    });

    it("should generate secondary index keys for transactions", () => {
      // Create entity with GSI
      const entityWithGSI = defineEntity({
        name: "EntityWithGSI",
        schema: testSchema,
        primaryKey: createIndex()
          .input(primaryKeySchema)
          .partitionKey((item) => `MAIN#${item.id}`)
          .sortKey(() => "ITEM#"),
        indexes: {
          statusIndex: createIndex()
            .input(testSchema)
            .partitionKey((item) => `STATUS#${item.status}`)
            .sortKey((item) => `TYPE#${item.type}`),
          typeIndex: createIndex()
            .input(testSchema)
            .partitionKey((item) => `TYPE#${item.type}`)
            .withoutSortKey(),
        },
        queries: {},
      });

      // Mock table with GSI configuration
      const mockTableWithGSI = {
        ...mockTable,
        gsis: {
          statusIndex: {
            partitionKey: "gsi1pk",
            sortKey: "gsi1sk",
          },
          typeIndex: {
            partitionKey: "gsi2pk",
          },
        },
      };

      const repoWithGSI = entityWithGSI.createRepository(mockTableWithGSI as unknown as Table);

      const testData: TestEntity = {
        id: "gsi-test",
        name: "GSI Test Item",
        type: "premium",
        status: "active",
      };

      const mockBuilder = {
        execute: vi.fn().mockResolvedValue(testData),
        withTransaction: vi.fn().mockReturnThis(),
      };

      mockTableWithGSI.create.mockReturnValue(mockBuilder);

      // Create the builder
      const builder = repoWithGSI.create(testData);
      // @ts-ignore
      builder.withTransaction(mockTransaction);

      // Verify that primary and secondary index keys are generated after withTransaction is called
      // @ts-ignore
      expect(builder.item).toEqual({
        ...testData,
        entityType: "EntityWithGSI",
        pk: "MAIN#gsi-test",
        sk: "ITEM#",
        gsi1pk: "STATUS#active",
        gsi1sk: "TYPE#premium",
        gsi2pk: "TYPE#premium",
      });

      expect(mockBuilder.withTransaction).toHaveBeenCalledWith(mockTransaction);
    });

    it("should validate data during execute but not during withTransaction", async () => {
      const testData: TestEntity = {
        id: "validation-test",
        name: "Validation Test",
        type: "test",
        status: "active",
      };

      const mockBuilder = {
        execute: vi.fn(),
        withTransaction: vi.fn().mockReturnThis(),
      };

      mockTable.create.mockReturnValue(mockBuilder);

      // Create the builder - this should work even with invalid data
      const builder = repository.create(testData);

      // withTransaction should work without validation
      // @ts-ignore
      expect(() => builder.withTransaction(mockTransaction)).not.toThrow();

      // Mock validation failure for execute
      (testSchema["~standard"].validate as Mock).mockImplementationOnce(() => ({
        issues: [{ message: "Validation failed during execute" }],
      }));

      // execute should fail with validation error
      await expect(builder.execute()).rejects.toThrow("Validation failed during execute");

      // Verify that withTransaction was called successfully despite later validation failure
      expect(mockBuilder.withTransaction).toHaveBeenCalledWith(mockTransaction);
    });

    it("should preserve builder chaining with transactions", () => {
      const testData: TestEntity = {
        id: "chain-test",
        name: "Chain Test",
        type: "test",
        status: "active",
      };

      const mockBuilder = {
        execute: vi.fn().mockResolvedValue(testData),
        withTransaction: vi.fn().mockReturnThis(),
        condition: vi.fn().mockReturnThis(),
        returnValues: vi.fn().mockReturnThis(),
      };

      mockTable.create.mockReturnValue(mockBuilder);

      // Test method chaining with transaction
      // @ts-ignore
      const builder = repository.create(testData).withTransaction(mockTransaction);

      // Should be able to continue chaining after withTransaction
      expect(builder).toBe(mockBuilder);
      expect(mockBuilder.withTransaction).toHaveBeenCalledWith(mockTransaction);
    });
  });

  describe("create vs upsert transaction behavior", () => {
    it("should behave consistently between create and upsert for transactions", () => {
      const testData: TestEntity = {
        id: "consistency-test",
        name: "Consistency Test",
        type: "test",
        status: "active",
      };

      const mockCreateBuilder = {
        execute: vi.fn().mockResolvedValue(testData),
        withTransaction: vi.fn().mockReturnThis(),
      };

      const mockUpsertBuilder = {
        execute: vi.fn().mockResolvedValue(testData),
        withTransaction: vi.fn().mockReturnThis(),
      };

      mockTable.create.mockReturnValue(mockCreateBuilder);
      mockTable.put.mockReturnValue(mockUpsertBuilder);

      // Test create
      const createBuilder = repository.create(testData);
      // @ts-ignore
      createBuilder.withTransaction(mockTransaction);

      // Test upsert
      const upsertBuilder = repository.upsert(testData);
      // @ts-ignore
      upsertBuilder.withTransaction(mockTransaction);

      // Both should have complete data including keys after withTransaction is called
      // @ts-ignore
      expect(createBuilder.item).toEqual({
        ...testData,
        entityType: "TestEntity",
        pk: "TEST#consistency-test",
        sk: "METADATA#",
      });
      // @ts-ignore
      expect(upsertBuilder.item).toEqual({
        ...testData,
        entityType: "TestEntity",
        pk: "TEST#consistency-test",
        sk: "METADATA#",
      });

      // Both should successfully call withTransaction
      expect(mockCreateBuilder.withTransaction).toHaveBeenCalledWith(mockTransaction);
      expect(mockUpsertBuilder.withTransaction).toHaveBeenCalledWith(mockTransaction);
    });

    it("should demonstrate the fix - create now works like upsert for transactions", () => {
      const testData: TestEntity = {
        id: "fix-demo",
        name: "Fix Demo",
        type: "test",
        status: "active",
      };

      const mockCreateBuilder = {
        execute: vi.fn().mockResolvedValue(testData),
        withTransaction: vi.fn().mockReturnThis(),
        toDynamoCommand: vi.fn().mockReturnValue({
          tableName: "test-table",
          item: {
            ...testData,
            entityType: "TestEntity",
            pk: "TEST#fix-demo",
            sk: "METADATA#",
          },
        }),
      };

      const mockUpsertBuilder = {
        execute: vi.fn().mockResolvedValue(testData),
        withTransaction: vi.fn().mockReturnThis(),
        toDynamoCommand: vi.fn().mockReturnValue({
          tableName: "test-table",
          item: {
            ...testData,
            entityType: "TestEntity",
            pk: "TEST#fix-demo",
            sk: "METADATA#",
          },
        }),
      };

      mockTable.create.mockReturnValue(mockCreateBuilder);
      mockTable.put.mockReturnValue(mockUpsertBuilder);

      // Both create and upsert should work with transactions
      const createBuilder = repository.create(testData);
      const upsertBuilder = repository.upsert(testData);

      // Both should be able to call withTransaction without errors
      // @ts-ignore
      expect(() => createBuilder.withTransaction(mockTransaction)).not.toThrow();
      // @ts-ignore
      expect(() => upsertBuilder.withTransaction(mockTransaction)).not.toThrow();

      // Both should have complete data including keys after withTransaction is called
      // @ts-ignore
      expect(createBuilder.item).toEqual(
        expect.objectContaining({
          pk: "TEST#fix-demo",
          sk: "METADATA#",
          entityType: "TestEntity",
        }),
      );
      // @ts-ignore
      expect(upsertBuilder.item).toEqual(
        expect.objectContaining({
          pk: "TEST#fix-demo",
          sk: "METADATA#",
          entityType: "TestEntity",
        }),
      );

      // Both withTransaction calls should succeed
      expect(mockCreateBuilder.withTransaction).toHaveBeenCalledWith(mockTransaction);
      expect(mockUpsertBuilder.withTransaction).toHaveBeenCalledWith(mockTransaction);
    });
  });
});
