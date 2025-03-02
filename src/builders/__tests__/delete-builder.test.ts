import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeleteBuilder } from "../delete-builder";
import { TransactionBuilder } from "../transaction-builder";
import { eq, and, attributeExists } from "../../conditions";

describe("DeleteBuilder", () => {
  const tableName = "TestTable";
  const key = { pk: "123", sk: "456" };
  const mockExecutor = vi.fn();

  beforeEach(() => {
    mockExecutor.mockClear();
  });

  describe("constructor", () => {
    it("should create instance with executor, table name and key", () => {
      const builder = new DeleteBuilder(mockExecutor, tableName, key);
      expect(builder).toBeInstanceOf(DeleteBuilder);
    });
  });

  describe("condition", () => {
    it("should accept direct condition", () => {
      const builder = new DeleteBuilder(mockExecutor, tableName, key);
      const result = builder.condition(eq("status", "active"));
      expect(result).toBe(builder);
    });

    it("should accept condition function", () => {
      const builder = new DeleteBuilder(mockExecutor, tableName, key);
      const result = builder.condition((op) => op.eq("status", "active"));
      expect(result).toBe(builder);
    });

    it("should handle complex conditions", () => {
      const builder = new DeleteBuilder(mockExecutor, tableName, key);
      const result = builder.condition((op) => op.and(op.eq("status", "active"), op.attributeExists("lastLogin")));
      expect(result).toBe(builder);
    });
  });

  describe("returnValues", () => {
    it("should set return values option", () => {
      const builder = new DeleteBuilder(mockExecutor, tableName, key);
      const result = builder.returnValues("ALL_OLD");
      expect(result).toBe(builder);
    });
  });

  describe("execute", () => {
    it("should call executor with correct parameters", async () => {
      const builder = new DeleteBuilder(mockExecutor, tableName, key);
      builder.condition(eq("status", "active"));

      const mockResponse = { item: { id: "123", status: "active" } };
      mockExecutor.mockResolvedValueOnce(mockResponse);

      const result = await builder.execute();

      expect(mockExecutor).toHaveBeenCalledWith({
        tableName,
        key,
        conditionExpression: expect.any(String),
        expressionAttributeNames: expect.any(Object),
        expressionAttributeValues: expect.any(Object),
        returnValues: "ALL_OLD",
      });
      expect(result).toBe(mockResponse);
    });

    it("should execute without conditions", async () => {
      const builder = new DeleteBuilder(mockExecutor, tableName, key);

      const mockResponse = { item: { id: "123" } };
      mockExecutor.mockResolvedValueOnce(mockResponse);

      const result = await builder.execute();

      expect(mockExecutor).toHaveBeenCalledWith({
        tableName,
        key,
        returnValues: "ALL_OLD",
      });
      expect(result).toBe(mockResponse);
    });
  });

  describe("debug", () => {
    it("should return readable command representation", () => {
      const builder = new DeleteBuilder(mockExecutor, tableName, key);
      builder.condition(eq("status", "active"));

      const debug = builder.debug();

      expect(debug).toEqual({
        raw: {
          tableName,
          key,
          conditionExpression: "#0 = :0",
          expressionAttributeNames: { "#0": "status" },
          expressionAttributeValues: { ":0": "active" },
          returnValues: "ALL_OLD",
        },
        readable: {
          conditionExpression: 'status = "active"',
        },
      });
    });

    it("should handle debug without conditions", () => {
      const builder = new DeleteBuilder(mockExecutor, tableName, key);
      const debug = builder.debug();

      expect(debug).toEqual({
        raw: {
          tableName,
          key,
          returnValues: "ALL_OLD",
        },
        readable: {},
      });
    });
  });
});
