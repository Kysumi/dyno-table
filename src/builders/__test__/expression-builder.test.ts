import { describe, it, expect, beforeEach } from "vitest";
import { ExpressionBuilder } from "../expression-builder";

describe("ExpressionBuilder", () => {
  let builder: ExpressionBuilder;

  beforeEach(() => {
    builder = new ExpressionBuilder();
  });

  describe("createExpression", () => {
    it("should build attribute_exists condition", () => {
      const result = builder.createExpression([{ field: "email", operator: "attribute_exists" }]);

      expect(result).toEqual({
        expression: "attribute_exists(#n0)",
        attributes: {
          names: { "#n0": "email" },
        },
      });
    });

    it("should build attribute_not_exists condition", () => {
      const result = builder.createExpression([{ field: "deletedAt", operator: "attribute_not_exists" }]);

      expect(result).toEqual({
        expression: "attribute_not_exists(#n0)",
        attributes: {
          names: { "#n0": "deletedAt" },
        },
      });
    });

    it("should build attribute_type condition", () => {
      const result = builder.createExpression([{ field: "age", operator: "attribute_type", value: "N" }]);

      expect(result).toEqual({
        expression: "attribute_type(#n0, :v0)",
        attributes: {
          names: { "#n0": "age" },
          values: { ":v0": "N" },
        },
      });
    });

    it("should build size condition with comparison", () => {
      const result = builder.createExpression([{ field: "tags", operator: "size", value: { compare: ">", value: 5 } }]);

      expect(result).toEqual({
        expression: "size(#n0) > :v0",
        attributes: {
          names: { "#n0": "tags" },
          values: { ":v0": 5 },
        },
      });
    });

    it("should build begins_with condition", () => {
      const result = builder.createExpression([{ field: "email", operator: "begins_with", value: "john" }]);

      expect(result).toEqual({
        expression: "begins_with(#n0, :v0)",
        attributes: {
          names: { "#n0": "email" },
          values: { ":v0": "john" },
        },
      });
    });

    it("should build contains condition", () => {
      const result = builder.createExpression([{ field: "interests", operator: "contains", value: "reading" }]);

      expect(result).toEqual({
        expression: "contains(#n0, :v0)",
        attributes: {
          names: { "#n0": "interests" },
          values: { ":v0": "reading" },
        },
      });
    });

    it("should build not_contains condition", () => {
      const result = builder.createExpression([{ field: "interests", operator: "not_contains", value: "swimming" }]);

      expect(result).toEqual({
        expression: "NOT contains(#n0, :v0)",
        attributes: {
          names: { "#n0": "interests" },
          values: { ":v0": "swimming" },
        },
      });
    });

    it("should build multiple conditions with AND", () => {
      const result = builder.createExpression([
        { field: "age", operator: ">", value: 21 },
        { field: "email", operator: "attribute_exists" },
        { field: "name", operator: "begins_with", value: "J" },
        { field: "tags", operator: "contains", value: "premium" },
      ]);

      expect(result).toEqual({
        expression: "#n0 > :v0 AND attribute_exists(#n1) AND begins_with(#n2, :v1) AND contains(#n3, :v2)",
        attributes: {
          names: {
            "#n0": "age",
            "#n1": "email",
            "#n2": "name",
            "#n3": "tags",
          },
          values: {
            ":v0": 21,
            ":v1": "J",
            ":v2": "premium",
          },
        },
      });
    });

    it("should build nested attribute conditions", () => {
      const result = builder.createExpression([
        { field: "address.city", operator: "=", value: "New York" },
        {
          field: "profile.settings.notifications",
          operator: "attribute_exists",
        },
      ]);

      expect(result).toEqual({
        expression: "#n0.#n1 = :v0 AND attribute_exists(#n2.#n3.#n4)",
        attributes: {
          names: {
            "#n0": "address",
            "#n1": "city",
            "#n2": "profile",
            "#n3": "settings",
            "#n4": "notifications",
          },
          values: {
            ":v0": "New York",
          },
        },
      });
    });

    it("should build BETWEEN condition", () => {
      const result = builder.createExpression([{ field: "age", operator: "BETWEEN", value: [20, 30] }]);

      expect(result).toEqual({
        expression: "#n0 BETWEEN :v0[0] AND :v0[1]",
        attributes: {
          names: { "#n0": "age" },
          values: { ":v0": [20, 30] },
        },
      });
    });

    it("should build IN condition", () => {
      const result = builder.createExpression([{ field: "status", operator: "IN", value: ["active", "pending"] }]);

      expect(result).toEqual({
        expression: "#n0 IN (:v0)",
        attributes: {
          names: { "#n0": "status" },
          values: { ":v0": ["active", "pending"] },
        },
      });
    });
  });

  describe("buildUpdateExpression", () => {
    it("should build SET expression for single update", () => {
      const result = builder.buildUpdateExpression({
        name: "John Doe",
      });

      expect(result).toEqual({
        expression: "SET #n0 = :u0",
        attributes: {
          names: { "#n0": "name" },
          values: { ":u0": "John Doe" },
        },
      });
    });

    it("should build SET expression for multiple updates", () => {
      const result = builder.buildUpdateExpression({
        name: "John Doe",
        age: 30,
        email: "john@example.com",
      });

      expect(result).toEqual({
        expression: "SET #n0 = :u0, #n1 = :u1, #n2 = :u2",
        attributes: {
          names: {
            "#n0": "name",
            "#n1": "age",
            "#n2": "email",
          },
          values: {
            ":u0": "John Doe",
            ":u1": 30,
            ":u2": "john@example.com",
          },
        },
      });
    });

    it("should build REMOVE expression for null values", () => {
      const result = builder.buildUpdateExpression({
        deletedAt: null,
        temporaryFlag: undefined,
      });

      expect(result).toEqual({
        expression: "REMOVE #n0, #n1",
        attributes: {
          names: {
            "#n0": "deletedAt",
            "#n1": "temporaryFlag",
          },
        },
      });
    });

    it("should build combined SET and REMOVE expressions", () => {
      const result = builder.buildUpdateExpression({
        name: "John Doe",
        age: 30,
        deletedAt: null,
        status: undefined,
      });

      expect(result).toEqual({
        expression: "SET #n0 = :u0, #n1 = :u1 REMOVE #n2, #n3",
        attributes: {
          names: {
            "#n0": "name",
            "#n1": "age",
            "#n2": "deletedAt",
            "#n3": "status",
          },
          values: {
            ":u0": "John Doe",
            ":u1": 30,
          },
        },
      });
    });

    it("should handle empty update object", () => {
      const result = builder.buildUpdateExpression({});

      expect(result).toEqual({
        expression: "",
        attributes: {},
      });
    });

    it("should handle different value types", () => {
      const result = builder.buildUpdateExpression({
        string: "text",
        number: 123,
        boolean: true,
        array: [1, 2, 3],
        object: { key: "value" },
      });

      expect(result).toEqual({
        expression: "SET #n0 = :u0, #n1 = :u1, #n2 = :u2, #n3 = :u3, #n4.#n5 = :u4",
        attributes: {
          names: {
            "#n0": "string",
            "#n1": "number",
            "#n2": "boolean",
            "#n3": "array",
            "#n4": "object",
            "#n5": "key",
          },
          values: {
            ":u0": "text",
            ":u1": 123,
            ":u2": true,
            ":u3": [1, 2, 3],
            ":u4": "value",
          },
        },
      });
    });

    it("should handle updates with empty string values", () => {
      const result = builder.buildUpdateExpression({
        name: "",
      });

      expect(result).toEqual({
        expression: "SET #n0 = :u0",
        attributes: {
          names: { "#n0": "name" },
          values: { ":u0": "" },
        },
      });
    });

    it("should handle updates with zero as value", () => {
      const result = builder.buildUpdateExpression({
        count: 0,
      });

      expect(result).toEqual({
        expression: "SET #n0 = :u0",
        attributes: {
          names: { "#n0": "count" },
          values: { ":u0": 0 },
        },
      });
    });

    it("should handle updates with false as value", () => {
      const result = builder.buildUpdateExpression({
        isActive: false,
      });

      expect(result).toEqual({
        expression: "SET #n0 = :u0",
        attributes: {
          names: { "#n0": "isActive" },
          values: { ":u0": false },
        },
      });
    });
  });
});
