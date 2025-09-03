import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "../../conditions";
import { UpdateBuilder } from "../update-builder";

interface TestItem extends Record<string, unknown> {
  id: string;
  sort: string;
  status: string;
  count: number;
  tags: string[];
  metadata: {
    lastUpdated: string;
  };
}

describe("UpdateBuilder", () => {
  const tableName = "TestTable";
  const key = { pk: "123", sk: "456" };
  const mockExecutor = vi.fn();

  beforeEach(() => {
    mockExecutor.mockClear();
  });

  describe("constructor", () => {
    it("should create instance with executor, table name and key", () => {
      const builder = new UpdateBuilder<TestItem>(mockExecutor, tableName, key);
      expect(builder).toBeInstanceOf(UpdateBuilder);
    });
  });

  describe("set operations", () => {
    it("should set single path value", () => {
      const builder = new UpdateBuilder<TestItem>(mockExecutor, tableName, key);
      const result = builder.set("status", "inactive");
      expect(result).toBe(builder);
    });

    it("should set multiple values", () => {
      const builder = new UpdateBuilder<TestItem>(mockExecutor, tableName, key);
      const result = builder.set({
        status: "inactive",
        count: 2,
      });
      expect(result).toBe(builder);
    });

    it("should handle nested paths", () => {
      const builder = new UpdateBuilder<TestItem>(mockExecutor, tableName, key);
      const result = builder.set("metadata.lastUpdated", new Date().toISOString());
      expect(result).toBe(builder);
    });
  });

  describe("remove operations", () => {
    it("should remove attribute", () => {
      const builder = new UpdateBuilder<TestItem>(mockExecutor, tableName, key);
      const result = builder.remove("status");
      expect(result).toBe(builder);
    });

    it("should remove multiple attributes", () => {
      const builder = new UpdateBuilder<TestItem>(mockExecutor, tableName, key);
      const result = builder.remove("status").remove("count");
      expect(result).toBe(builder);
    });
  });

  describe("add operations", () => {
    it("should add number to attribute", () => {
      const builder = new UpdateBuilder<TestItem>(mockExecutor, tableName, key);
      const result = builder.add("count", 1);
      expect(result).toBe(builder);
    });
  });

  describe("deleteElementsFromSet", () => {
    it("should delete elements from set", () => {
      const builder = new UpdateBuilder<TestItem>(mockExecutor, tableName, key);
      const result = builder.deleteElementsFromSet("tags", ["tag1", "tag2"]);
      expect(result).toBe(builder);
    });
  });

  describe("condition", () => {
    it("should accept direct condition", () => {
      const builder = new UpdateBuilder<TestItem>(mockExecutor, tableName, key);
      const result = builder.condition(eq("status", "active"));
      expect(result).toBe(builder);
    });

    it("should accept condition function", () => {
      const builder = new UpdateBuilder<TestItem>(mockExecutor, tableName, key);
      const result = builder.condition((op) => op.eq("status", "active"));
      expect(result).toBe(builder);
    });

    it("should handle complex conditions", () => {
      const builder = new UpdateBuilder<TestItem>(mockExecutor, tableName, key);
      const result = builder.condition((op) => op.and(op.eq("status", "active"), op.attributeExists("count")));
      expect(result).toBe(builder);
    });
  });

  describe("returnValues", () => {
    it("should set return values to ALL_NEW", () => {
      const builder = new UpdateBuilder<TestItem>(mockExecutor, tableName, key);
      const result = builder.returnValues("ALL_NEW");
      expect(result).toBe(builder);
    });

    it("should set return values to ALL_OLD", () => {
      const builder = new UpdateBuilder<TestItem>(mockExecutor, tableName, key);
      const result = builder.returnValues("ALL_OLD");
      expect(result).toBe(builder);
    });

    it("should set return values to UPDATED_NEW", () => {
      const builder = new UpdateBuilder<TestItem>(mockExecutor, tableName, key);
      const result = builder.returnValues("UPDATED_NEW");
      expect(result).toBe(builder);
    });

    it("should set return values to UPDATED_OLD", () => {
      const builder = new UpdateBuilder<TestItem>(mockExecutor, tableName, key);
      const result = builder.returnValues("UPDATED_OLD");
      expect(result).toBe(builder);
    });
  });

  describe("execute", () => {
    it("should execute update with correct parameters", async () => {
      const builder = new UpdateBuilder<TestItem>(mockExecutor, tableName, key);
      builder.set("status", "inactive").condition(eq("status", "active"));

      const mockResponse = { id: "123", status: "inactive" };
      mockExecutor.mockResolvedValueOnce(mockResponse);

      const result = await builder.execute();

      expect(mockExecutor).toHaveBeenCalledWith({
        tableName,
        key,
        returnValues: "ALL_NEW",
        updateExpression: "SET #0 = :0",
        conditionExpression: "#0 = :1",
        expressionAttributeNames: {
          "#0": "status",
        },
        expressionAttributeValues: {
          ":0": "inactive",
          ":1": "active",
        },
      });
      expect(result).toBe(mockResponse);
    });

    it("should execute multiple operations", async () => {
      const builder = new UpdateBuilder<TestItem>(mockExecutor, tableName, key);
      builder.set("status", "inactive").add("count", 1).remove("tags");

      const mockResponse = { id: "123", status: "inactive", count: 2 };
      mockExecutor.mockResolvedValueOnce(mockResponse);

      await builder.execute();

      expect(mockExecutor).toHaveBeenCalledWith({
        tableName,
        key,
        returnValues: "ALL_NEW",
        updateExpression: "SET #0 = :0 REMOVE #1 ADD #2 :1",
        expressionAttributeNames: {
          "#0": "status",
          "#1": "tags",
          "#2": "count",
        },
        expressionAttributeValues: {
          ":0": "inactive",
          ":1": 1,
        },
      });
    });
  });

  describe("debug", () => {
    it("should return readable command representation", () => {
      const builder = new UpdateBuilder<TestItem>(mockExecutor, tableName, key);
      builder.set("status", "inactive").add("count", 1).condition(eq("status", "active"));

      const debug = builder.debug();

      expect(debug).toEqual({
        raw: {
          tableName,
          key,
          returnValues: "ALL_NEW",
          updateExpression: "SET #0 = :0 ADD #1 :1",
          conditionExpression: "#0 = :2",
          expressionAttributeNames: {
            "#0": "status",
            "#1": "count",
          },
          expressionAttributeValues: {
            ":0": "inactive",
            ":1": 1,
            ":2": "active",
          },
        },
        readable: {
          updateExpression: 'SET status = "inactive" ADD count 1',
          conditionExpression: 'status = "active"',
        },
      });
    });

    it("should handle debug without conditions", () => {
      const builder = new UpdateBuilder<TestItem>(mockExecutor, tableName, key);
      builder.set("status", "inactive");

      const debug = builder.debug();

      expect(debug).toEqual({
        raw: {
          tableName,
          key,
          conditionExpression: undefined,
          returnValues: "ALL_NEW",
          updateExpression: "SET #0 = :0",
          expressionAttributeNames: {
            "#0": "status",
          },
          expressionAttributeValues: {
            ":0": "inactive",
          },
        },
        readable: {
          updateExpression: 'SET status = "inactive"',
        },
      });
    });
  });
});
