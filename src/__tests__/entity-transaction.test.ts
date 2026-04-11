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

const mockPutExecutor = vi.fn();

// Create a mock table
const mockTable = {
  _getPutExecutor: vi.fn().mockReturnValue(mockPutExecutor),
  _getGetExecutor: vi.fn(),
  _getUpdateExecutor: vi.fn(),
  _getDeleteExecutor: vi.fn(),
  getIndexAttributeNames: vi.fn().mockReturnValue([]),
  tableName: "TestTable",
  partitionKey: "pk",
  sortKey: "sk",
  gsis: {},
  scan: vi.fn(),
  query: vi.fn(),
};

// Mock transaction builder
const mockTransaction = {
  putWithCommand: vi.fn(),
  updateWithCommand: vi.fn(),
  deleteWithCommand: vi.fn(),
  execute: vi.fn(),
};

function getLastTransactionPutItem<T extends DynamoItem>(): T {
  return mockTransaction.putWithCommand.mock.calls.at(-1)?.[0].item as T;
}

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
    vi.clearAllMocks();
    mockPutExecutor.mockImplementation(async (params: any) => {
      if (params.returnValues === "INPUT") return params.item;
      return undefined;
    });
    mockTable._getPutExecutor.mockReturnValue(mockPutExecutor);
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

      // create() now validates and prepares eagerly
      const builder = repository.create(testData);
      // @ts-expect-error
      builder.withTransaction(mockTransaction);

      // The item is already prepared at create() time — keys + entityType present
      expect(getLastTransactionPutItem<TestEntity>()).toEqual({
        ...testData,
        entityType: "TestEntity",
        pk: "TEST#123",
        sk: "METADATA#",
      });
    });

    it("should include timestamps in transaction when configured", () => {
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

      const builder = repoWithTimestamps.create(testData);
      // @ts-expect-error
      builder.withTransaction(mockTransaction);

      expect(getLastTransactionPutItem<TestEntity>()).toEqual({
        ...testData,
        entityType: "TestEntityWithTimestamps",
        pk: "TEST#123",
        sk: "METADATA#",
        createdAt: expect.any(String),
        modifiedAt: expect.any(Number),
      });
    });

    it("should have keys already generated when create() is called", () => {
      const testData: TestEntity = {
        id: "456",
        name: "Another Item",
        type: "test",
        status: "pending",
      };

      // With eager preparation, keys are generated at create() time
      const builder = repository.create(testData);

      // Keys are already in the builder's item
      // @ts-expect-error
      expect(builder.item).toHaveProperty("pk", "TEST#456");
      // @ts-expect-error
      expect(builder.item).toHaveProperty("sk", "METADATA#");

      // @ts-expect-error
      builder.withTransaction(mockTransaction);

      expect(getLastTransactionPutItem<TestEntity>()).toEqual({
        ...testData,
        entityType: "TestEntity",
        pk: "TEST#456",
        sk: "METADATA#",
      });
    });

    it("should work with complex primary keys", () => {
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

      const builder = complexRepo.create(testData);
      // @ts-expect-error
      builder.withTransaction(mockTransaction);

      expect(getLastTransactionPutItem<TestEntity>()).toEqual({
        ...testData,
        entityType: "ComplexEntity",
        pk: "USER#789",
        sk: "premium#active",
      });
    });

    it("should handle entities without sort key", () => {
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

      const builder = simpleRepo.create(testData);
      // @ts-expect-error
      builder.withTransaction(mockTransaction);

      expect(getLastTransactionPutItem<TestEntity>()).toEqual({
        ...testData,
        entityType: "SimpleEntity",
        pk: "SIMPLE#999",
      });
    });

    it("should generate secondary index keys for transactions", () => {
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

      const builder = repoWithGSI.create(testData);
      // @ts-expect-error
      builder.withTransaction(mockTransaction);

      expect(getLastTransactionPutItem<TestEntity>()).toEqual({
        ...testData,
        entityType: "EntityWithGSI",
        pk: "MAIN#gsi-test",
        sk: "ITEM#",
        gsi1pk: "STATUS#active",
        gsi1sk: "TYPE#premium",
        gsi2pk: "TYPE#premium",
      });
    });

    it("should preserve builder chaining with transactions", () => {
      const testData: TestEntity = {
        id: "chain-test",
        name: "Chain Test",
        type: "test",
        status: "active",
      };

      const entityBuilder = repository.create(testData);
      // @ts-expect-error
      const builder = entityBuilder.withTransaction(mockTransaction);

      // withTransaction returns `this` — the same builder
      expect(builder).toBe(entityBuilder);
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

      // Both create and upsert return EntityAwarePutBuilders with the item already prepared
      const createBuilder = repository.create(testData);
      const upsertBuilder = repository.upsert(testData);

      // @ts-expect-error
      createBuilder.withTransaction(mockTransaction);
      // @ts-expect-error
      upsertBuilder.withTransaction(mockTransaction);

      expect(mockTransaction.putWithCommand.mock.calls[0]![0].item).toEqual({
        ...testData,
        entityType: "TestEntity",
        pk: "TEST#consistency-test",
        sk: "METADATA#",
      });
      expect(mockTransaction.putWithCommand.mock.calls[1]![0].item).toEqual({
        ...testData,
        entityType: "TestEntity",
        pk: "TEST#consistency-test",
        sk: "METADATA#",
      });
    });

    it("should demonstrate that both create and upsert work with transactions", () => {
      const testData: TestEntity = {
        id: "fix-demo",
        name: "Fix Demo",
        type: "test",
        status: "active",
      };

      const createBuilder = repository.create(testData);
      const upsertBuilder = repository.upsert(testData);

      // Both should be able to call withTransaction without errors
      // @ts-expect-error
      expect(() => createBuilder.withTransaction(mockTransaction)).not.toThrow();
      // @ts-expect-error
      expect(() => upsertBuilder.withTransaction(mockTransaction)).not.toThrow();

      expect(mockTransaction.putWithCommand.mock.calls[0]![0].item).toEqual(
        expect.objectContaining({
          pk: "TEST#fix-demo",
          sk: "METADATA#",
          entityType: "TestEntity",
        }),
      );
      expect(mockTransaction.putWithCommand.mock.calls[1]![0].item).toEqual(
        expect.objectContaining({
          pk: "TEST#fix-demo",
          sk: "METADATA#",
          entityType: "TestEntity",
        }),
      );
    });
  });
});
