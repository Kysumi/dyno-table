import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Table } from "../../table";
import { ExpressionBuilder } from "../expression-builder";
import type { PrimaryKey } from "../operators";
import { QueryBuilder } from "../query-builder";

vi.mock("../../table");

describe("QueryBuilder", () => {
	let table: Table;
	let expressionBuilder: ExpressionBuilder;
	let queryBuilder: QueryBuilder;

	const mockKey: PrimaryKey = {
		pk: "USER#123",
		sk: "PROFILE#123",
	};

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks();

		// Setup mocks
		table = {
			nativeQuery: vi.fn().mockResolvedValue({ Items: [] }),
		} as unknown as Table;

		expressionBuilder = new ExpressionBuilder();
		queryBuilder = new QueryBuilder(table, mockKey, expressionBuilder);
	});

	describe("basic query operations", () => {
		it("should create a basic query without conditions", async () => {
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

		it("should apply limit correctly", async () => {
			await queryBuilder.limit(10).execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({
					limit: 10,
				}),
			);
		});

		it("should use specified index", async () => {
			await queryBuilder.useIndex("GSI1").execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({
					indexName: "GSI1",
				}),
			);
		});
	});

	describe("where conditions", () => {
		it("should add simple equality condition", async () => {
			await queryBuilder.where("status", "=", "active").execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({
					filters: [{ field: "status", operator: "=", value: "active" }],
				}),
			);
		});

		it("should chain multiple where conditions", async () => {
			await queryBuilder
				.where("status", "=", "active")
				.where("age", ">", 18)
				.execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({
					filters: [
						{ field: "status", operator: "=", value: "active" },
						{ field: "age", operator: ">", value: 18 },
					],
				}),
			);
		});

		it("should handle whereExists condition", async () => {
			await queryBuilder.whereExists("email").execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({
					filters: [{ field: "email", operator: "attribute_exists" }],
				}),
			);
		});

		it("should handle whereNotExists condition", async () => {
			await queryBuilder.whereNotExists("deletedAt").execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({
					filters: [{ field: "deletedAt", operator: "attribute_not_exists" }],
				}),
			);
		});

		it("should handle whereEquals condition", async () => {
			await queryBuilder.whereEquals("type", "user").execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({
					filters: [{ field: "type", operator: "=", value: "user" }],
				}),
			);
		});

		it("should handle whereBetween condition", async () => {
			await queryBuilder.whereBetween("age", 18, 65).execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({
					filters: [{ field: "age", operator: "BETWEEN", value: [18, 65] }],
				}),
			);
		});

		it("should handle whereIn condition", async () => {
			await queryBuilder.whereIn("status", ["active", "pending"]).execute();

			expect(table.nativeQuery).toHaveBeenCalledWith(
				mockKey,
				expect.objectContaining({
					filters: [
						{ field: "status", operator: "IN", value: ["active", "pending"] },
					],
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
	});

	describe("error handling", () => {
		it("should propagate errors from table.nativeQuery", async () => {
			const error = new Error("Database error");
			table.nativeQuery = vi.fn().mockRejectedValue(error);

			await expect(queryBuilder.execute()).rejects.toThrow("Database error");
		});
	});
});
