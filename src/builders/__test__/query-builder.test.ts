import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Table } from "../../table";
import { ExpressionBuilder } from "../expression-builder";
import type { PrimaryKey } from "../operators";
import { QueryBuilder } from "../query-builder";

describe("QueryBuilder", () => {
	let table: Table;
	let expressionBuilder: ExpressionBuilder;
	let queryBuilder: QueryBuilder;

	const mockKey: PrimaryKey = {
		pk: "USER#123",
		sk: "PROFILE#123",
	};

	beforeEach(() => {
		vi.clearAllMocks();

		table = {
			nativeQuery: vi.fn().mockResolvedValue({ Items: [] }),
			getIndexConfig: vi.fn().mockReturnValue({
				pkName: "PK",
				skName: "SK",
			}),
		} as unknown as Table;

		expressionBuilder = new ExpressionBuilder();
		queryBuilder = new QueryBuilder(table, mockKey, expressionBuilder);
	});

	describe("query construction", () => {
		it("should build a basic query with primary key only", async () => {
			await queryBuilder.execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({
					filters: [],
					limit: undefined,
					indexName: undefined,
				}),
			);
		});

		it("should support begins_with sort key condition", async () => {
			const keyWithBeginsWith: PrimaryKey = {
				pk: "USER#123",
				sk: { operator: "begins_with", value: "ORDER#" },
			};

			const beginsWith = new QueryBuilder(
				table,
				keyWithBeginsWith,
				expressionBuilder,
			);
			await beginsWith.execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				keyWithBeginsWith,
				expect.any(Object),
			);
		});

		it("should apply pagination limit", async () => {
			const limit = 10;
			await queryBuilder.limit(limit).execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({ limit }),
			);
		});

		it("should use specified index", async () => {
			const indexName = "GSI1";
			await queryBuilder.useIndex(indexName).execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({ indexName }),
			);
		});
	});

	describe("filter conditions", () => {
		it("should build simple equality filter", async () => {
			await queryBuilder.where("status", "=", "active").execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({
					filters: [{ field: "status", operator: "=", value: "active" }],
				}),
			);
		});

		it("should build comparison filters", async () => {
			await queryBuilder
				.where("age", ">", 18)
				.where("score", "<=", 100)
				.execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({
					filters: [
						{ field: "age", operator: ">", value: 18 },
						{ field: "score", operator: "<=", value: 100 },
					],
				}),
			);
		});

		it("should build BETWEEN filter", async () => {
			await queryBuilder.whereBetween("age", 18, 65).execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({
					filters: [{ field: "age", operator: "BETWEEN", value: [18, 65] }],
				}),
			);
		});

		it("should build IN filter", async () => {
			const statuses = ["active", "pending"];
			await queryBuilder.whereIn("status", statuses).execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({
					filters: [{ field: "status", operator: "IN", value: statuses }],
				}),
			);
		});

		it("should handle attribute_exists condition", async () => {
			await queryBuilder.whereExists("email").execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({
					filters: [{ field: "email", operator: "attribute_exists" }],
				}),
			);
		});

		it("should handle attribute_not_exists condition", async () => {
			await queryBuilder.whereNotExists("deletedAt").execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({
					filters: [{ field: "deletedAt", operator: "attribute_not_exists" }],
				}),
			);
		});

		it("should handle contains filter", async () => {
			await queryBuilder.where("tags", "contains", "premium").execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({
					filters: [{ field: "tags", operator: "contains", value: "premium" }],
				}),
			);
		});

		it("should handle begins_with filter", async () => {
			await queryBuilder.where("name", "begins_with", "Jo").execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({
					filters: [{ field: "name", operator: "begins_with", value: "Jo" }],
				}),
			);
		});
	});

	describe("complex queries", () => {
		it("should combine multiple conditions with index and limit", async () => {
			await queryBuilder
				.useIndex("GSI1")
				.where("status", "=", "active")
				.where("age", ">", 18)
				.whereExists("email")
				.limit(10)
				.execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({
					indexName: "GSI1",
					limit: 10,
					filters: [
						{ field: "status", operator: "=", value: "active" },
						{ field: "age", operator: ">", value: 18 },
						{ field: "email", operator: "attribute_exists" },
					],
				}),
			);
		});

		it("should handle nested attribute paths in filters", async () => {
			await queryBuilder
				.where("user.profile.age", ">", 18)
				.where("user.settings.notifications", "=", true)
				.execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({
					filters: [
						{ field: "user.profile.age", operator: ">", value: 18 },
						{
							field: "user.settings.notifications",
							operator: "=",
							value: true,
						},
					],
				}),
			);
		});
	});

	describe("error handling", () => {
		it("should propagate database errors", async () => {
			const error = new Error("Database error");
			table.nativeQuery = vi.fn().mockRejectedValue(error);

			await expect(queryBuilder.execute()).rejects.toThrow("Database error");
		});

		it("should handle invalid filter combinations gracefully", async () => {
			table.nativeQuery = vi
				.fn()
				.mockRejectedValue(new Error("Invalid FilterExpression"));

			await expect(
				queryBuilder
					.where("age", ">", 18)
					.where("age", "<", 10) // Contradictory condition
					.execute(),
			).rejects.toThrow("Invalid FilterExpression");
		});
	});

	describe("method chaining", () => {
		it("should maintain correct order of operations", async () => {
			const query = queryBuilder
				.useIndex("GSI1")
				.where("status", "=", "active")
				.limit(10);

			expect(query).toBe(queryBuilder); // Test method chaining

			await query.execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({
					indexName: "GSI1",
					limit: 10,
					filters: [{ field: "status", operator: "=", value: "active" }],
				}),
			);
		});

		it("should override previous values when methods are called multiple times", async () => {
			await queryBuilder
				.limit(10)
				.limit(20) // Should override previous limit
				.useIndex("GSI1")
				.useIndex("GSI2") // Should override previous index
				.execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({
					limit: 20,
					indexName: "GSI2",
				}),
			);
		});
	});

	describe("query execution", () => {
		it("should pass correct parameters to table.nativeQuery", async () => {
			const mockResult = {
				Items: [{ id: 1 }, { id: 2 }],
				Count: 2,
				ScannedCount: 2,
			};

			table.nativeQuery = vi.fn().mockResolvedValue(mockResult);

			const result = await queryBuilder
				.where("status", "=", "active")
				.limit(10)
				.execute();

			expect(result).toEqual(mockResult);
			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({
					filters: [{ field: "status", operator: "=", value: "active" }],
					limit: 10,
				}),
			);
		});
	});
});
