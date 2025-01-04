import type { DynamoOperation } from "../dynamo/dynamo-types";
import type { IExpressionBuilder } from "./expression-builder";
import type { ConditionOperator, FilterOperator } from "./operators";

export abstract class OperationBuilder<T extends DynamoOperation> {
	protected conditions: Array<{
		field: string;
		operator: ConditionOperator;
		value?: unknown;
	}> = [];

	constructor(protected expressionBuilder: IExpressionBuilder) {}

	where(field: string, operator: FilterOperator, value: unknown) {
		this.conditions.push({ field, operator, value });
		return this;
	}

	whereExists(field: string) {
		this.conditions.push({ field, operator: "attribute_exists" });
		return this;
	}

	whereNotExists(field: string) {
		this.conditions.push({ field, operator: "attribute_not_exists" });
		return this;
	}

	whereEquals(field: string, value: unknown) {
		return this.where(field, "=", value);
	}

	whereBetween(field: string, start: unknown, end: unknown) {
		return this.where(field, "BETWEEN", [start, end]);
	}

	whereIn(field: string, values: unknown[]) {
		return this.where(field, "IN", values);
	}

	whereLessThan(field: string, value: unknown) {
		return this.where(field, "<", value);
	}

	whereLessThanOrEqual(field: string, value: unknown) {
		return this.where(field, "<=", value);
	}

	whereGreaterThan(field: string, value: unknown) {
		return this.where(field, ">", value);
	}

	whereGreaterThanOrEqual(field: string, value: unknown) {
		return this.where(field, ">=", value);
	}

	whereNotEqual(field: string, value: unknown) {
		return this.where(field, "<>", value);
	}

	whereBeginsWith(field: string, value: unknown) {
		return this.where(field, "begins_with", value);
	}

	whereContains(field: string, value: unknown) {
		return this.where(field, "contains", value);
	}

	whereNotContains(field: string, value: unknown) {
		this.conditions.push({ field, operator: "not_contains", value });
		return this;
	}

	whereAttributeType(field: string, value: unknown) {
		this.conditions.push({ field, operator: "attribute_type", value });
		return this;
	}

	whereSize(field: string, value: unknown) {
		this.conditions.push({ field, operator: "size", value });
		return this;
	}

	protected buildConditionExpression() {
		return this.expressionBuilder.createExpression(this.conditions);
	}

	abstract build(): T;
}
