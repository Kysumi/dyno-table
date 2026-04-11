import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { ScanBuilder } from "../builders/scan-builder";
import { QueryBuilder } from "../builders/query-builder";
import {
  EntityAwareDeleteBuilder,
  EntityAwareGetBuilder,
  EntityAwarePutBuilder,
} from "../builders/entity-aware-builders";
import { eq } from "../conditions";
import { createIndex, createQueries, defineEntity } from "../entity/entity";
import { EntityValidationError } from "../errors";
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

// Mock executors
const mockPutExecutor = vi.fn();
const mockGetExecutor = vi.fn();
const mockUpdateExecutor = vi.fn();
const mockDeleteExecutor = vi.fn();

// Create a mock table — scan/query still called directly, CRUD uses executor getters
const mockTable = {
  getPutExecutor: vi.fn().mockReturnValue(mockPutExecutor),
  getGetExecutor: vi.fn().mockReturnValue(mockGetExecutor),
  getUpdateExecutor: vi.fn().mockReturnValue(mockUpdateExecutor),
  getDeleteExecutor: vi.fn().mockReturnValue(mockDeleteExecutor),
  getIndexAttributeNames: vi.fn().mockReturnValue([]),
  scan: vi.fn(),
  query: vi.fn(),
  tableName: "TestTable",
  partitionKey: "pk",
  sortKey: "sk",
  gsis: {},
};

const queryBuilder = createQueries<TestEntity>();

function createMockScanBuilder<T extends DynamoItem>(results?: T[]) {
  const executor = vi.fn().mockImplementation(async () => ({ items: results ?? [], lastEvaluatedKey: undefined }));
  const builder = new ScanBuilder<T>(executor);
  vi.spyOn(builder, "filter");
  vi.spyOn(builder, "execute");
  return builder;
}

