import { describe, expect, test } from "vitest";
import { ConditionalConstraintBuilder } from "../conditional-constraint-builder";

describe("ConditionalConstraintBuilder", () => {
  test("should build simple equality condition for dinosaur name", () => {
    const builder = new ConditionalConstraintBuilder();
    builder.where("species", "=", "T-Rex");

    const result = builder.getExpression();
    expect(result).toEqual({
      expression: "#0 = :0",
      names: { "#0": "species" },
      values: { ":0": "T-Rex" },
    });
  });

  test("should handle nested field paths for dinosaur attributes", () => {
    const builder = new ConditionalConstraintBuilder();
    builder.where("dinosaur.physical.height", "=", "20");

    const result = builder.getExpression();
    expect(result).toEqual({
      expression: "#0.#1.#2 = :0",
      names: { "#0": "dinosaur", "#1": "physical", "#2": "height" },
      values: { ":0": "20" },
    });
  });

  test("should combine multiple conditions with AND", () => {
    const builder = new ConditionalConstraintBuilder();
    builder.where("age", ">", 65000000).where("diet", "=", "carnivore");

    const result = builder.getExpression();
    expect(result).toEqual({
      expression: "#0 > :0 AND #1 = :1",
      names: { "#0": "age", "#1": "diet" },
      values: { ":0": 65000000, ":1": "carnivore" },
    });
  });

  test("should handle OR conditions", () => {
    const builder = new ConditionalConstraintBuilder();
    builder.where("period", "=", "Jurassic").orWhere("period", "=", "Cretaceous");

    const result = builder.getExpression();
    expect(result).toEqual({
      expression: "#0 = :0 OR #0 = :1",
      names: { "#0": "period" },
      values: { ":0": "Jurassic", ":1": "Cretaceous" },
    });
  });

  test("should build IN condition for multiple dinosaur habitats", () => {
    const builder = new ConditionalConstraintBuilder();
    builder.whereIn("habitat", ["forest", "coastal", "swamp"]);

    const result = builder.getExpression();
    expect(result).toEqual({
      expression: "#0 IN (:0, :1, :2)",
      names: { "#0": "habitat" },
      values: { ":0": "forest", ":1": "coastal", ":2": "swamp" },
    });
  });

  test("should handle size function with pack size", () => {
    const builder = new ConditionalConstraintBuilder();
    builder.whereSize("pack.members", ">", 3);

    const result = builder.getExpression();
    expect(result).toEqual({
      expression: "size(#0.#1) > :0",
      names: { "#0": "pack", "#1": "members" },
      values: { ":0": 3 },
    });
  });

  test("should handle between condition for dinosaur weight", () => {
    const builder = new ConditionalConstraintBuilder();
    builder.whereBetween("weight", 1000, 5000);

    const result = builder.getExpression();
    expect(result).toEqual({
      expression: "#0 BETWEEN :0 AND :1",
      names: { "#0": "weight" },
      values: { ":0": 1000, ":1": 5000 },
    });
  });

  test("should handle begins_with function for species classification", () => {
    const builder = new ConditionalConstraintBuilder();
    builder.whereBeginsWith("classification.genus", "Tyranno");

    const result = builder.getExpression();
    expect(result).toEqual({
      expression: "begins_with(#0.#1, :0)",
      names: { "#0": "classification", "#1": "genus" },
      values: { ":0": "Tyranno" },
    });
  });

  test("should handle complex nested expressions with mixed conjunctions", () => {
    const builder = new ConditionalConstraintBuilder();
    builder
      .where("species", "=", "Raptor")
      .whereExpression((nested) => nested.where("height", ">", 6).orWhere("juvenile", "=", true))
      .orWhereExpression((nested) => nested.whereIsNotNull("lastSeen").orWhereContains("territory", "Island"))
      .orWhereSize("territory", ">", 1);

    const result = builder.getExpression();
    expect(result).toEqual({
      expression:
        "(#0 = :0 AND #1 > :1 OR #2 = :2) OR (NOT attribute_type(#3, NULL) OR contains(#4, :3)) OR size(#4) > :4",
      names: {
        "#0": "species",
        "#1": "height",
        "#2": "juvenile",
        "#3": "lastSeen",
        "#4": "territory",
      },
      values: {
        ":0": "Raptor",
        ":1": 6,
        ":2": true,
        ":3": "Island",
        ":4": 1,
      },
    });
  });

  test("should handle attribute existence checks", () => {
    const builder = new ConditionalConstraintBuilder();
    builder.whereAttributeExists("features.feathers");

    const result = builder.getExpression();
    expect(result).toEqual({
      expression: "attribute_exists(#0.#1)",
      names: { "#0": "features", "#1": "feathers" },
    });
  });

  test("should handle null checks", () => {
    const builder = new ConditionalConstraintBuilder();
    builder.whereIsNull("extinctionDate").orWhereIsNotNull("lastSighting");

    const result = builder.getExpression();
    expect(result).toEqual({
      expression: "attribute_type(#0, NULL) OR NOT attribute_type(#1, NULL)",
      names: { "#0": "extinctionDate", "#1": "lastSighting" },
    });
  });

  test("should handle attribute not exists checks", () => {
    const builder = new ConditionalConstraintBuilder();
    builder.whereAttributeNotExists("features.wings");

    const result = builder.getExpression();
    expect(result).toEqual({
      expression: "attribute_not_exists(#0.#1)",
      names: { "#0": "features", "#1": "wings" },
    });
  });

  test("should return null for empty builder", () => {
    const builder = new ConditionalConstraintBuilder();
    const result = builder.getExpression();
    expect(result).toBeNull();
  });

  test("should handle whereNot condition", () => {
    const builder = new ConditionalConstraintBuilder();
    builder.whereNot("status", "=", "extinct");

    const result = builder.getExpression();
    expect(result).toEqual({
      expression: "NOT (#0 = :0)",
      names: { "#0": "status" },
      values: { ":0": "extinct" },
    });
  });

  test("should handle orWhereNot condition", () => {
    const builder = new ConditionalConstraintBuilder();
    builder.where("species", "=", "T-Rex").orWhereNot("age", "<", 1000);

    const result = builder.getExpression();
    expect(result).toEqual({
      expression: "#0 = :0 OR NOT (#1 < :1)",
      names: { "#0": "species", "#1": "age" },
      values: { ":0": "T-Rex", ":1": 1000 },
    });
  });

  test("should handle attribute type checks", () => {
    const builder = new ConditionalConstraintBuilder();
    builder.whereAttributeType("metadata", "S");

    const result = builder.getExpression();
    expect(result).toEqual({
      expression: "attribute_type(#0, S)",
      names: { "#0": "metadata" },
    });
  });

  test("should handle orWhereAttributeType condition", () => {
    const builder = new ConditionalConstraintBuilder();
    builder.where("active", "=", true).orWhereAttributeType("count", "N");

    const result = builder.getExpression();
    expect(result).toEqual({
      expression: "#0 = :0 OR attribute_type(#1, N)",
      names: { "#0": "active", "#1": "count" },
      values: { ":0": true },
    });
  });

  test("should handle orWhereSize condition", () => {
    const builder = new ConditionalConstraintBuilder();
    builder.where("type", "=", "carnivore").orWhereSize("teeth", ">", 50);

    const result = builder.getExpression();
    expect(result).toEqual({
      expression: "#0 = :0 OR size(#1) > :1",
      names: { "#0": "type", "#1": "teeth" },
      values: { ":0": "carnivore", ":1": 50 },
    });
  });

  test("should handle orWhereContains condition", () => {
    const builder = new ConditionalConstraintBuilder();
    builder.where("period", "=", "Jurassic").orWhereContains("features", "scales");

    const result = builder.getExpression();
    expect(result).toEqual({
      expression: "#0 = :0 OR contains(#1, :1)",
      names: { "#0": "period", "#1": "features" },
      values: { ":0": "Jurassic", ":1": "scales" },
    });
  });

  test("should handle orWhereBeginsWith condition", () => {
    const builder = new ConditionalConstraintBuilder();
    builder.where("class", "=", "reptile").orWhereBeginsWith("name", "Tyranno");

    const result = builder.getExpression();
    expect(result).toEqual({
      expression: "#0 = :0 OR begins_with(#1, :1)",
      names: { "#0": "class", "#1": "name" },
      values: { ":0": "reptile", ":1": "Tyranno" },
    });
  });

  test("should handle nested whereExpression with no conditions", () => {
    const builder = new ConditionalConstraintBuilder();
    builder.where("species", "=", "Raptor").whereExpression(() => {});

    const result = builder.getExpression();
    expect(result).toEqual({
      expression: "#0 = :0",
      names: { "#0": "species" },
      values: { ":0": "Raptor" },
    });
  });

  test("should handle shared names and values across nested expressions", () => {
    const builder = new ConditionalConstraintBuilder();
    builder.where("species", "=", "Raptor").whereExpression((nested) => {
      nested.where("species", "=", "Raptor"); // Reusing same value
    });

    const result = builder.getExpression();
    expect(result).toEqual({
      expression: "#0 = :0 AND #0 = :0", // Should reuse the same placeholder
      names: { "#0": "species" },
      values: { ":0": "Raptor" },
    });
  });

  test("should generate readable debug expression", () => {
    const builder = new ConditionalConstraintBuilder();
    builder
      .where("age", ">", 21)
      .orWhere("status", "=", "active")
      .whereExpression((nested) => nested.where("role", "=", "admin").where("permissions.admin", "=", true));

    const result = builder.getDebugExpression();
    expect(result).toBe("(age > 21 OR status = 'active') AND (role = 'admin' AND permissions.admin = true)");
  });

  test("should return null debug expression for empty builder", () => {
    const builder = new ConditionalConstraintBuilder();
    const result = builder.getDebugExpression();
    expect(result).toBeNull();
  });

  describe("getDebugExpression", () => {
    test("should format simple conditions", () => {
      const builder = new ConditionalConstraintBuilder();
      builder.where("age", ">", 21).where("isActive", "=", true).orWhere("role", "=", "admin");

      const result = builder.getDebugExpression();
      expect(result).toBe("(age > 21 AND isActive = true) OR (role = 'admin')");
    });

    test("should format conditions with special characters", () => {
      const builder = new ConditionalConstraintBuilder();
      builder.where("user.name", "=", "John O'Connor").where("user.email", "=", "john@example.com");

      const result = builder.getDebugExpression();
      expect(result).toBe("user.name = 'John O'Connor' AND user.email = 'john@example.com'");
    });

    test("should format deeply nested conditions", () => {
      const builder = new ConditionalConstraintBuilder();
      builder
        .where("status", "=", "active")
        .whereExpression((nested1) => {
          nested1.where("age", ">", 18).orWhereExpression((nested2) => {
            nested2.where("parentConsent", "=", true).where("parentEmail", "<>", null);
          });
        })
        .orWhereExpression((nested3) => {
          nested3.whereAttributeExists("premium").whereExpression((nested4) => {
            nested4.where("subscriptionType", "=", "annual").orWhere("credits", ">", 1000);
          });
        });

      const result = builder.getDebugExpression();
      expect(result).toBe(
        "(status = 'active' AND age > 18 OR parentConsent = true AND parentEmail <> null) OR " +
          "(attribute_exists(premium) AND subscriptionType = 'annual' OR credits > 1000)",
      );
    });

    test("should format mixed type conditions", () => {
      const builder = new ConditionalConstraintBuilder();
      builder
        .where("count", ">", 100)
        .where("isEnabled", "=", true)
        .where("tags", "=", ["important", "urgent"])
        .where("lastUpdated", "=", "2023-01-01")
        .where("score", "=", 4.5);

      const result = builder.getDebugExpression();
      expect(result).toBe(
        "count > 100 AND isEnabled = true AND tags = ['important','urgent'] AND " +
          "lastUpdated = '2023-01-01' AND score = 4.5",
      );
    });

    test("should format complex function conditions", () => {
      const builder = new ConditionalConstraintBuilder();
      builder
        .whereSize("items", ">", 5)
        .whereContains("description", "important")
        .whereBeginsWith("id", "user_")
        .whereAttributeType("metadata", "M")
        .whereIn("status", ["pending", "processing", "completed"]);

      const result = builder.getDebugExpression();
      expect(result).toBe(
        "size(items) > 5 AND contains(description, 'important') AND begins_with(id, 'user_') AND " +
          "attribute_type(metadata, M) AND status IN ('pending', 'processing', 'completed')",
      );
    });

    test("should handle null and not exists conditions", () => {
      const builder = new ConditionalConstraintBuilder();
      builder.whereIsNull("deletedAt").whereAttributeNotExists("archivedAt").orWhereIsNotNull("completedAt");

      const result = builder.getDebugExpression();
      expect(result).toBe(
        "(attribute_type(deletedAt, NULL) AND attribute_not_exists(archivedAt)) OR " +
          "(NOT attribute_type(completedAt, NULL))",
      );
    });
  });

  describe("expression limits", () => {
    test("should throw error when exceeding 4KB expression length", () => {
      const builder = new ConditionalConstraintBuilder();

      // Generate a very long expression
      for (let i = 0; i < 1000; i++) {
        builder.where(`field${i}`, "=", `value${i}`);
      }

      expect(() => builder.getExpression()).toThrow("Condition expression exceeds maximum length of 4KB");
    });

    test("should throw error when exceeding 255 name placeholders", () => {
      const builder = new ConditionalConstraintBuilder();

      // Generate more than 255 unique field names
      for (let i = 0; i < 256; i++) {
        builder.where(`field${i}`, "=", "value");
      }

      expect(() => builder.getExpression()).toThrow(
        "Condition expression exceeds maximum of 255 attribute name placeholders",
      );
    });

    test("should throw error when exceeding 255 value placeholders", () => {
      const builder = new ConditionalConstraintBuilder();

      // Generate more than 255 unique values
      for (let i = 0; i < 256; i++) {
        builder.where("field", "=", `value${i}`);
      }

      expect(() => builder.getExpression()).toThrow(
        "Condition expression exceeds maximum of 255 attribute value placeholders",
      );
    });
  });
});
