import { beforeEach, describe, expect, it, vi } from "vitest";
import { createIndex, defineEntity } from "../entity/entity";
import type { StandardSchemaV1 } from "../standard-schema";
import type { Table } from "../table";
import type { DynamoItem } from "../types";

interface TestEntity extends DynamoItem {
  id: string;
  name: string;
  status: string;
}

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

const testEntity = defineEntity({
  name: "TestEntity",
  schema: testSchema,
  primaryKey: createIndex()
    .input(primaryKeySchema)
    .partitionKey((item) => `TEST#${item.id}`)
    .sortKey(() => "METADATA"),
  queries: {},
});

describe("entity upsert", () => {
  let repository: ReturnType<typeof testEntity.createRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPutExecutor.mockImplementation(async (params: any) => {
      if (params.returnValues === "INPUT") {
        return params.item;
      }
      return undefined;
    });
    mockTable._getPutExecutor.mockReturnValue(mockPutExecutor);
    repository = testEntity.createRepository(mockTable as unknown as Table);
  });

  it("should return the validated item, not the underlying executor result", async () => {
    const testData: TestEntity & { id: string } = {
      id: "456",
      name: "Another Item",
      status: "inactive",
    };

    const result = await repository.upsert(testData).execute();

    // The result should be the validated + key-enriched item, not undefined
    expect(result).toBeDefined();
    expect(result).toMatchObject({
      id: "456",
      name: "Another Item",
      status: "inactive",
      pk: "TEST#456",
      sk: "METADATA",
    });
  });

  it("should include the entity type attribute in the returned item", async () => {
    const testData: TestEntity & { id: string } = {
      id: "789",
      name: "Entity Type Test",
      status: "active",
    };

    const result = await repository.upsert(testData).execute();

    // Default entity type attribute name is "entityType"
    expect(result).toHaveProperty("entityType", "TestEntity");
  });

  it("should call the underlying put executor exactly once", async () => {
    const testData: TestEntity & { id: string } = {
      id: "101",
      name: "Execution Count Test",
      status: "active",
    };

    await repository.upsert(testData).execute();

    expect(mockPutExecutor).toHaveBeenCalledTimes(1);
  });

  it("should throw a validation error when schema validation fails during upsert", () => {
    const failingSchema: StandardSchemaV1<TestEntity> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: vi.fn().mockReturnValue({
          issues: [{ message: "id is required" }],
        }) as unknown as (value: unknown) => { value: TestEntity } | { issues: Array<{ message: string }> },
      },
    };

    const failingEntity = defineEntity({
      name: "FailingEntity",
      schema: failingSchema,
      primaryKey: createIndex()
        .input(primaryKeySchema)
        .partitionKey((item) => `TEST#${item.id}`)
        .sortKey(() => "METADATA"),
      queries: {},
    });

    const failingRepo = failingEntity.createRepository(mockTable as unknown as Table);

    // Validation is now eager — throws at upsert() call time
    expect(() => failingRepo.upsert({ id: "", name: "Bad Item", status: "active" })).toThrow();
  });

  it("should send the item with returnValues INPUT to the executor", async () => {
    const testData: TestEntity & { id: string } = {
      id: "123",
      name: "Test",
      status: "active",
    };

    await repository.upsert(testData).execute();

    expect(mockPutExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        returnValues: "INPUT",
        item: expect.objectContaining({
          id: "123",
          entityType: "TestEntity",
          pk: "TEST#123",
          sk: "METADATA",
        }),
      }),
    );
  });
});