function createMockQueryBuilder<T extends DynamoItem>(results?: T[]) {
  const executor = vi.fn().mockImplementation(async () => ({ items: results ?? [], lastEvaluatedKey: undefined }));
  const builder = new QueryBuilder<T>(executor, { type: "eq", attr: "pk", value: "mock-pk" });
  vi.spyOn(builder, "filter");
  vi.spyOn(builder, "execute");
  return builder;
}

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
    vi.clearAllMocks();
    mockPutExecutor.mockImplementation(async (params: any) => {
      if (params.returnValues === "INPUT") return params.item;
      return undefined;
    });
    mockGetExecutor.mockResolvedValue({ item: undefined });
    mockUpdateExecutor.mockResolvedValue({ item: undefined });
    mockDeleteExecutor.mockResolvedValue({});
    mockTable.getPutExecutor.mockReturnValue(mockPutExecutor);
    mockTable.getGetExecutor.mockReturnValue(mockGetExecutor);
    mockTable.getUpdateExecutor.mockReturnValue(mockUpdateExecutor);
    mockTable.getDeleteExecutor.mockReturnValue(mockDeleteExecutor);

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

      const result = await repository.create(testData).execute();

      // With eager validation, create() immediately prepares the item
      expect(mockTable.getPutExecutor).toHaveBeenCalled();
      expect(result).toMatchObject({
        ...testData,
        entityType: "TestEntity",
        pk: "TEST#123",
        sk: "METADATA#",
      });
    });

    it("should add timestamps when configured", async () => {
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

      const result = await repoWithTimestamps.create(testData).execute();

      // Timestamps are added eagerly at create() time
      expect(result).toHaveProperty("createdAt");
      expect(result).toHaveProperty("modifiedAt");
    });

    it("should throw error on validation failure during create", () => {
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

      // With eager validation, create() throws immediately
      expect(() => repository.create(testData)).toThrow(EntityValidationError);
    });
  });

  describe("create with eager validation", () => {
    it("should validate and generate keys when create() is called", async () => {
      const testData: TestEntity = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
      };

      // Reset mock to track calls
      vi.clearAllMocks();
      mockPutExecutor.mockImplementation(async (params: any) => {
        if (params.returnValues === "INPUT") return params.item;
        return undefined;
      });
      mockTable.getPutExecutor.mockReturnValue(mockPutExecutor);

      // create() triggers validation immediately
      const builder = repository.create(testData);

      // Validation should have been called during create()
      expect(testSchema["~standard"].validate).toHaveBeenCalledWith(testData);

      // Execute the builder
      const result = await builder.execute();

      expect(result).toMatchObject({
        ...testData,
        entityType: "TestEntity",
        pk: "TEST#123",
        sk: "METADATA#",
      });
    });

    it("should throw validation error during create, not during execute", () => {
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

      // Validation is eager — throws at create() call time
      expect(() => repository.create(testData)).toThrow(EntityValidationError);
    });

    it("should have the item prepared when withTransaction is called", () => {
      const testData: TestEntity = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
        createdAt: "2024-01-01",
      };

      const mockTxn = { putWithCommand: vi.fn() };
      const builder = repository.create(testData);

      // @ts-expect-error - test double
      builder.withTransaction(mockTxn);

      // Item should be fully prepared
      expect(mockTxn.putWithCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          item: expect.objectContaining({
            entityType: "TestEntity",
            pk: "TEST#123",
            sk: "METADATA#",
          }),
        }),
      );
    });
  });

  describe("upsert with eager validation", () => {
    it("should validate and generate keys when upsert() is called", async () => {
      const testData: TestEntity = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
      };

      vi.clearAllMocks();
      mockPutExecutor.mockImplementation(async (params: any) => {
        if (params.returnValues === "INPUT") return params.item;
        return undefined;
      });
      mockTable.getPutExecutor.mockReturnValue(mockPutExecutor);

      // upsert() triggers validation immediately
      repository.upsert(testData);

      // Validation should have been called during upsert()
      expect(testSchema["~standard"].validate).toHaveBeenCalledWith(testData);
    });

    it("should throw validation error during upsert, not during execute", () => {
      const testData: TestEntity = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
      };

      (testSchema["~standard"].validate as Mock).mockImplementationOnce(() => ({
        issues: [{ message: "Validation failed" }],
      }));

      // Validation is eager — throws at upsert() call time
      expect(() => repository.upsert(testData)).toThrow(EntityValidationError);
    });

    it("should add timestamps when configured at upsert() time", async () => {
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

      const result = await repoWithTimestamps.upsert(testData).execute();

      // Timestamps added at upsert() time
      expect(result).toHaveProperty("createdAt");
      expect(result).toHaveProperty("modifiedAt");
    });
  });

  describe("get", () => {
    it("should get an item with correct key transformation", async () => {
      const key = {
        id: "123",
        type: "test",
      };

      mockGetExecutor.mockResolvedValue({ item: { id: "123", type: "test" } });

      await repository.get(key).execute();

      // Verify executor was called with the transformed key
      expect(mockTable.getGetExecutor).toHaveBeenCalledWith({
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

      const builder = repository.update(key, updateData);

      expect(mockTable.getUpdateExecutor).toHaveBeenCalledWith({
        pk: "TEST#123",
        sk: "METADATA#",
      });

      const { readable } = builder.debug();
      expect(readable.conditionExpression).toBe('entityType = "TestEntity"');
      expect(readable.updateExpression).toContain('name = "Updated Name"');
    });

    it("should add updatedAt timestamp when configured", () => {
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

      const key = { id: "123" };
      const updateData = { name: "Updated Name" };

      const builder = repoWithTimestamps.update(key, updateData);
      const { readable } = builder.debug();

      // Verify that only updatedAt timestamp was added (not createdAt)
      expect(readable.updateExpression).toContain('name = "Updated Name"');
      expect(readable.updateExpression).toContain("modifiedAt");
      expect(readable.updateExpression).not.toContain("createdAt");
    });
  });

  describe("delete", () => {
    it("should delete an item with entity type condition", async () => {
      const key = {
        id: "123",
        type: "test",
      };

      mockDeleteExecutor.mockResolvedValue({});

      await repository.delete(key).execute();

      expect(mockTable.getDeleteExecutor).toHaveBeenCalledWith({
        pk: "TEST#123",
        sk: "METADATA#",
      });
    });
  });

  describe("scan", () => {
    it("should scan with entity type filter", async () => {
      const mockBuilder = createMockScanBuilder([{ id: "1", type: "test" } as TestEntity]);

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

      const mockBuilder = createMockQueryBuilder();

      mockTable.query.mockReturnValue(mockBuilder);

      await repository.query.byId(input).execute();

      expect(mockTable.query).toHaveBeenCalledWith({
        pk: "TEST#123",
        sk: expect.any(Function),
      });
      expect(mockBuilder.filter).toHaveBeenCalledWith(eq("entityType", "TestEntity"));
    });

    it("should throw error on query input validation failure", () => {
      const input = {
        id: "123",
        test: "test-value",
        name: "Test Item",
        type: "test",
        status: "active",
        createdAt: "2024-01-01",
      };

      (byIdInputSchema["~standard"].validate as Mock).mockImplementationOnce(() => ({
        issues: [{ message: "Validation failed" }],
      }));

      const mockBuilder = createMockQueryBuilder();

      mockTable.query.mockReturnValue(mockBuilder);

      if (!repository.query.byId) {
        throw new Error("Query byId is not defined");
      }

      expect(() => repository.query.byId(input)).toThrow(EntityValidationError);
    });
  });

  describe("custom entity type column name", () => {
    it("should use custom entity type column name in constraints", () => {
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

      const customRepository = customEntityRepository.createRepository(mockTable as unknown as Table);

      const key = { id: "123" };
      const updateData = { name: "Updated Name" };

      const builder = customRepository.update(key, updateData);
      const { readable } = builder.debug();

      expect(readable.conditionExpression).toBe('customEntityType = "CustomEntity"');
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

      const result = await repository.upsert(testData).execute();

      // Result is the enriched item (includes generated keys and entityType)
      expect(result).toMatchObject(testData);
      expect(result).toHaveProperty("entityType", "TestEntity");
      expect(result).toHaveProperty("pk", "TEST#123");
    });

    it("should add timestamps when configured", async () => {
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

      const result = await repoWithTimestamps.upsert(testData).execute();

      // Timestamps are added at upsert() call time
      expect(result).toHaveProperty("createdAt");
      expect(result).toHaveProperty("modifiedAt");
    });
  });
});

