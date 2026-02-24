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
    repository = testEntity.createRepository(mockTable as unknown as Table);
  });

  it("should return the validated item, not the underlying executor result", async () => {
    const mockBuilder = {
      execute: vi.fn().mockResolvedValue(undefined), // Simulates returnValues: "NONE"
    };

    mockTable.put.mockReturnValue(mockBuilder);

    const testData: TestEntity & { id: string } = {
      id: "456",
      name: "Another Item",
      status: "inactive",
    };

    const builder = repository.upsert(testData);
    const result = await builder.execute();

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
    const mockBuilder = {
      execute: vi.fn().mockResolvedValue(undefined),
    };

    mockTable.put.mockReturnValue(mockBuilder);

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
    // Capture the spy before upsert() wraps builder.execute
    const originalExecuteSpy = vi.fn().mockResolvedValue(undefined);
    const mockBuilder = {
      execute: originalExecuteSpy,
    };

    mockTable.put.mockReturnValue(mockBuilder);

    const testData: TestEntity & { id: string } = {
      id: "101",
      name: "Execution Count Test",
      status: "active",
    };

    // upsert() replaces builder.execute with a wrapper that calls originalExecuteSpy internally
    await repository.upsert(testData).execute();

    expect(originalExecuteSpy).toHaveBeenCalledTimes(1);
  });

  it("should throw a validation error when schema validation fails", async () => {
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

    const mockBuilder = {
      execute: vi.fn().mockResolvedValue(undefined),
    };
    mockTable.put.mockReturnValue(mockBuilder);

    const failingRepo = failingEntity.createRepository(mockTable as unknown as Table);

    await expect(
      failingRepo.upsert({ id: "", name: "Bad Item", status: "active" }).execute(),
    ).rejects.toThrow();
  });
});
