import { describe, expect, it, beforeEach } from "vitest";
import { inArray, eq, and } from "../conditions";
import { buildExpression, prepareExpressionParams } from "../expression";
import type { ExpressionParams } from "../conditions";

describe("IN operator", () => {
  describe("inArray function", () => {
    it("should create a condition with type 'in'", () => {
      const condition = inArray("status", ["ACTIVE", "PENDING", "PROCESSING"]);

      expect(condition).toEqual({
        type: "in",
        attr: "status",
        value: ["ACTIVE", "PENDING", "PROCESSING"],
      });
    });

    it("should handle numeric values", () => {
      const condition = inArray("priority", [1, 2, 3, 5, 8]);

      expect(condition).toEqual({
        type: "in",
        attr: "priority",
        value: [1, 2, 3, 5, 8],
      });
    });

    it("should handle mixed value types", () => {
      const condition = inArray("value", ["string", 42, true, null]);

      expect(condition).toEqual({
        type: "in",
        attr: "value",
        value: ["string", 42, true, null],
      });
    });
  });

  describe("buildExpression for IN operator", () => {
    let params: ExpressionParams;

    beforeEach(() => {
      params = {
        expressionAttributeNames: {},
        expressionAttributeValues: {},
        valueCounter: { count: 0 },
      };
    });

    it("should build correct expression for string values", () => {
      const condition = inArray("status", ["ACTIVE", "PENDING", "PROCESSING"]);
      const expression = buildExpression(condition, params);

      expect(expression).toBe("#0 IN (:0, :1, :2)");
      expect(params.expressionAttributeNames).toEqual({ "#0": "status" });
      expect(params.expressionAttributeValues).toEqual({
        ":0": "ACTIVE",
        ":1": "PENDING",
        ":2": "PROCESSING",
      });
    });

    it("should build correct expression for numeric values", () => {
      const condition = inArray("priority", [1, 3, 5]);
      const expression = buildExpression(condition, params);

      expect(expression).toBe("#0 IN (:0, :1, :2)");
      expect(params.expressionAttributeNames).toEqual({ "#0": "priority" });
      expect(params.expressionAttributeValues).toEqual({
        ":0": 1,
        ":1": 3,
        ":2": 5,
      });
    });

    it("should build correct expression for single value", () => {
      const condition = inArray("category", ["URGENT"]);
      const expression = buildExpression(condition, params);

      expect(expression).toBe("#0 IN (:0)");
      expect(params.expressionAttributeNames).toEqual({ "#0": "category" });
      expect(params.expressionAttributeValues).toEqual({
        ":0": "URGENT",
      });
    });

    it("should handle nested attribute names", () => {
      const condition = inArray("user.role", ["admin", "moderator", "user"]);
      const expression = buildExpression(condition, params);

      expect(expression).toBe("#0 IN (:0, :1, :2)");
      expect(params.expressionAttributeNames).toEqual({ "#0": "user.role" });
      expect(params.expressionAttributeValues).toEqual({
        ":0": "admin",
        ":1": "moderator",
        ":2": "user",
      });
    });

    it("should throw error for empty array", () => {
      const condition = inArray("status", []);

      expect(() => buildExpression(condition, params)).toThrow(
        "In condition requires a non-empty array of values"
      );
    });

    it("should throw error for more than 100 values", () => {
      const values = Array.from({ length: 101 }, (_, i) => `value${i}`);
      const condition = inArray("status", values);

      expect(() => buildExpression(condition, params)).toThrow(
        "In condition supports a maximum of 100 values"
      );
    });

    it("should handle exactly 100 values", () => {
      const values = Array.from({ length: 100 }, (_, i) => `value${i}`);
      const condition = inArray("status", values);
      const expression = buildExpression(condition, params);

      expect(expression).toMatch(/^#0 IN \(:0, :1, .*, :99\)$/);
      expect(Object.keys(params.expressionAttributeValues)).toHaveLength(100);
    });

    it("should throw error when attribute is missing", () => {
      const condition = { type: "in" as const, value: ["test"] };
      
      expect(() => buildExpression(condition, params)).toThrow(
        "Attribute is required for in condition"
      );
    });

    it("should throw error when value is not an array", () => {
      const condition = { type: "in" as const, attr: "status", value: "not-array" };
      
      expect(() => buildExpression(condition, params)).toThrow(
        "In condition requires a non-empty array of values"
      );
    });
  });

  describe("prepareExpressionParams with IN operator", () => {
    it("should prepare complete expression parameters", () => {
      const condition = inArray("status", ["ACTIVE", "PENDING"]);
      const result = prepareExpressionParams(condition);

      expect(result).toEqual({
        expression: "#0 IN (:0, :1)",
        names: { "#0": "status" },
        values: { ":0": "ACTIVE", ":1": "PENDING" },
      });
    });

    it("should work with complex conditions", () => {
      const condition = and(
        eq("type", "USER"),
        inArray("status", ["ACTIVE", "PENDING"])
      );
      const result = prepareExpressionParams(condition);

      expect(result.expression).toBe("(#0 = :0 AND #1 IN (:1, :2))");
      expect(result.names).toEqual({ "#0": "type", "#1": "status" });
      expect(result.values).toEqual({
        ":0": "USER",
        ":1": "ACTIVE",
        ":2": "PENDING",
      });
    });
  });

  describe("Integration with condition operators", () => {
    it("should work in complex logical expressions", () => {
      const params: ExpressionParams = {
        expressionAttributeNames: {},
        expressionAttributeValues: {},
        valueCounter: { count: 0 },
      };

      const condition = and(
        eq("type", "ORDER"),
        inArray("status", ["PENDING", "PROCESSING", "SHIPPED"]),
        eq("priority", "HIGH")
      );

      const expression = buildExpression(condition, params);

      expect(expression).toBe("(#0 = :0 AND #1 IN (:1, :2, :3) AND #2 = :4)");
      expect(params.expressionAttributeNames).toEqual({
        "#0": "type",
        "#1": "status",
        "#2": "priority",
      });
      expect(params.expressionAttributeValues).toEqual({
        ":0": "ORDER",
        ":1": "PENDING",
        ":2": "PROCESSING",
        ":3": "SHIPPED",
        ":4": "HIGH",
      });
    });
  });

  describe("Integration with builders", () => {
    it("should work with condition operator function", () => {
      // Mock a condition operator function like those used in builders
      const mockConditionOperator = {
        eq,
        inArray,
        and,
      };

      // Simulate how builders use the condition operator
      const condition = mockConditionOperator.and(
        mockConditionOperator.eq("type", "USER"),
        mockConditionOperator.inArray("role", ["admin", "moderator", "user"])
      );

      const result = prepareExpressionParams(condition);

      expect(result.expression).toBe("(#0 = :0 AND #1 IN (:1, :2, :3))");
      expect(result.names).toEqual({ "#0": "type", "#1": "role" });
      expect(result.values).toEqual({
        ":0": "USER",
        ":1": "admin",
        ":2": "moderator",
        ":3": "user",
      });
    });
  });
});
