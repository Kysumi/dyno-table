import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConditionBuilder } from "../condition-builder";
import type { IExpressionBuilder } from "../expression-builder";

describe("ConditionBuilder", () => {
	let conditionBuilder: ConditionBuilder;
	let mockExpressionBuilder: IExpressionBuilder;

	beforeEach(() => {
		// Create a mock with vi.fn() instead of a class implementation
		mockExpressionBuilder = {
			buildKeyCondition: vi.fn(),
			buildFilterExpression: vi.fn(),
			buildConditionExpression: vi.fn(),
			buildUpdateExpression: vi.fn(),
			mergeExpressionResults: vi.fn(),
		};

		conditionBuilder = new ConditionBuilder(mockExpressionBuilder);
	});

	describe("condition methods", () => {
		it("should build basic where condition", () => {
			const result = conditionBuilder.where("age", "=", 30);

			expect(result).toBe(conditionBuilder); // Test method chaining
			expect(result["conditions"]).toEqual([
				{ field: "age", operator: "=", value: 30 },
			]);
		});

		it("should build exists condition", () => {
			const result = conditionBuilder.whereExists("name");

			expect(result).toBe(conditionBuilder);
			expect(result["conditions"]).toEqual([
				{ field: "name", operator: "attribute_exists" },
			]);
		});

		it("should build not exists condition", () => {
			const result = conditionBuilder.whereNotExists("name");

			expect(result).toBe(conditionBuilder);
			expect(result["conditions"]).toEqual([
				{ field: "name", operator: "attribute_not_exists" },
			]);
		});

		it("should build equals condition", () => {
			const result = conditionBuilder.whereEquals("age", 25);

			expect(result).toBe(conditionBuilder);
			expect(result["conditions"]).toEqual([
				{ field: "age", operator: "=", value: 25 },
			]);
		});

		it("should build between condition", () => {
			const result = conditionBuilder.whereBetween("age", 20, 30);

			expect(result).toBe(conditionBuilder);
			expect(result["conditions"]).toEqual([
				{ field: "age", operator: "BETWEEN", value: [20, 30] },
			]);
		});

		it("should build in condition", () => {
			const values = [20, 25, 30];
			const result = conditionBuilder.whereIn("age", values);

			expect(result).toBe(conditionBuilder);
			expect(result["conditions"]).toEqual([
				{ field: "age", operator: "IN", value: values },
			]);
		});
	});

	describe("expression building", () => {
		it("should call expressionBuilder with correct conditions", () => {
			const mockExpression = {
				expression: "someExpression",
				attributes: { names: {}, values: {} },
			};

			mockExpressionBuilder.buildConditionExpression.mockReturnValue(
				mockExpression,
			);

			conditionBuilder.where("age", "=", 30).whereExists("name");

			const conditions = [
				{ field: "age", operator: "=", value: 30 },
				{ field: "name", operator: "attribute_exists" },
			];

			conditionBuilder["buildConditionExpression"]();

			expect(
				mockExpressionBuilder.buildConditionExpression,
			).toHaveBeenCalledWith(conditions);
		});
	});

	describe("method chaining", () => {
		it("should support multiple conditions", () => {
			const result = conditionBuilder
				.where("age", "=", 30)
				.whereExists("name")
				.whereBetween("score", 0, 100);

			expect(result["conditions"]).toEqual([
				{ field: "age", operator: "=", value: 30 },
				{ field: "name", operator: "attribute_exists" },
				{ field: "score", operator: "BETWEEN", value: [0, 100] },
			]);
		});
	});
});
