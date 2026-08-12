import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { BatchBuilder, GetBuilder, QueryBuilder, ScanBuilder } from "../builders";
import type { BuilderContext } from "../builders/builder-types";
import { eq } from "../conditions";
import { createIndex, createQueries, defineEntity } from "../entity/entity";
import { EntityError, EntityValidationError, ErrorCodes } from "../errors";
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

function useRealQueryBuilders(): void {
  mockTable.scan.mockImplementation((context: BuilderContext = {}) => {
    const builder = new ScanBuilder<TestEntity>(async () => ({ items: [] }), context);
    vi.spyOn(builder, "filter");
    return builder;
  });
  mockTable.query.mockImplementation((_key, context: BuilderContext = {}) => {
    const builder = new QueryBuilder<TestEntity>(async () => ({ items: [] }), eq("pk", "TEST"), [], context);
    vi.spyOn(builder, "filter");
    return builder;
  });
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
      getById: queryBuilder.input(byIdInputSchema).query(({ input, entity }) => {
        return entity.get({ pk: `TEST#${input.id}`, sk: "METADATA#" });
      }),
      byIdClone: queryBuilder.input(byIdInputSchema).query(({ input, entity }) => {
        return entity.query({ pk: `TEST#${input.id}` }).clone();
      }),
      byStatusClone: queryBuilder.input(byStatusInputSchema).query(({ entity }) => {
        return entity.scan().clone();
      }),
    },
  });

  let repository: ReturnType<typeof entityRepository.createRepository>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    useRealQueryBuilders();

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
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(testData),
      };

      mockTable.create.mockReturnValue(mockBuilder);

      const result = await repository.create(testData).execute();

      // With deferred validation, create() is called with empty object initially
      expect(mockTable.create).toHaveBeenCalledWith({});
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
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(testData),
      };

      mockTable.create.mockReturnValue(mockBuilder);

      await repoWithTimestamps.create(testData).execute();

      // With deferred validation, create() is called with empty object initially
      // Timestamps are added during execute(), not during create()
      expect(mockTable.create).toHaveBeenCalledWith({});
    });

    it("should throw error on validation failure during execute", async () => {
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
        set: vi.fn().mockReturnThis(),
        execute: vi.fn(),
      };

      mockTable.create.mockReturnValue(mockBuilder);

      // With deferred validation, create() should not throw
      const builder = repository.create(testData);
      expect(mockTable.create).toHaveBeenCalledWith({});

      // Validation error should happen during execute()
      await expect(builder.execute()).rejects.toThrow(EntityValidationError);
    });
  });

  describe("create with deferred validation", () => {
    it("should defer validation and key generation until execute is called", async () => {
      const testData: TestEntity = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
        createdAt: "2024-01-01",
      };

      const mockBuilder = {
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(testData),
      };

      mockTable.create.mockReturnValue(mockBuilder);

      // Reset the mock to ensure clean state
      vi.clearAllMocks();

      // Create builder without immediate validation
      const builder = repository.create(testData);

      // Validation should NOT have been called during create()
      expect(testSchema["~standard"].validate).not.toHaveBeenCalled();

      // Table.create should be called with empty object
      expect(mockTable.create).toHaveBeenCalledWith({});

      // Execute should trigger validation and processing
      const result = await builder.execute();

      // NOW validation should have been called
      expect(testSchema["~standard"].validate).toHaveBeenCalledWith(testData);
      expect(result).toEqual(testData);
    });

    it("should throw validation error during execute, not during create", async () => {
      const testData: TestEntity = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
        createdAt: "2024-01-01",
      };

      const mockBuilder = {
        set: vi.fn().mockReturnThis(),
        execute: vi.fn(),
      };

      mockTable.create.mockReturnValue(mockBuilder);

      // Create should not fail even with bad validation setup
      const builder = repository.create(testData);

      // Should initially be called with empty object
      expect(mockTable.create).toHaveBeenCalledWith({});

      // Now mock validation failure
      (testSchema["~standard"].validate as Mock).mockImplementationOnce(() => ({
        issues: [{ message: "Validation failed" }],
      }));

      // execute() should fail with validation error
      await expect(builder.execute()).rejects.toThrow(EntityValidationError);
    });

    it("should add timestamps when configured and execute is called", async () => {
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
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(testData),
      };

      mockTable.create.mockReturnValue(mockBuilder);

      const builder = repoWithTimestamps.create(testData);

      // Should initially be called with empty object
      expect(mockTable.create).toHaveBeenCalledWith({});

      await builder.execute();

      // Verify that validation was called during execute
      expect(testSchema["~standard"].validate).toHaveBeenCalledWith(testData);
    });
  });

  describe("upsert with deferred validation", () => {
    it("should defer validation and key generation until execute is called", async () => {
      const testData: TestEntity = {
        id: "123",
        name: "Test Item",
        type: "test",
        status: "active",
      };

      const mockBuilder = {
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(testData),
      };

      mockTable.put.mockReturnValue(mockBuilder);

      // Create builder without immediate validation
      const builder = repository.upsert(testData);

      // Validation should NOT have been called during upsert()
      expect(testSchema["~standard"].validate).not.toHaveBeenCalled();

      // Table.put should be called with empty object
      expect(mockTable.put).toHaveBeenCalledWith({});

      // Execute should trigger validation and processing
      const result = await builder.execute();

      // NOW validation should have been called
      expect(testSchema["~standard"].validate).toHaveBeenCalledWith(testData);
      // Result is the enriched item (includes generated keys and entityType), not just the raw input
      expect(result).toMatchObject(testData);
    });

    it("should add timestamps when configured and execute is called", async () => {
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
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(testData),
      };

      mockTable.put.mockReturnValue(mockBuilder);

      const builder = repoWithTimestamps.upsert(testData);

      // Should initially be called with empty object
      expect(mockTable.put).toHaveBeenCalledWith({});

      await builder.execute();

      // Verify that validation was called during execute
      expect(testSchema["~standard"].validate).toHaveBeenCalledWith(testData);
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

      const builder = repository.query.byId(input);
      await builder.execute();

      expect(mockTable.query).toHaveBeenCalledWith(
        {
          pk: "TEST#123",
          sk: expect.any(Function),
        },
        expect.objectContaining({ beforeExecute: expect.any(Function) }),
      );
      expect(builder.filter).toHaveBeenCalledWith(eq("entityType", "TestEntity"));
      expect(byIdInputSchema["~standard"].validate).toHaveBeenCalledWith(input);
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

      if (!repository.query.byId) {
        throw new Error("Query byId is not defined");
      }

      await expect(repository.query.byId(input).execute()).rejects.toThrow(EntityValidationError);
    });

    it("validates scoped gets when their batch executes", async () => {
      const getExecutor = vi.fn().mockResolvedValue({ item: undefined });
      const batchGetExecutor = vi.fn().mockResolvedValue({ items: [], unprocessedKeys: [] });
      mockTable.get.mockImplementation(
        (key, context: BuilderContext = {}) => new GetBuilder(getExecutor, key, "TestTable", [], context),
      );
      (byIdInputSchema["~standard"].validate as Mock).mockImplementationOnce(() => ({
        issues: [{ message: "Invalid id" }],
      }));
      const batch = new BatchBuilder(vi.fn().mockResolvedValue({ unprocessedItems: [] }), batchGetExecutor, {
        partitionKey: "pk",
        sortKey: "sk",
      });

      repository.query.getById({ id: "bad", test: "test" }).withBatch(batch);

      await expect(batch.execute()).rejects.toThrow(EntityValidationError);
      expect(batchGetExecutor).not.toHaveBeenCalled();
    });

    it("accepts query and scan clones created from the scoped entity", async () => {
      await expect(repository.query.byIdClone({ id: "123", test: "test" }).execute()).resolves.toBeDefined();
      await expect(
        repository.query.byStatusClone({ status: "active", id: "123", test: "test" }).execute(),
      ).resolves.toBeDefined();
    });

    it("rejects a handler that returns an external builder", () => {
      const inputSchema: StandardSchemaV1<{ status: string }> = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: () => ({ issues: [{ message: "Invalid status" }] }),
        },
      };
      const externalExecutor = vi.fn(async () => ({ items: [] }));
      const externalBuilder = new ScanBuilder<TestEntity>(externalExecutor);
      const externalRepository = defineEntity({
        name: "ExternalBuilderEntity",
        schema: testSchema,
        primaryKey: createIndex()
          .input(primaryKeySchema)
          .partitionKey((item) => `TEST#${item.id}`)
          .sortKey(() => "METADATA#"),
        queries: {
          byStatus: createQueries<TestEntity>()
            .input(inputSchema)
            .query(() => externalBuilder),
        },
      }).createRepository(mockTable as unknown as Table);

      let thrown: unknown;
      try {
        externalRepository.query.byStatus({ status: "bad" });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(EntityError);
      expect(thrown).toMatchObject({
        code: ErrorCodes.INVALID_ENTITY_QUERY_BUILDER,
        context: { entityName: "ExternalBuilderEntity", queryName: "byStatus" },
      });
      expect(externalExecutor).not.toHaveBeenCalled();
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
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(testData),
      };

      mockTable.put.mockReturnValue(mockBuilder);

      const result = await repository.upsert(testData).execute();

      // With deferred validation, put() is called with empty object initially
      expect(mockTable.put).toHaveBeenCalledWith({});
      // Result is the enriched item (includes generated keys and entityType), not just the raw input
      expect(result).toMatchObject(testData);
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
        set: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(testData),
      };

      mockTable.put.mockReturnValue(mockBuilder);

      await repoWithTimestamps.upsert(testData).execute();

      // With deferred validation, put() is called with empty object initially
      // Timestamps are added during execute(), not during put()
      expect(mockTable.put).toHaveBeenCalledWith({});
    });
  });
});