describe("Entity Repository - Eager Validation", () => {
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
    mockTable.getPutExecutor.mockReturnValue(mockPutExecutor);
    repository = entityRepository.createRepository(mockTable as unknown as Table);
  });

  it("should validate and generate keys when create() is called", async () => {
    const testData: TestEntity = {
      id: "123",
      name: "Test Item",
      type: "test",
      status: "active",
    };

    // create() immediately validates and prepares item
    const builder = repository.create(testData);
    expect(testSchema["~standard"].validate).toHaveBeenCalledWith(testData);

    const result = await builder.execute();

    expect(result).toMatchObject({
      ...testData,
      entityType: "TestEntity",
      pk: "TEST#123",
      sk: "METADATA#",
    });
  });

  it("should generate keys when withTransaction() is called", () => {
    const testData: TestEntity = {
      id: "123",
      name: "Test Item",
      type: "test",
      status: "active",
    };

    const mockTxn = { putWithCommand: vi.fn() };
    const builder = repository.create(testData);

    // @ts-expect-error
    builder.withTransaction(mockTxn);

    expect(mockTxn.putWithCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({
          entityType: "TestEntity",
          pk: "TEST#123",
          sk: "METADATA#",
        }),
      }),
    );
  });

  it("should throw validation errors when create() is called", () => {
    const testData: TestEntity = {
      id: "123",
      name: "Test Item",
      type: "test",
      status: "active",
    };

    (testSchema["~standard"].validate as Mock).mockImplementationOnce(() => ({
      issues: [{ message: "Validation failed" }],
    }));

    expect(() => repository.create(testData)).toThrow(EntityValidationError);
  });

  it("should throw validation errors when withTransaction() is called via create", () => {
    const testData: TestEntity = {
      id: "123",
      name: "Test Item",
      type: "test",
      status: "active",
    };

    (testSchema["~standard"].validate as Mock).mockImplementationOnce(() => ({
      issues: [{ message: "Validation failed" }],
    }));

    // Validation is eager — throws at create() call time, before withTransaction
    expect(() => repository.create(testData)).toThrow(EntityValidationError);
  });
});

