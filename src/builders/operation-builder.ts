import type { DynamoOperation } from "../dynamo/dynamo-types";
import type { IExpressionBuilder } from "./expression-builder";
import type { Condition, ConditionOperator, FilterOperator } from "./operators";
import type { DynamoRecord } from "./types";

type StringKeys<T> = Extract<keyof T, string>;

/**
 * Base builder class for DynamoDB operations that supports condition expressions
 * @see https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html
 */
export abstract class OperationBuilder<
	T extends DynamoRecord,
	TOperation extends DynamoOperation,
> {
	protected conditions: Array<{
		field: keyof T;
		operator: ConditionOperator;
		value?: unknown;
	}> = [];

	constructor(protected expressionBuilder: IExpressionBuilder) {}

	where<K extends keyof T>(
		field: K,
		operator: FilterOperator,
		value: T[K] | T[K][],
	) {
		this.conditions.push({ field, operator, value });
		return this;
	}

	whereExists<K extends StringKeys<T>>(field: K) {
		this.conditions.push({ field, operator: "attribute_exists" });
		return this;
	}

	whereNotExists<K extends keyof T>(field: K) {
		this.conditions.push({ field, operator: "attribute_not_exists" });
		return this;
	}

	whereEquals<K extends keyof T>(field: K, value: T[K]) {
		return this.where(field, "=", value);
	}

	whereBetween<K extends keyof T>(field: K, start: T[K], end: T[K]) {
		return this.where(field, "BETWEEN", [start, end]);
	}

	whereIn<K extends keyof T>(field: K, values: T[K][]) {
		return this.where(field, "IN", values);
	}

	whereLessThan<K extends keyof T>(field: K, value: T[K]) {
		return this.where(field, "<", value);
	}

	whereLessThanOrEqual<K extends keyof T>(field: K, value: T[K]) {
		return this.where(field, "<=", value);
	}

	whereGreaterThan<K extends keyof T>(field: K, value: T[K]) {
		return this.where(field, ">", value);
	}

	whereGreaterThanOrEqual<K extends keyof T>(field: K, value: T[K]) {
		return this.where(field, ">=", value);
	}

	whereNotEqual<K extends keyof T>(field: K, value: T[K]) {
		return this.where(field, "<>", value);
	}

	whereBeginsWith<K extends keyof T>(field: K, value: T[K]) {
		return this.where(field, "begins_with", value);
	}

	whereContains<K extends keyof T>(field: K, value: T[K]) {
		return this.where(field, "contains", value);
	}

	whereNotContains<K extends keyof T>(field: K, value: T[K]) {
		this.conditions.push({ field, operator: "not_contains", value });
		return this;
	}

	whereAttributeType<K extends keyof T>(
		field: K,
		value: "S" | "SS" | "N" | "NS" | "B" | "BS" | "BOOL" | "NULL" | "M" | "L",
	) {
		this.conditions.push({ field, operator: "attribute_type", value });
		return this;
	}

	whereSize<K extends keyof T>(field: K, value: T[K]) {
		this.conditions.push({ field, operator: "size", value });
		return this;
	}

	protected buildConditionExpression() {
		return this.expressionBuilder.createExpression(
			this.conditions as Condition[],
		);
	}

	abstract build(): TOperation;
}
