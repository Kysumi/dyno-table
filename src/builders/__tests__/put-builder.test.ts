import { describe, it, expect, vi, beforeEach } from "vitest";
import { PutBuilder } from "../put-builder";
import { TransactionBuilder } from "../transaction-builder";
import { eq, and, attributeExists } from "../../conditions";

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