describe("createQuery with chained filters", () => {
  const entityWithChainedFilters = defineEntity({
    name: "TestEntity",
    schema: testSchema,
    primaryKey: createIndex()
      .input(primaryKeySchema)
      .partitionKey((item) => `TEST#${item.id}`)
      .sortKey(() => "METADATA#"),
    queries: {
      byStatusAndType: createQueries<TestEntity>()
        .input(byStatusInputSchema)
        .query(({ input, entity }) => {
          return entity.scan().filter(eq("status", input.status)).filter(eq("type", "test"));
        }),
      byComplexFilters: createQueries<TestEntity>()
        .input(byStatusInputSchema)
        .query(({ input, entity }) => {
          return entity
            .scan()
            .filter(eq("status", input.status))
            .filter((op) => op.or(op.eq("type", "test"), op.eq("type", "test2")))
            .filter((op) => op.gt("createdAt", "2023-01-01"));
        }),
      byQueryWithMultipleFilters: createQueries<TestEntity>()
        .input(byStatusInputSchema)
        .query(({ input, entity }) => {
          return entity
            .query({
              pk: `TEST#${input.id}`,
              sk: (op) => op.beginsWith("METADATA#"),
            })
            .filter(eq("status", input.status))
            .filter(eq("type", "test"));
        }),
    },
  });

  let repository: ReturnType<typeof entityWithChainedFilters.createRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPutExecutor.mockImplementation(async (params: any) => {
      if (params.returnValues === "INPUT") return params.item;
      return undefined;
    });
    mockTable.getPutExecutor.mockReturnValue(mockPutExecutor);
    repository = entityWithChainedFilters.createRepository(mockTable as unknown as Table);
  });

  it("should chain filters with AND", async () => {
    const mockBuilder = createMockScanBuilder();

    mockTable.scan.mockReturnValue(mockBuilder);

    await repository.query.byStatusAndType({ status: "active", id: "123", test: "test" }).execute();

    // Check that filters are applied in the correct order
    expect(mockBuilder.filter).toHaveBeenNthCalledWith(1, eq("entityType", "TestEntity"));
    expect(mockBuilder.filter).toHaveBeenNthCalledWith(2, eq("status", "active"));
    expect(mockBuilder.filter).toHaveBeenNthCalledWith(3, eq("type", "test"));
  });

  it("should chain complex filters with AND/OR combinations", async () => {
    const mockBuilder = createMockScanBuilder();

    mockTable.scan.mockReturnValue(mockBuilder);

    await repository.query.byComplexFilters({ status: "active", id: "123", test: "test" }).execute();

    // Check that filters are applied in the correct order
    expect(mockBuilder.filter).toHaveBeenNthCalledWith(1, eq("entityType", "TestEntity"));
    expect(mockBuilder.filter).toHaveBeenNthCalledWith(2, eq("status", "active"));
    expect(mockBuilder.filter).toHaveBeenNthCalledWith(3, expect.any(Function)); // OR condition
    expect(mockBuilder.filter).toHaveBeenNthCalledWith(4, expect.any(Function)); // GT condition
  });

  it("should chain filters on query builders", async () => {
    const mockBuilder = createMockQueryBuilder();

    mockTable.query.mockReturnValue(mockBuilder);

    await repository.query.byQueryWithMultipleFilters({ status: "active", id: "123", test: "test" }).execute();

    expect(mockTable.query).toHaveBeenCalledWith({
      pk: "TEST#123",
      sk: expect.any(Function),
    });

    // For query builders, entity type filter is applied first, then user filters
    expect(mockBuilder.filter).toHaveBeenNthCalledWith(1, eq("entityType", "TestEntity"));
    expect(mockBuilder.filter).toHaveBeenNthCalledWith(2, eq("status", "active"));
    expect(mockBuilder.filter).toHaveBeenNthCalledWith(3, eq("type", "test"));
  });

  it("should handle single filter correctly", async () => {
    const entityWithSingleFilter = defineEntity({
      name: "TestEntitySingle",
      schema: testSchema,
      primaryKey: createIndex()
        .input(primaryKeySchema)
        .partitionKey((item) => `TEST#${item.id}`)
        .sortKey(() => "METADATA#"),
      queries: {
        byStatus: createQueries<TestEntity>()
          .input(byStatusInputSchema)
          .query(({ input, entity }) => {
            return entity.scan().filter(eq("status", input.status));
          }),
      },
    });

    const repo = entityWithSingleFilter.createRepository(mockTable as unknown as Table);

    const mockBuilder = createMockScanBuilder();

    mockTable.scan.mockReturnValue(mockBuilder);

    await repo.query.byStatus({ status: "active", id: "123", test: "test" }).execute();

    // Check that filters are applied in the correct order
    expect(mockBuilder.filter).toHaveBeenNthCalledWith(1, eq("entityType", "TestEntitySingle"));
    expect(mockBuilder.filter).toHaveBeenNthCalledWith(2, eq("status", "active"));
  });

  it("should apply both createQuery filters and execution-time filters", async () => {
    const entityWithPreAppliedFilters = defineEntity({
      name: "TestEntityWithFilters",
      schema: testSchema,
      primaryKey: createIndex()
        .input(primaryKeySchema)
        .partitionKey((item) => `TEST#${item.id}`)
        .sortKey(() => "METADATA#"),
      queries: {
        activeItems: createQueries<TestEntity>()
          .input(byStatusInputSchema)
          .query(({ input, entity }) => {
            return entity.scan().filter(eq("status", input.status));
          }),
      },
    });

    const repo = entityWithPreAppliedFilters.createRepository(mockTable as unknown as Table);

    const mockBuilder = createMockScanBuilder();

    mockTable.scan.mockReturnValue(mockBuilder);

    await repo.query.activeItems({ status: "active", id: "123", test: "test" }).filter(eq("type", "test")).execute();

    // Check that all filters are applied in the correct order:
    // 1. Entity type filter (applied by scan())
    // 2. Pre-applied filter from createQuery (status = "active")
    // 3. Execution-time filter (type = "test")
    expect(mockBuilder.filter).toHaveBeenCalledTimes(3);
    expect(mockBuilder.filter).toHaveBeenNthCalledWith(1, eq("entityType", "TestEntityWithFilters"));
    expect(mockBuilder.filter).toHaveBeenNthCalledWith(2, eq("status", "active"));
    expect(mockBuilder.filter).toHaveBeenNthCalledWith(3, eq("type", "test"));
  });

  it("should apply both createQuery filters and execution-time filters on query builders", async () => {
    const entityWithPreAppliedQueryFilters = defineEntity({
      name: "TestEntityWithQueryFilters",
      schema: testSchema,
      primaryKey: createIndex()
        .input(primaryKeySchema)
        .partitionKey((item) => `TEST#${item.id}`)
        .sortKey(() => "METADATA#"),
      queries: {
        itemsByStatus: createQueries<TestEntity>()
          .input(byStatusInputSchema)
          .query(({ input, entity }) => {
            return entity.query({ pk: `TEST#${input.id}` }).filter(eq("status", input.status));
          }),
      },
    });

    const repo = entityWithPreAppliedQueryFilters.createRepository(mockTable as unknown as Table);

    const mockBuilder = createMockQueryBuilder();

    mockTable.query.mockReturnValue(mockBuilder);

    await repo.query.itemsByStatus({ status: "active", id: "123", test: "test" }).filter(eq("type", "test")).execute();

    expect(mockTable.query).toHaveBeenCalledWith({
      pk: "TEST#123",
    });

    // Check that all filters are applied in the correct order:
    // 1. Entity type filter (applied by query())
    // 2. Pre-applied filter from createQuery (status = "active")
    // 3. Execution-time filter (type = "test")
    expect(mockBuilder.filter).toHaveBeenCalledTimes(3);
    expect(mockBuilder.filter).toHaveBeenNthCalledWith(1, eq("entityType", "TestEntityWithQueryFilters"));
    expect(mockBuilder.filter).toHaveBeenNthCalledWith(2, eq("status", "active"));
    expect(mockBuilder.filter).toHaveBeenNthCalledWith(3, eq("type", "test"));
  });
});
