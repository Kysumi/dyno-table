import { KeyConditionBuilder } from "../key-condition-builer";
import type { Table } from "../../table";
import type { PrimaryKey, TableIndexConfig } from "../operators";
import { describe, it, expect } from "vitest";

// Mock Table implementation
class MockTable {
  private indexes: Record<string, TableIndexConfig> = {
    primary: { pkName: "PK", skName: "SK" },
    GSI1: { pkName: "GSI1PK", skName: "GSI1SK" },
    GSI2: { pkName: "GSI2PK" }, // No sort key
  };

  getIndexConfig(indexName: string): TableIndexConfig {
    return this.indexes[indexName];
  }
}

describe("KeyConditionBuilder", () => {
  const mockTable = new MockTable();

  describe("Basic Functionality", () => {
    it("should build simple primary key condition", () => {
      const builder = new KeyConditionBuilder(mockTable as unknown as Table<string>);
      const result = builder.partitionKey("test").build();

      expect(result.expression).toBe("#pk = :pk");
      expect(result.names).toEqual({ "#pk": "PK" });
      expect(result.values).toEqual({ ":pk": "test" });
    });

    it("should build composite key condition with equals operator", () => {
      const builder = new KeyConditionBuilder(mockTable as unknown as Table<string>);
      const result = builder.partitionKey("test").sortKey("=", "sortValue").build();

      expect(result.expression).toBe("#pk = :pk AND #sk = :sk");
      expect(result.values).toEqual({ ":pk": "test", ":sk": "sortValue" });
    });
  });

  describe("Sort Key Operators", () => {
    it("should handle BETWEEN operator", () => {
      const builder = new KeyConditionBuilder(mockTable as unknown as Table<string>);
      const result = builder.partitionKey("test").sortKey("between", ["start", "end"]).build();

      expect(result.expression).toBe("#pk = :pk AND #sk BETWEEN :sk_lower AND :sk_upper");
      expect(result.values).toEqual({
        ":pk": "test",
        ":sk_lower": "start",
        ":sk_upper": "end",
      });
    });

    it("should handle BEGINS_WITH operator", () => {
      const builder = new KeyConditionBuilder(mockTable as unknown as Table<string>);
      const result = builder.partitionKey("test").sortKey("begins_with", "prefix").build();

      expect(result.expression).toBe("#pk = :pk AND BEGINS_WITH(#sk, :sk)");
      expect(result.values).toEqual({ ":pk": "test", ":sk": "prefix" });
    });

    it("should handle comparison operators", () => {
      const operators = ["<", "<=", ">", ">="] as const;
      for (const op of operators) {
        const builder = new KeyConditionBuilder(mockTable as unknown as Table<string>);
        const result = builder.partitionKey("test").sortKey(op, 100).build();

        expect(result.expression).toBe(`#pk = :pk AND #sk ${op} :sk`);
        expect(result.values).toEqual({ ":pk": "test", ":sk": 100 });
      }
    });
  });

  describe("Index Handling", () => {
    it("should switch to secondary index", () => {
      const builder = new KeyConditionBuilder(mockTable as unknown as Table<string>)
        .useIndex("GSI1")
        .partitionKey("gsi1Value");

      const result = builder.build();

      // @ts-expect-error
      expect(result.names["#pk"]).toBe("GSI1PK");
      expect(result.expression).toBe("#pk = :pk");
    });

    it("should throw error when using sort key with index that has no sort key", () => {
      const builder = new KeyConditionBuilder(mockTable as unknown as Table<string>)
        .useIndex("GSI2")
        .partitionKey("test")
        .sortKey("=", "value");

      expect(() => builder.build()).toThrowError("Sort key is not supported for the index GSI2");
    });
  });

  describe("Error Handling", () => {
    it("should throw when missing partition key", () => {
      const builder = new KeyConditionBuilder(mockTable as unknown as Table<string>);
      expect(() => builder.build()).toThrowError("Key condition is required");
    });

    it("should validate BETWEEN operator values", () => {
      const builder = new KeyConditionBuilder(mockTable as unknown as Table<string>);
      // biome-ignore lint/suspicious/noExplicitAny: Providing intentionally invalid values
      expect(() => builder.sortKey("between", ["invalid"] as any)).toThrowError(
        "Between operator requires an array with two values",
      );
    });
  });

  describe("Constructor Initialization", () => {
    it("should initialize with primary key object", () => {
      const primaryKey: PrimaryKey = {
        pk: "test",
        sk: { operator: "begins_with", value: "prefix" },
      };

      const builder = new KeyConditionBuilder(mockTable as unknown as Table<string>, primaryKey);
      const result = builder.build();

      expect(result.expression).toBe("#pk = :pk AND BEGINS_WITH(#sk, :sk)");
    });

    it("should handle string sort key shorthand", () => {
      const primaryKey: PrimaryKey = { pk: "test", sk: "sortValue" };
      const builder = new KeyConditionBuilder(mockTable as unknown as Table<string>, primaryKey);
      const result = builder.build();

      expect(result.expression).toBe("#pk = :pk AND #sk = :sk");
    });
  });
});
