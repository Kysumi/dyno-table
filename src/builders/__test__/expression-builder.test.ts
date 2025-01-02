import { describe, it, expect, beforeEach } from "vitest";
import { ExpressionBuilder } from "../expression-builder";
import type { PrimaryKey, TableIndexConfig } from "../operators";

describe("ExpressionBuilder", () => {
	let builder: ExpressionBuilder;

	beforeEach(() => {
		builder = new ExpressionBuilder();
	});

	describe("buildKeyCondition", () => {
		const indexConfig: TableIndexConfig = {
			pkName: "PK",
			skName: "SK",
		};

		it("should build expression with partition key only", () => {
			const key: PrimaryKey = { pk: "USER#123" };
			const result = builder.buildKeyCondition(key, indexConfig);

			expect(result).toEqual({
				expression: "#pk = :pk",
				attributes: {
					names: { "#pk": "PK" },
					values: { ":pk": "USER#123" },
				},
			});
		});

		it("should build expression with partition key and sort key string", () => {
			const key: PrimaryKey = { pk: "USER#123", sk: "PROFILE#123" };
			const result = builder.buildKeyCondition(key, indexConfig);

			expect(result).toEqual({
				expression: "#pk = :pk AND #sk = :sk",
				attributes: {
					names: { "#pk": "PK", "#sk": "SK" },
					values: { ":pk": "USER#123", ":sk": "PROFILE#123" },
				},
			});
		});

		it("should build expression with begins_with sort key condition", () => {
			const key: PrimaryKey = {
				pk: "USER#123",
				sk: { operator: "begins_with", value: "ORDER#" },
			};
			const result = builder.buildKeyCondition(key, indexConfig);

			expect(result).toEqual({
				expression: "#pk = :pk AND begins_with(#sk, :sk)",
				attributes: {
					names: { "#pk": "PK", "#sk": "SK" },
					values: { ":pk": "USER#123", ":sk": "ORDER#" },
				},
			});
		});
	});

	describe("buildFilterExpression", () => {
		it("should build basic comparison filter", () => {
			const result = builder.buildFilterExpression([
				{ field: "age", operator: ">", value: 21 },
			]);

			expect(result).toEqual({
				expression: "#n0 > :v0",
				attributes: {
					names: { "#n0": "age" },
					values: { ":v0": 21 },
				},
			});
		});

		it("should build BETWEEN filter", () => {
			const result = builder.buildFilterExpression([
				{ field: "age", operator: "BETWEEN", value: [20, 30] },
			]);

			expect(result).toEqual({
				expression: "#n0 BETWEEN :v0[0] AND :v0[1]",
				attributes: {
					names: { "#n0": "age" },
					values: { ":v0": [20, 30] },
				},
			});
		});

		it("should build IN filter", () => {
			const result = builder.buildFilterExpression([
				{ field: "status", operator: "IN", value: ["active", "pending"] },
			]);

			expect(result).toEqual({
				expression: "#n0 IN (:v0)",
				attributes: {
					names: { "#n0": "status" },
					values: { ":v0": ["active", "pending"] },
				},
			});
		});

		it("should handle multiple filters with AND", () => {
			const result = builder.buildFilterExpression([
				{ field: "age", operator: ">", value: 21 },
				{ field: "status", operator: "=", value: "active" },
			]);

			expect(result).toEqual({
				expression: "#n0 > :v0 AND #n1 = :v1",
				attributes: {
					names: { "#n0": "age", "#n1": "status" },
					values: { ":v0": 21, ":v1": "active" },
				},
			});
		});

		it("should handle nested field paths", () => {
			const result = builder.buildFilterExpression([
				{ field: "user.address.city", operator: "=", value: "New York" },
			]);

			expect(result).toEqual({
				expression: "#n0.#n1.#n2 = :v0",
				attributes: {
					names: { "#n0": "user", "#n1": "address", "#n2": "city" },
					values: { ":v0": "New York" },
				},
			});
		});
	});

	describe("buildConditionExpression", () => {
		it("should build attribute_exists condition", () => {
			const result = builder.buildConditionExpression([
				{ field: "email", operator: "attribute_exists" },
			]);

			expect(result).toEqual({
				expression: "attribute_exists(#n0)",
				attributes: {
					names: { "#n0": "email" },
				},
			});
		});

		it("should build attribute_not_exists condition", () => {
			const result = builder.buildConditionExpression([
				{ field: "deletedAt", operator: "attribute_not_exists" },
			]);

			expect(result).toEqual({
				expression: "attribute_not_exists(#n0)",
				attributes: {
					names: { "#n0": "deletedAt" },
				},
			});
		});

		it("should build multiple conditions", () => {
			const result = builder.buildConditionExpression([
				{ field: "email", operator: "attribute_exists" },
				{ field: "age", operator: ">", value: 18 },
			]);

			expect(result).toEqual({
				expression: "attribute_exists(#n0) AND #n1 > :v0",
				attributes: {
					names: { "#n0": "email", "#n1": "age" },
					values: { ":v0": 18 },
				},
			});
		});
	});

	describe("buildUpdateExpression", () => {
		it("should build SET expression for updates", () => {
			const result = builder.buildUpdateExpression({
				name: "John",
				age: 30,
			});

			expect(result).toEqual({
				expression: "SET #u0 = :u0, #u1 = :u1",
				attributes: {
					names: { "#u0": "name", "#u1": "age" },
					values: { ":u0": "John", ":u1": 30 },
				},
			});
		});

		it("should build REMOVE expression for null values", () => {
			const result = builder.buildUpdateExpression({
				deletedAt: null,
				oldField: undefined,
			});

			// Due to there being no attributes being assigned, the values attribute is not present on the response
			expect(result).toEqual({
				expression: "REMOVE #u0, #u1",
				attributes: {
					names: { "#u0": "deletedAt", "#u1": "oldField" },
				},
			});
		});

		it("should combine SET and REMOVE expressions", () => {
			const result = builder.buildUpdateExpression({
				name: "John",
				age: 30,
				deletedAt: null,
			});

			expect(result).toEqual({
				expression: "SET #u0 = :u0, #u1 = :u1 REMOVE #u2",
				attributes: {
					names: { "#u0": "name", "#u1": "age", "#u2": "deletedAt" },
					values: { ":u0": "John", ":u1": 30 },
				},
			});
		});
	});

	describe("mergeExpressionResults", () => {
		it("should merge multiple expression results", () => {
			const result1 = {
				expression: "SET #n0 = :v0",
				attributes: {
					names: { "#n0": "name" },
					values: { ":v0": "John" },
				},
			};

			const result2 = {
				expression: "REMOVE #n1",
				attributes: {
					names: { "#n1": "deletedAt" },
					values: {},
				},
			};

			const merged = builder.mergeExpressionResults(result1, result2);

			expect(merged).toEqual({
				expression: "SET #n0 = :v0 REMOVE #n1",
				attributes: {
					names: { "#n0": "name", "#n1": "deletedAt" },
					values: { ":v0": "John" },
				},
			});
		});

		it("should handle empty expressions", () => {
			const result1 = {
				expression: "",
				attributes: { names: {}, values: {} },
			};

			const result2 = {
				expression: "SET #n0 = :v0",
				attributes: {
					names: { "#n0": "name" },
					values: { ":v0": "John" },
				},
			};

			const merged = builder.mergeExpressionResults(result1, result2);

			expect(merged).toEqual({
				expression: "SET #n0 = :v0",
				attributes: {
					names: { "#n0": "name" },
					values: { ":v0": "John" },
				},
			});
		});
	});
});