describe("Entity Repository - Deferred Validation", () => {
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

  it("should validate and generate keys when execute() is called", async () => {
    const testData: TestEntity = {
      id: "123",
      name: "Test Item",
      type: "test",
      status: "active",
    };

    const mockBuilder = {
      set: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(testData),
    };

    mockTable.create.mockReturnValue(mockBuilder);

    const result = await repository.create(testData).execute();

    // With deferred validation, create() is called with empty object initially
    expect(mockTable.create).toHaveBeenCalledWith({});
    expect(result).toEqual(testData);
  });

  it("should validate and generate keys when withTransaction() is called", async () => {
    const testData: TestEntity = {
      id: "123",
      name: "Test Item",
      type: "test",
      status: "active",
    };

    const mockBuilder = {
      set: vi.fn().mockReturnThis(),
      withTransaction: vi.fn().mockReturnThis(),
    };

    mockTable.create.mockReturnValue(mockBuilder);

    // biome-ignore lint/suspicious/noExplicitAny: Test mock object
    await repository.create(testData).withTransaction({} as any);

    // With deferred validation, create() is called with empty object initially
    expect(mockTable.create).toHaveBeenCalledWith({});
  });

  it("should throw validation errors when execute() is called", async () => {
    const testData: TestEntity = {
      id: "123",
      name: "Test Item",
      type: "test",
      status: "active",
    };

    (testSchema["~standard"].validate as Mock).mockImplementationOnce(() => ({
      issues: [{ message: "Validation failed" }],
    }));

    const mockBuilder = {
      set: vi.fn().mockReturnThis(),
      execute: vi.fn(),
    };

    mockTable.create.mockReturnValue(mockBuilder);

    await expect(repository.create(testData).execute()).rejects.toThrow(EntityValidationError);
  });

  it("should throw validation errors when withTransaction() is called", () => {
    const testData: TestEntity = {
      id: "123",
      name: "Test Item",
      type: "test",
      status: "active",
    };

    const mockBuilder = {
      set: vi.fn().mockReturnThis(),
      withTransaction: vi.fn().mockReturnThis(),
    };

    mockTable.create.mockReturnValue(mockBuilder);

    // Reset mocks to ensure clean state
    vi.clearAllMocks();

    // Mock validation failure for this specific test
    (testSchema["~standard"].validate as Mock).mockImplementationOnce(() => ({
      issues: [{ message: "Validation failed" }],
    }));

    // withTransaction() throws synchronously, not asynchronously
    // biome-ignore lint/suspicious/noExplicitAny: Test mock object
    expect(() => repository.create(testData).withTransaction({} as any)).toThrow(EntityValidationError);
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
    useRealQueryBuilders();
    repository = entityWithChainedFilters.createRepository(mockTable as unknown as Table);
  });

  it("should chain filters with AND", async () => {
    const builder = repository.query.byStatusAndType({ status: "active", id: "123", test: "test" });
    await builder.execute();

    // Check that filters are applied in the correct order
    expect(builder.filter).toHaveBeenNthCalledWith(1, eq("entityType", "TestEntity"));
    expect(builder.filter).toHaveBeenNthCalledWith(2, eq("status", "active"));
    expect(builder.filter).toHaveBeenNthCalledWith(3, eq("type", "test"));
  });

  it("should chain complex filters with AND/OR combinations", async () => {
    const builder = repository.query.byComplexFilters({ status: "active", id: "123", test: "test" });
    await builder.execute();

    // Check that filters are applied in the correct order
    expect(builder.filter).toHaveBeenNthCalledWith(1, eq("entityType", "TestEntity"));
    expect(builder.filter).toHaveBeenNthCalledWith(2, eq("status", "active"));
    expect(builder.filter).toHaveBeenNthCalledWith(3, expect.any(Function)); // OR condition
    expect(builder.filter).toHaveBeenNthCalledWith(4, expect.any(Function)); // GT condition
  });

  it("should chain filters on query builders", async () => {
    const builder = repository.query.byQueryWithMultipleFilters({ status: "active", id: "123", test: "test" });
    await builder.execute();

    expect(mockTable.query).toHaveBeenCalledWith(
      {
        pk: "TEST#123",
        sk: expect.any(Function),
      },
      expect.objectContaining({ beforeExecute: expect.any(Function) }),
    );

    expect(builder.filter).toHaveBeenNthCalledWith(1, eq("entityType", "TestEntity"));
    expect(builder.filter).toHaveBeenNthCalledWith(2, eq("status", "active"));
    expect(builder.filter).toHaveBeenNthCalledWith(3, eq("type", "test"));
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

    const builder = repo.query.byStatus({ status: "active", id: "123", test: "test" });
    await builder.execute();

    // Check that filters are applied in the correct order
    expect(builder.filter).toHaveBeenNthCalledWith(1, eq("entityType", "TestEntitySingle"));
    expect(builder.filter).toHaveBeenNthCalledWith(2, eq("status", "active"));
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
            // Apply a filter in the query definition
            return entity.scan().filter(eq("status", input.status)); // This is "active" from the input
          }),
      },
    });

    const repo = entityWithPreAppliedFilters.createRepository(mockTable as unknown as Table);

    // Apply another filter when executing the query
    const builder = repo.query.activeItems({ status: "active", id: "123", test: "test" }).filter(eq("type", "test"));
    await builder.execute();

    expect(builder.filter).toHaveBeenCalledTimes(3);
    expect(builder.filter).toHaveBeenNthCalledWith(1, eq("entityType", "TestEntityWithFilters"));
    expect(builder.filter).toHaveBeenNthCalledWith(2, eq("status", "active"));
    expect(builder.filter).toHaveBeenNthCalledWith(3, eq("type", "test"));
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
            // Apply a filter in the query definition
            return entity.query({ pk: `TEST#${input.id}` }).filter(eq("status", input.status)); // This is "active" from the input
          }),
      },
    });

    const repo = entityWithPreAppliedQueryFilters.createRepository(mockTable as unknown as Table);

    // Apply another filter when executing the query
    const builder = repo.query.itemsByStatus({ status: "active", id: "123", test: "test" }).filter(eq("type", "test"));
    await builder.execute();

    expect(mockTable.query).toHaveBeenCalledWith(
      {
        pk: "TEST#123",
      },
      expect.objectContaining({ beforeExecute: expect.any(Function) }),
    );

    expect(builder.filter).toHaveBeenCalledTimes(3);
    expect(builder.filter).toHaveBeenNthCalledWith(1, eq("entityType", "TestEntityWithQueryFilters"));
    expect(builder.filter).toHaveBeenNthCalledWith(2, eq("status", "active"));
    expect(builder.filter).toHaveBeenNthCalledWith(3, eq("type", "test"));
  });
});
