import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { Entity } from "../entity-class";
import type { EntityLifecycleHooks } from "../entity-class";
import type { Table } from "../../table";
import type { EntityDefinition } from "../types";
import type { StandardSchemaV1 } from "../../standard-schema";

// Test entity type
type TestEntity = {
  id: string;
  name: string;
  age: number;
};

describe("Entity", () => {
  let entity: Entity<TestEntity, Record<string, never>>;
  let definition: EntityDefinition<TestEntity>;
  let hooks: EntityLifecycleHooks<TestEntity>;

  beforeEach(() => {
    // Setup test entity definition
    definition = {
      name: "test-entity",
      primaryKey: {
        partitionKey: () => "test-pk",
        sortKey: () => "test-sk",
      },
      schema: {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (value: unknown) => ({ value: value as TestEntity }),
        },
      },
    };

    // Setup test hooks
    hooks = {
      beforeCreate: vi.fn().mockImplementation((data) => data),
      afterCreate: vi.fn().mockImplementation((data) => data),
      beforeUpdate: vi.fn().mockImplementation((data) => data),
      afterUpdate: vi.fn().mockImplementation((data) => data),
      beforeDelete: vi.fn().mockImplementation((key) => key),
      afterDelete: vi.fn().mockImplementation((key) => key),
      beforeGet: vi.fn().mockImplementation((key) => key),
      afterGet: vi.fn().mockImplementation((data) => data),
    };

    entity = new Entity(definition, hooks);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("createRepository", () => {
    test("creates a repository with all CRUD operations", () => {
      const mockTable = {
        put: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        get: vi.fn(),
        query: vi.fn(),
      } as unknown as Table;

      const repository = entity.createRepository(mockTable);

      expect(repository).toMatchObject({
        create: expect.any(Function),
        update: expect.any(Function),
        delete: expect.any(Function),
        get: expect.any(Function),
        query: expect.any(Object),
      });
    });
  });

  describe("create", () => {
    test("executes beforeCreate hook and adds entity metadata", async () => {
      const mockTable = {
        put: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(undefined),
      } as unknown as Table;

      const testData = { id: "1", name: "Test", age: 25 };
      const repository = entity.createRepository(mockTable);

      await repository.create(testData);

      expect(hooks.beforeCreate).toHaveBeenCalledWith(testData);
      expect(mockTable.put).toHaveBeenCalledWith({
        ...testData,
        pk: "test-pk",
        sk: "test-sk",
        entityType: "test-entity",
      });
    });

    test("executes afterCreate hook with the created item", async () => {
      const mockTable = {
        put: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(undefined),
      } as unknown as Table;

      const testData = { id: "1", name: "Test", age: 25 };
      const repository = entity.createRepository(mockTable);

      await repository.create(testData);

      expect(hooks.afterCreate).toHaveBeenCalledWith({
        ...testData,
        pk: "test-pk",
        sk: "test-sk",
        entityType: "test-entity",
      });
    });
  });

  describe("update", () => {
    test("executes beforeUpdate hook and updates the item", async () => {
      const mockTable = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnThis(),
          execute: vi.fn().mockResolvedValue({ item: null }),
        }),
      } as unknown as Table;

      const testData = { name: "Updated Name" };
      const repository = entity.createRepository(mockTable);

      await repository.update(testData);

      expect(hooks.beforeUpdate).toHaveBeenCalledWith(testData);
      expect(mockTable.update).toHaveBeenCalledWith({ pk: "test-pk", sk: "test-sk" });
    });

    test("throws error when key information is incomplete", async () => {
      const mockTable = {
        update: vi.fn(),
      } as unknown as Table;

      const repository = entity.createRepository(mockTable);
      const testData = { name: "Updated Name" };

      vi.spyOn(definition.primaryKey, "partitionKey").mockReturnValue("");

      await expect(repository.update(testData)).rejects.toThrow("Cannot update without complete key information");
    });
  });

  describe("delete", () => {
    test("executes beforeDelete and afterDelete hooks", async () => {
      const mockTable = {
        delete: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(undefined),
      } as unknown as Table;

      const key = { pk: "test-pk", sk: "test-sk" };
      const repository = entity.createRepository(mockTable);

      await repository.delete(key);

      expect(hooks.beforeDelete).toHaveBeenCalledWith(key);
      expect(mockTable.delete).toHaveBeenCalledWith(key);
      expect(hooks.afterDelete).toHaveBeenCalledWith(key);
    });
  });

  describe("get", () => {
    test("executes beforeGet and afterGet hooks with item data", async () => {
      const testItem = { id: "1", name: "Test", age: 25 };
      const mockTable = {
        get: vi.fn().mockReturnValue({
          execute: vi.fn().mockResolvedValue({ item: testItem }),
        }),
      } as unknown as Table;

      const key = { pk: "test-pk", sk: "test-sk" };
      const repository = entity.createRepository(mockTable);

      await repository.get(key);

      expect(hooks.beforeGet).toHaveBeenCalledWith(key);
      expect(hooks.afterGet).toHaveBeenCalledWith(testItem);
    });

    test("handles null results gracefully", async () => {
      const mockTable = {
        get: vi.fn().mockReturnValue({
          execute: vi.fn().mockResolvedValue({ item: null }),
        }),
      } as unknown as Table;

      const key = { pk: "test-pk", sk: "test-sk" };
      const repository = entity.createRepository(mockTable);

      const result = await repository.get(key);
      expect(result).toBeNull();
    });
  });

  describe("validate", () => {
    test("returns valid result when schema validation passes", () => {
      const result = entity.validate({ id: "1", name: "Test", age: 25 });
      expect(result).toEqual({ valid: true });
    });

    test("returns invalid result with errors when schema validation fails", () => {
      const validationError = {
        issues: [{ message: "Invalid data" }],
      };

      vi.spyOn(definition.schema["~standard"], "validate").mockReturnValue(validationError);

      const result = entity.validate({});
      expect(result).toEqual({
        valid: false,
        errors: ["Invalid data"],
      });
    });
  });

  describe("getters", () => {
    test("returns entity name", () => {
      expect(entity.getName()).toBe("test-entity");
    });

    test("returns entity schema", () => {
      expect(entity.getSchema()).toBe(definition.schema);
    });

    test("returns primary key configuration", () => {
      expect(entity.getPrimaryKey()).toBe(definition.primaryKey);
    });

    test("returns entity hooks", () => {
      expect(entity.getHooks()).toBe(hooks);
    });
  });
});
