import { describe, expect, it } from "vitest";
import { getReadableExpression } from "../debug-expression";

describe("getReadableExpression", () => {
  describe("basic conditions", () => {
    it("should format basic equality condition", () => {
      const expression = {
        field: "name",
        operator: "=",
        value: "John",
      };
      expect(getReadableExpression(expression)).toBe('(name = "John")');
    });

    it("should format basic comparison conditions", () => {
      const gtExpression = {
        field: "age",
        operator: ">",
        value: 18,
      };
      expect(getReadableExpression(gtExpression)).toBe("(age > 18)");
    });
  });

  describe("BETWEEN operator", () => {
    it("should format BETWEEN condition", () => {
      const expression = {
        field: "age",
        operator: "BETWEEN",
        value: [18, 30],
      };
      expect(getReadableExpression(expression)).toBe("(age BETWEEN 18 AND 30)");
    });
  });

  describe("IN operator", () => {
    it("should format IN condition", () => {
      const expression = {
        field: "status",
        operator: "IN",
        value: ["active", "pending"],
      };
      expect(getReadableExpression(expression)).toBe('(status IN ("active", "pending"))');
    });
  });

  describe("attribute functions", () => {
    it("should format attribute_exists", () => {
      const expression = {
        field: "email",
        type: "attribute_exists",
      } as const;
      expect(getReadableExpression(expression)).toBe("(attribute_exists(email))");
    });

    it("should format attribute_not_exists", () => {
      const expression = {
        field: "deletedAt",
        type: "attribute_not_exists",
      } as const;
      expect(getReadableExpression(expression)).toBe("(attribute_not_exists(deletedAt))");
    });

    it("should format attribute_type", () => {
      const expression = {
        field: "age",
        type: "attribute_type",
        attributeType: "N",
      } as const;
      expect(getReadableExpression(expression)).toBe('(attribute_type(age, "N"))');
    });

    it("should format contains", () => {
      const expression = {
        field: "interests",
        type: "contains",
        value: "reading",
      } as const;
      expect(getReadableExpression(expression)).toBe('(contains(interests, "reading"))');
    });

    it("should format begins_with", () => {
      const expression = {
        field: "email",
        type: "begins_with",
        value: "john",
      } as const;
      expect(getReadableExpression(expression)).toBe('(begins_with(email, "john"))');
    });
  });

  describe("logical operators", () => {
    it("should format AND operator", () => {
      const expression = {
        operator: "AND",
        expressions: [
          { field: "age", operator: ">", value: 18 },
          { field: "status", operator: "=", value: "active" },
        ],
      };
      expect(getReadableExpression(expression)).toBe('((age > 18) AND (status = "active"))');
    });

    it("should format OR operator", () => {
      const expression = {
        operator: "OR",
        expressions: [
          { field: "status", operator: "=", value: "active" },
          { field: "status", operator: "=", value: "pending" },
        ],
      };
      expect(getReadableExpression(expression)).toBe('((status = "active") OR (status = "pending"))');
    });

    it("should format NOT operator", () => {
      const expression = {
        operator: "NOT",
        expressions: [{ field: "status", operator: "=", value: "deleted" }],
      };
      expect(getReadableExpression(expression)).toBe('(NOT (status = "deleted"))');
    });
  });

  describe("size function", () => {
    it("should format size condition", () => {
      const expression = {
        field: "items",
        type: "size",
        operator: ">",
        value: 0,
      };
      expect(getReadableExpression(expression)).toBe("(size(items) > 0)");
    });
  });

  describe("error cases", () => {
    it("should throw error for unknown expression type", () => {
      const expression = {
        field: "test",
        type: "unknown_type",
      };
      // @ts-expect-error intentionally incorrect
      expect(() => getReadableExpression(expression)).toThrow("Unknown expression type");
    });
  });
});
