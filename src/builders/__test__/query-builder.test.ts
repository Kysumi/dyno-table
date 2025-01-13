import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExpressionBuilder } from "../expression-builder";
import type { PrimaryKey, TableIndexConfig } from "../operators";
import { QueryBuilder } from "../query-builder";

describe("QueryBuilder", () => {
  let expressionBuilder: ExpressionBuilder;
  let mockExecute: ReturnType<typeof vi.fn>;
  let queryBuilder: QueryBuilder;

  const mockKey: PrimaryKey = {
    pk: "USER#123",
    sk: "PROFILE#123",
  };

  const indexConfig: TableIndexConfig = {
    pkName: "pk",
    skName: "sk",
  };

  beforeEach(() => {
    mockExecute = vi.fn().mockResolvedValue({ Items: [] });
    expressionBuilder = new ExpressionBuilder();
    queryBuilder = new QueryBuilder(mockKey, indexConfig, expressionBuilder, mockExecute);
  });

  describe("query construction", () => {
    it("should build a basic query with primary key only", async () => {
      queryBuilder = new QueryBuilder({ pk: "USER" }, indexConfig, expressionBuilder, mockExecute);
      await queryBuilder.execute();

      expect(mockExecute).toHaveBeenCalledWith({
        type: "query",
        keyCondition: {
          expression: "#pk0 = :pk0",
          names: { "#pk0": "pk" },
          values: { ":pk0": "USER" },
        },
      });
    });

    it("should support begins_with sort key condition", async () => {
      const key: PrimaryKey = {
        pk: "USER#123",
        sk: { operator: "begins_with", value: "ORDER#" },
      };

      const beginsWith = new QueryBuilder(key, indexConfig, expressionBuilder, mockExecute);
      await beginsWith.execute();

      expect(mockExecute).toHaveBeenCalledWith({
        type: "query",
        limit: undefined,
        keyCondition: {
          expression: "#pk0 = :pk0 AND begins_with(#sk1, :v1)",
          names: {
            "#pk0": "pk",
            "#sk1": "sk",
          },
          values: {
            ":pk0": "USER#123",
            ":v1": "ORDER#",
          },
        },
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
      await queryBuilder.where("status", "=", "active").execute();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            expression: "#n0 = :v0",
            names: { "#n0": "status" },
            values: { ":v0": "active" },
          },
        }),
      );
    });

    it("should build comparison filters", async () => {
      await queryBuilder.where("age", ">", 18).where("score", "<=", 100).execute();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            expression: "#n0 > :v0 AND #n1 <= :v1",
            names: { "#n0": "age", "#n1": "score" },
            values: { ":v0": 18, ":v1": 100 },
          },
        }),
      );
    });

    it("should build BETWEEN filter", async () => {
      await queryBuilder.whereBetween("age", 18, 65).execute();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            expression: "#n0 BETWEEN :v0[0] AND :v0[1]",
            names: { "#n0": "age" },
            values: { ":v0": [18, 65] },
          },
        }),
      );
    });

    it("should build IN filter", async () => {
      await queryBuilder.whereIn("status", ["active", "pending"]).execute();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            expression: "#n0 IN (:v0)",
            names: { "#n0": "status" },
            values: { ":v0": ["active", "pending"] },
          },
        }),
      );
    });

    it("should handle exists conditions", async () => {
      await queryBuilder.whereExists("email").execute();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            expression: "attribute_exists(#n0)",
            names: { "#n0": "email" },
          },
        }),
      );
    });

    it("should handle not exists conditions", async () => {
      await queryBuilder.whereNotExists("deletedAt").execute();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            expression: "attribute_not_exists(#n0)",
            names: { "#n0": "deletedAt" },
          },
        }),
      );
    });

    it("should handle nested attribute paths in filters", async () => {
      await queryBuilder.where("user.profile.age", ">", 18).where("user.settings.notifications", "=", true).execute();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            expression: "#n0.#n1.#n2 > :v0 AND #n3.#n4.#n5 = :v1",
            names: {
              "#n0": "user",
              "#n1": "profile",
              "#n2": "age",
              "#n3": "user",
              "#n4": "settings",
              "#n5": "notifications",
            },
            values: { ":v0": 18, ":v1": true },
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
      const query = queryBuilder.useIndex("GSI1").where("status", "=", "active").limit(10);

      expect(query).toBe(queryBuilder); // Test method chaining

      await query.execute();

      expect(mockExecute).toHaveBeenCalledWith({
        type: "query",
        keyCondition: expect.any(Object),
        indexName: "GSI1",
        limit: 10,
        filter: {
          expression: "#n0 = :v0",
          names: { "#n0": "status" },
          values: { ":v0": "active" },
        },
      });
    });
  });
});
