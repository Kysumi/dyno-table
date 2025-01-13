import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DynamoRecord } from "../../builders/types";
import type { PrimaryKeyWithoutExpression } from "../../dynamo/dynamo-types";
import type { Table } from "../../table";
import { BaseRepository } from "../base-repository";
import type { RepositoryHooks, RepositoryPlugin } from "../types";

// Test interfaces and types
interface TestRecord extends DynamoRecord {
  id: string;
  name: string;
  age: number;
}

// Mock Table
const mockTable = {
  put: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
  update: vi.fn(),
  query: vi.fn(),
} as unknown as Table;

// Test Repository Implementation
class TestRepository extends BaseRepository<TestRecord> {
  protected createPrimaryKey(data: TestRecord): PrimaryKeyWithoutExpression {
    return {
      pk: `USER#${data.id}`,
      sk: `PROFILE#${data.id}`,
    };
  }

  protected getType(): string {
    return "USER";
  }

  protected getTypeAttributeName(): string {
    return "type";
  }

  // Expose executeHook for testing
  public async testExecuteHook<THook extends keyof RepositoryHooks<TestRecord>>(
    hook: THook,
    ...args: Parameters<NonNullable<RepositoryHooks<TestRecord>[THook]>>
  ) {
    return this.executeHook(hook, ...args);
  }
}

describe("Repository Plugin System", () => {
  let repository: TestRepository;

  beforeEach(() => {
    repository = new TestRepository(mockTable);
    vi.clearAllMocks();
  });

  describe("Plugin Registration", () => {
    it("should register a plugin successfully", async () => {
      const plugin: RepositoryPlugin<TestRecord> = {
        name: "testPlugin",
        hooks: {
          beforeCreate: async (data) => ({ ...data, age: 25 }),
        },
      };

      await repository.use(plugin);

      const result = await repository.testExecuteHook("beforeCreate", {
        id: "1",
        name: "Test",
        age: 20,
      });

      expect(result).toEqual({
        id: "1",
        name: "Test",
        age: 25,
      });
    });

    it("should prevent duplicate plugin registration", async () => {
      const plugin: RepositoryPlugin<TestRecord> = {
        name: "testPlugin",
        hooks: {},
      };

      await repository.use(plugin);

      await expect(repository.use(plugin)).rejects.toThrow("Plugin testPlugin is already registered");
    });

    it("should call plugin initialize method if present", async () => {
      const initializeMock = vi.fn();
      const plugin: RepositoryPlugin<TestRecord> = {
        name: "testPlugin",
        initialize: initializeMock,
      };

      await repository.use(plugin);

      expect(initializeMock).toHaveBeenCalledOnce();
      expect(initializeMock).toHaveBeenCalledWith(repository);
    });
  });

  describe("Hook Execution", () => {
    it("should execute multiple plugins in registration order", async () => {
      const plugin1: RepositoryPlugin<TestRecord> = {
        name: "plugin1",
        hooks: {
          beforeCreate: async (data) => ({ ...data, age: 25 }),
        },
      };

      const plugin2: RepositoryPlugin<TestRecord> = {
        name: "plugin2",
        hooks: {
          beforeCreate: async (data) => ({
            ...data,
            name: `${data.name}-modified`,
          }),
        },
      };

      const plugin3: RepositoryPlugin<TestRecord> = {
        name: "plugin3",
        hooks: {
          beforeCreate: async (data) => {
            expect(data).toEqual({
              id: "1",
              name: "Test-modified",
              age: 25,
            });

            return {
              ...data,
              age: data.age + 5,
            };
          },
        },
      };

      await repository.use(plugin1);
      await repository.use(plugin2);
      await repository.use(plugin3);

      const result = await repository.testExecuteHook("beforeCreate", {
        id: "1",
        name: "Test",
        age: 5,
      });

      expect(result).toEqual({
        id: "1",
        name: "Test-modified",
        age: 30,
      });
    });

    it("should handle plugins without specific hooks", async () => {
      const plugin1: RepositoryPlugin<TestRecord> = {
        name: "plugin1",
        hooks: {
          beforeCreate: async (data) => ({ ...data, age: 25 }),
        },
      };

      const plugin2: RepositoryPlugin<TestRecord> = {
        name: "plugin2",
        hooks: {
          afterCreate: async () => {
            /* do nothing */
          },
        },
      };

      await repository.use(plugin1);
      await repository.use(plugin2);

      const result = await repository.testExecuteHook("beforeCreate", {
        id: "1",
        name: "Test",
        age: 20,
      });

      expect(result).toEqual({
        id: "1",
        name: "Test",
        age: 25,
      });
    });

    it("should handle async hooks correctly", async () => {
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      const plugin1: RepositoryPlugin<TestRecord> = {
        name: "plugin1",
        hooks: {
          beforeCreate: async (data) => {
            await delay(10);
            return { ...data, age: 25 };
          },
        },
      };

      const plugin2: RepositoryPlugin<TestRecord> = {
        name: "plugin2",
        hooks: {
          beforeCreate: async (data) => {
            await delay(10);
            return { ...data, name: `${data.name}-modified` };
          },
        },
      };

      await repository.use(plugin1);
      await repository.use(plugin2);

      const result = await repository.testExecuteHook("beforeCreate", {
        id: "1",
        name: "Test",
        age: 20,
      });

      expect(result).toEqual({
        id: "1",
        name: "Test-modified",
        age: 25,
      });
    });
  });

  describe("Error Handling", () => {
    it("should propagate errors from plugins", async () => {
      const plugin: RepositoryPlugin<TestRecord> = {
        name: "errorPlugin",
        hooks: {
          beforeCreate: async () => {
            throw new Error("Plugin error");
          },
        },
      };

      await repository.use(plugin);

      await expect(
        repository.testExecuteHook("beforeCreate", {
          id: "1",
          name: "Test",
          age: 20,
        }),
      ).rejects.toThrow("Plugin error");
    });

    it("should stop execution chain when plugin throws", async () => {
      const secondPluginMock = vi.fn();

      const plugin1: RepositoryPlugin<TestRecord> = {
        name: "plugin1",
        hooks: {
          beforeCreate: async () => {
            throw new Error("Plugin error");
          },
        },
      };

      const plugin2: RepositoryPlugin<TestRecord> = {
        name: "plugin2",
        hooks: {
          beforeCreate: secondPluginMock,
        },
      };

      await repository.use(plugin1);
      await repository.use(plugin2);

      await expect(
        repository.testExecuteHook("beforeCreate", {
          id: "1",
          name: "Test",
          age: 20,
        }),
      ).rejects.toThrow("Plugin error");

      expect(secondPluginMock).not.toHaveBeenCalled();
    });
  });
});
