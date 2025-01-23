import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExpressionBuilder } from "../expression-builder";
import type { PrimaryKey, TableIndexConfig } from "../operators";
import { QueryBuilder } from "../query-builder";

const indexes = {
  primary: {
    pkName: "pk",
    skName: "sk",
  },
  GSI1: {
    pkName: "gsi1pk",
    skName: "gsi1sk",
  },
};

describe("QueryBuilder", () => {
  let expressionBuilder: ExpressionBuilder;
  let mockExecute: ReturnType<typeof vi.fn>;
  let queryBuilder: QueryBuilder<Record<string, unknown>, keyof typeof indexes>;

  const mockKey: PrimaryKey = {
    pk: "SPECIES#trex",
    sk: "SPECIMEN#rex001",
  };

  beforeEach(() => {
    mockExecute = vi.fn().mockResolvedValue({ Items: [] });
    expressionBuilder = new ExpressionBuilder();
    queryBuilder = new QueryBuilder(mockKey, indexes, expressionBuilder, mockExecute);
  });

  describe("query construction", () => {
    it("should build a basic query with primary key only", async () => {
      queryBuilder = new QueryBuilder({ pk: "SPECIES#trex" }, indexes, expressionBuilder, mockExecute);
      await queryBuilder.execute();

      expect(mockExecute).toHaveBeenCalledWith({
        filter: undefined,
        indexName: "primary",
        limit: undefined,
        keyCondition: {
          expression: "#pk0 = :pk0",
          names: { "#pk0": "pk" },
          values: { ":pk0": "SPECIES#trex" },
        },
        consistentRead: false,
        exclusiveStartKey: undefined,
        sortDirection: "asc",
      });
    });

    it("should support begins_with sort key condition", async () => {
      const key: PrimaryKey = {
        pk: "SPECIES#trex",
        sk: { operator: "begins_with", value: "SPECIMEN#" },
      };

      const beginsWith = new QueryBuilder(key, indexes, expressionBuilder, mockExecute);
      await beginsWith.execute();

      expect(mockExecute).toHaveBeenCalledWith({
        exclusiveStartKey: undefined,
        filter: undefined,
        indexName: "primary",
        limit: undefined,
        keyCondition: {
          expression: "#pk0 = :pk0 AND begins_with(#sk1, :sk1)",
          names: {
            "#pk0": "pk",
            "#sk1": "sk",
          },
          values: {
            ":pk0": "SPECIES#trex",
            ":sk1": "SPECIMEN#",
          },
        },
        consistentRead: false,
        sortDirection: "asc",
      });
    });

    it("should apply pagination limit", async () => {
      const limit = 10;
      await queryBuilder.limit(limit).execute();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
        }),
      );
    });

    it("should use specified index", async () => {
      const indexName = "GSI1";
      await queryBuilder.useIndex(indexName).execute();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          indexName: "GSI1",
        }),
      );
    });
  });

  describe("filter conditions", () => {
    it("should build simple equality filter", async () => {
      await queryBuilder.where("diet", "=", "carnivore").execute();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            expression: "#n0 = :v0",
            names: { "#n0": "diet" },
            values: { ":v0": "carnivore" },
          },
        }),
      );
    });

    it("should build comparison filters", async () => {
      await queryBuilder.where("weight", ">", 1000).where("length", "<=", 40).execute();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            expression: "#n0 > :v0 AND #n1 <= :v1",
            names: { "#n0": "weight", "#n1": "length" },
            values: { ":v0": 1000, ":v1": 40 },
          },
        }),
      );
    });

    it("should build BETWEEN filter", async () => {
      await queryBuilder.whereBetween("weight", 1000, 5000).execute();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            expression: "#n0 BETWEEN :v0[0] AND :v0[1]",
            names: { "#n0": "weight" },
            values: { ":v0": [1000, 5000] },
          },
        }),
      );
    });

    it("should build IN filter", async () => {
      await queryBuilder.whereIn("period", ["Jurassic", "Cretaceous"]).execute();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            expression: "#n0 IN (:v0)",
            names: { "#n0": "period" },
            values: { ":v0": ["Jurassic", "Cretaceous"] },
          },
        }),
      );
    });

    it("should handle exists conditions", async () => {
      await queryBuilder.whereExists("fossilLocation").execute();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            expression: "attribute_exists(#n0)",
            names: { "#n0": "fossilLocation" },
          },
        }),
      );
    });

    it("should handle not exists conditions", async () => {
      await queryBuilder.whereNotExists("extinctionDate").execute();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            expression: "attribute_not_exists(#n0)",
            names: { "#n0": "extinctionDate" },
          },
        }),
      );
    });

    it("should handle nested attribute paths in filters", async () => {
      await queryBuilder
        .where("specimen.measurements.height", ">", 3)
        .where("specimen.features.feathers", "=", true)
        .execute();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            expression: "#n0.#n1.#n2 > :v0 AND #n0.#n3.#n4 = :v1",
            names: {
              "#n0": "specimen",
              "#n1": "measurements",
              "#n2": "height",
              "#n3": "features",
              "#n4": "feathers",
            },
            values: { ":v0": 3, ":v1": true },
          },
        }),
      );
    });
  });

  describe("error handling", () => {
    it("should propagate errors from execute function", async () => {
      const error = new Error("Test error");
      mockExecute.mockRejectedValueOnce(error);

      await expect(queryBuilder.execute()).rejects.toThrow("Test error");
    });
  });

  describe("method chaining", () => {
    it("should maintain correct order of operations", async () => {
      const query = queryBuilder.useIndex("GSI1").where("diet", "=", "carnivore").limit(10);

      expect(query).toBe(queryBuilder); // Test method chaining

      await query.execute();

      expect(mockExecute).toHaveBeenCalledWith({
        keyCondition: expect.any(Object),
        indexName: "GSI1",
        limit: 10,
        filter: {
          expression: "#n0 = :v0",
          names: { "#n0": "diet" },
          values: { ":v0": "carnivore" },
        },
        consistentRead: false,
        sortDirection: "asc",
      });
    });
  });
});
