import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "../../conditions";
import { PutBuilder } from "../put-builder";

interface TestItem extends Record<string, unknown> {
  id: string;
  sort: string;
  status: string;
  count: number;
}

describe("PutBuilder", () => {
  const tableName = "TestTable";
  const item: TestItem = {
    id: "123",
    sort: "456",
    status: "active",
    count: 1,
  };
  const mockExecutor = vi.fn();

  beforeEach(() => {
    mockExecutor.mockClear();
  });

  describe("constructor", () => {
    it("should create instance with executor, item and table name", () => {
      const builder = new PutBuilder<TestItem>(mockExecutor, item, tableName);
      expect(builder).toBeInstanceOf(PutBuilder);
    });
  });

  describe("condition", () => {
    it("should accept direct condition", () => {
      const builder = new PutBuilder<TestItem>(mockExecutor, item, tableName);
      const result = builder.condition(eq("status", "active"));
      expect(result).toBe(builder);
    });

    it("should accept condition function", () => {
      const builder = new PutBuilder<TestItem>(mockExecutor, item, tableName);
      const result = builder.condition((op) => op.eq("status", "active"));
      expect(result).toBe(builder);
    });

    it("should handle complex conditions", () => {
      const builder = new PutBuilder<TestItem>(mockExecutor, item, tableName);
      const result = builder.condition((op) => op.and(op.eq("status", "active"), op.attributeExists("count")));
      expect(result).toBe(builder);
    });
  });

  describe("returnValues", () => {
    it("should set return values to ALL_OLD", () => {
      const builder = new PutBuilder<TestItem>(mockExecutor, item, tableName);
      const result = builder.returnValues("ALL_OLD");
      expect(result).toBe(builder);
    });

    it("should set return values to NONE", () => {
      const builder = new PutBuilder<TestItem>(mockExecutor, item, tableName);
      const result = builder.returnValues("NONE");
      expect(result).toBe(builder);
    });
  });

  describe("execute", () => {
    it("should call executor with correct parameters and conditions", async () => {
      const builder = new PutBuilder<TestItem>(mockExecutor, item, tableName);
      builder.condition(eq("status", "active"));

      const mockResponse: TestItem = { ...item };
      mockExecutor.mockResolvedValueOnce(mockResponse);

      const result = await builder.execute();

      expect(mockExecutor).toHaveBeenCalledWith({
        tableName,
        item,
        conditionExpression: expect.any(String),
        expressionAttributeNames: expect.any(Object),
        expressionAttributeValues: expect.any(Object),
        returnValues: "NONE",
      });
      expect(result).toBe(mockResponse);
    });

    it("should execute without conditions", async () => {
      const builder = new PutBuilder<TestItem>(mockExecutor, item, tableName);

      const mockResponse: TestItem = { ...item };
      mockExecutor.mockResolvedValueOnce(mockResponse);

      const result = await builder.execute();

      expect(mockExecutor).toHaveBeenCalledWith({
        tableName,
        item,
        returnValues: "NONE",
      });
      expect(result).toBe(mockResponse);
    });

    it("should include return values in command", async () => {
      const builder = new PutBuilder<TestItem>(mockExecutor, item, tableName);
      builder.returnValues("ALL_OLD");

      const mockResponse: TestItem = { ...item };
      mockExecutor.mockResolvedValueOnce(mockResponse);

      await builder.execute();

      expect(mockExecutor).toHaveBeenCalledWith(
        expect.objectContaining({
          returnValues: "ALL_OLD",
        }),
      );
    });

    it("should resolve a prepared item before execute", async () => {
      const builder = new PutBuilder<TestItem>(mockExecutor, item, tableName).prepareItem({
        prepareForExecute: async () => ({
          ...item,
          status: "prepared",
        }),
      });

      await builder.execute();

      expect(mockExecutor).toHaveBeenCalledWith(
        expect.objectContaining({
          item: expect.objectContaining({
            status: "prepared",
          }),
        }),
      );
    });
  });

  describe("composition hooks", () => {
    it("should resolve a prepared item before withTransaction", () => {
      const transaction = {
        putWithCommand: vi.fn(),
      };

      const builder = new PutBuilder<TestItem>(mockExecutor, item, tableName).prepareItem({
        prepareForCompose: () => ({
          ...item,
          status: "composed",
        }),
      });

      // @ts-expect-error test double
      builder.withTransaction(transaction);

      expect(transaction.putWithCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          item: expect.objectContaining({
            status: "composed",
          }),
        }),
      );
    });

    it("should resolve a prepared item before withBatch", () => {
      const batch = {
        putWithCommand: vi.fn(),
      };

      const builder = new PutBuilder<TestItem>(mockExecutor, item, tableName).prepareItem({
        prepareForCompose: () => ({
          ...item,
          status: "batched",
        }),
      });

      // @ts-expect-error test double
      builder.withBatch(batch);

      expect(batch.putWithCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          item: expect.objectContaining({
            status: "batched",
          }),
        }),
        undefined,
      );
    });

    it("should not mutate builder item after withTransaction", async () => {
      const transaction = {
        putWithCommand: vi.fn(),
      };

      const builder = new PutBuilder<TestItem>(mockExecutor, item, tableName).prepareItem({
        prepareForCompose: () => ({
          ...item,
          status: "composed",
        }),
      });

      // @ts-expect-error test double
      builder.withTransaction(transaction);

      await builder.execute();

      expect(mockExecutor).toHaveBeenCalledWith(
        expect.objectContaining({
          item,
        }),
      );
    });

    it("should not leak in-place compose mutations into builder state", async () => {
      const transaction = {
        putWithCommand: vi.fn(),
      };

      const sourceItem = { ...item };
      const builder = new PutBuilder<TestItem>(mockExecutor, sourceItem, tableName).prepareItem({
        prepareForCompose: () => {
          sourceItem.status = "mutated-in-place";
          return sourceItem;
        },
      });

      // @ts-expect-error test double
      builder.withTransaction(transaction);

      expect(transaction.putWithCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          item: expect.objectContaining({
            status: "mutated-in-place",
          }),
        }),
      );

      await builder.execute();

      expect(mockExecutor).toHaveBeenCalledWith(
        expect.objectContaining({
          item: expect.objectContaining({
            status: "active",
          }),
        }),
      );
    });

    it("should not mutate builder item after execute", async () => {
      const transaction = {
        putWithCommand: vi.fn(),
      };

      const builder = new PutBuilder<TestItem>(mockExecutor, item, tableName).prepareItem({
        prepareForExecute: async () => ({
          ...item,
          status: "executed",
        }),
      });

      await builder.execute();

      // @ts-expect-error test double
      builder.withTransaction(transaction);

      expect(transaction.putWithCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          item,
        }),
      );
    });

    it("should not leak in-place execute mutations into builder state", async () => {
      const transaction = {
        putWithCommand: vi.fn(),
      };

      const sourceItem = { ...item };
      const builder = new PutBuilder<TestItem>(mockExecutor, sourceItem, tableName).prepareItem({
        prepareForExecute: async () => {
          sourceItem.status = "executed-in-place";
          return sourceItem;
        },
      });

      await builder.execute();

      expect(mockExecutor).toHaveBeenCalledWith(
        expect.objectContaining({
          item: expect.objectContaining({
            status: "executed-in-place",
          }),
        }),
      );

      // @ts-expect-error test double
      builder.withTransaction(transaction);

      expect(transaction.putWithCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          item: expect.objectContaining({
            status: "active",
          }),
        }),
      );
    });

    it("should clone items without relying on global structuredClone", async () => {
      const originalStructuredClone = globalThis.structuredClone;
      const transaction = {
        putWithCommand: vi.fn(),
      };

      const sourceItem = { ...item };
      const builder = new PutBuilder<TestItem>(mockExecutor, sourceItem, tableName).prepareItem({
        prepareForExecute: async () => {
          sourceItem.status = "executed-without-structured-clone";
          return sourceItem;
        },
      });

      globalThis.structuredClone = undefined as unknown as typeof globalThis.structuredClone;

      try {
        await builder.execute();

        expect(mockExecutor).toHaveBeenCalledWith(
          expect.objectContaining({
            item: expect.objectContaining({
              status: "executed-without-structured-clone",
            }),
          }),
        );

        // @ts-expect-error test double
        builder.withTransaction(transaction);

        expect(transaction.putWithCommand).toHaveBeenCalledWith(
          expect.objectContaining({
            item: expect.objectContaining({
              status: "active",
            }),
          }),
        );
      } finally {
        globalThis.structuredClone = originalStructuredClone;
      }
    });
  });

  describe("debug", () => {
    it("should return readable command representation with conditions", () => {
      const builder = new PutBuilder<TestItem>(mockExecutor, item, tableName);
      builder.condition(eq("status", "active"));

      const debug = builder.debug();

      expect(debug).toEqual({
        raw: {
          tableName,
          item,
          conditionExpression: "#0 = :0",
          expressionAttributeNames: { "#0": "status" },
          expressionAttributeValues: { ":0": "active" },
          returnValues: "NONE",
        },
        readable: {
          conditionExpression: 'status = "active"',
        },
      });
    });

    it("should handle debug without conditions", () => {
      const builder = new PutBuilder<TestItem>(mockExecutor, item, tableName);
      const debug = builder.debug();

      expect(debug).toEqual({
        raw: {
          tableName,
          item,
          returnValues: "NONE",
        },
        readable: {},
      });
    });

    it("should correctly debug withReturn value being set", () => {
      const builder = new PutBuilder<TestItem>(mockExecutor, item, tableName).returnValues("CONSISTENT");
      const debug = builder.debug();

      expect(debug).toEqual({
        raw: {
          tableName,
          item,
          returnValues: "CONSISTENT",
        },
        readable: {},
      });
    });
  });
});
