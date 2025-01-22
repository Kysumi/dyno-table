import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExpressionBuilder } from "../expression-builder";
import { ScanBuilder } from "../scan-builder";
import type { DynamoQueryResponse } from "../../dynamo/dynamo-service";
import type { DynamoRecord } from "../types";

const indexes = {
  primary: {
    pkName: "id",
  },
  GSI1: {
    pkName: "status",
  },
};

describe("ScanBuilder", () => {
  let expressionBuilder: ExpressionBuilder;
  let mockExecute: ReturnType<typeof vi.fn>;
  let scanBuilder: ScanBuilder<TestRecord, keyof typeof indexes>;

  interface TestRecord extends DynamoRecord {
    id: string;
    status: string;
    count: number;
  }

  beforeEach(() => {
    mockExecute = vi.fn().mockResolvedValue({ Items: [] });
    expressionBuilder = new ExpressionBuilder();
    scanBuilder = new ScanBuilder<TestRecord, keyof typeof indexes>(expressionBuilder, indexes, mockExecute);
  });

  describe("scan construction", () => {
    it("should build a basic scan operation", async () => {
      await scanBuilder.execute();

      expect(mockExecute).toHaveBeenCalledWith({
        filter: undefined,
        limit: undefined,
        indexName: undefined,
        exclusiveStartKey: undefined,
        consistentRead: false,
      });
    });

    it("should apply pagination limit", async () => {
      const limit = 10;
      await scanBuilder.limit(limit).execute();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
        }),
      );
    });

    it("should use specified index", async () => {
      const indexName = "GSI1";
      await scanBuilder.useIndex(indexName).execute();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          indexName: "GSI1",
        }),
      );
    });

    it("should throw error for invalid index", () => {
      expect(() => {
        // @ts-expect-error - we want to test the error case
        scanBuilder.useIndex("invalid-index" as string);
      }).toThrow('Index "invalid-index" is not configured for this table.');
    });
  });

  describe("filter conditions", () => {
    it("should build simple equality filter", async () => {
      await scanBuilder.where("status", "=", "active").execute();

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
      await scanBuilder.where("count", ">", 5).where("status", "=", "active").execute();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            expression: "#n0 > :v0 AND #n1 = :v1",
            names: { "#n0": "count", "#n1": "status" },
            values: { ":v0": 5, ":v1": "active" },
          },
        }),
      );
    });

    it("should build BETWEEN filter", async () => {
      await scanBuilder.whereBetween("count", 5, 10).execute();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            expression: "#n0 BETWEEN :v0[0] AND :v0[1]",
            names: { "#n0": "count" },
            values: { ":v0": [5, 10] },
          },
        }),
      );
    });

    it("should build IN filter", async () => {
      await scanBuilder.whereIn("status", ["active", "pending"]).execute();

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
      await scanBuilder.whereExists("status").execute();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            expression: "attribute_exists(#n0)",
            names: { "#n0": "status" },
          },
        }),
      );
    });

    it("should handle not exists conditions", async () => {
      await scanBuilder.whereNotExists("deletedAt").execute();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            expression: "attribute_not_exists(#n0)",
            names: { "#n0": "deletedAt" },
          },
        }),
      );
    });
  });

  describe("pagination", () => {
    it("should handle pagination correctly", async () => {
      const mockResponse: DynamoQueryResponse = {
        Items: [{ id: "1", status: "active", count: 10 }],
        LastEvaluatedKey: { id: "1" },
      };

      mockExecute.mockResolvedValueOnce(mockResponse);

      const paginator = scanBuilder.paginate();
      const page = await paginator.getPage();

      expect(page.items).toEqual(mockResponse.Items);
      expect(page.nextPageToken).toEqual(mockResponse.LastEvaluatedKey);
      expect(paginator.hasNextPage()).toBe(true);
    });

    it("should start from specified key", async () => {
      const startKey = { id: "start-key" };
      await scanBuilder.startKey(startKey).execute();

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          exclusiveStartKey: startKey,
        }),
      );
    });
  });

  describe("error handling", () => {
    it("should propagate errors from execute function", async () => {
      const error = new Error("Test error");
      mockExecute.mockRejectedValueOnce(error);

      await expect(scanBuilder.execute()).rejects.toThrow("Test error");
    });
  });

  describe("method chaining", () => {
    it("should maintain correct order of operations", async () => {
      const scan = scanBuilder.useIndex("GSI1").where("status", "=", "active").limit(10);

      expect(scan).toBe(scanBuilder); // Test method chaining

      await scan.execute();

      expect(mockExecute).toHaveBeenCalledWith({
        filter: {
          expression: "#n0 = :v0",
          names: { "#n0": "status" },
          values: { ":v0": "active" },
        },
        indexName: "GSI1",
        limit: 10,
        exclusiveStartKey: undefined,
        consistentRead: false,
      });
    });
  });
});
