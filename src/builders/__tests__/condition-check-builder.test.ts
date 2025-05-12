import { describe, it, expect } from "vitest";
import { ConditionCheckBuilder } from "../condition-check-builder";
import { eq } from "../../conditions";

describe("ConditionCheckBuilder", () => {
  const tableName = "TestTable";
  const key = { pk: "123", sk: "456" };

  describe("constructor", () => {
    it("should create instance with table name and key", () => {
      const builder = new ConditionCheckBuilder(tableName, key);
      expect(builder).toBeInstanceOf(ConditionCheckBuilder);
    });
  });

  describe("condition", () => {
    it("should accept direct condition", () => {
      const builder = new ConditionCheckBuilder(tableName, key);
      const result = builder.condition(eq("status", "active"));
      expect(result).toBe(builder);
    });

    it("should accept condition function", () => {
      const builder = new ConditionCheckBuilder(tableName, key);
      const result = builder.condition((op) => op.eq("status", "active"));
      expect(result).toBe(builder);
    });

    it("should handle complex conditions", () => {
      const builder = new ConditionCheckBuilder(tableName, key);
      const result = builder.condition((op) => op.and(op.eq("status", "active"), op.attributeExists("lastLogin")));
      expect(result).toBe(builder);
    });
  });

  describe("toDynamoCommand", () => {
    it("should generate valid command parameters", () => {
      const builder = new ConditionCheckBuilder(tableName, key);
      builder.condition(eq("status", "active"));
      // @ts-expect-error - toDynamoCommand is private but we we are testing it to check the state handling
      const command = builder.toDynamoCommand();

      expect(command).toEqual({
        tableName,
        key,
        conditionExpression: expect.any(String),
        expressionAttributeNames: expect.any(Object),
        expressionAttributeValues: expect.any(Object),
      });
    });

    it("should throw error when condition is not set", () => {
      const builder = new ConditionCheckBuilder(tableName, key);
      // @ts-expect-error - toDynamoCommand is private but we we are testing it to check the state handling
      expect(() => builder.toDynamoCommand()).toThrow("Condition is required");
    });
  });

  describe("debug", () => {
    it("should return readable command representation", () => {
      const builder = new ConditionCheckBuilder(tableName, key);
      builder.condition(eq("status", "active"));

      const debug = builder.debug();

      expect(debug).toEqual({
        raw: {
          tableName,
          key,
          conditionExpression: "#0 = :0",
          expressionAttributeNames: { "#0": "status" },
          expressionAttributeValues: { ":0": "active" },
        },
        readable: {
          conditionExpression: 'status = "active"',
        },
      });
    });

    it("should throw error when condition is not set", () => {
      const builder = new ConditionCheckBuilder(tableName, key);
      expect(() => builder.debug()).toThrow("Condition is required");
    });
  });
});
