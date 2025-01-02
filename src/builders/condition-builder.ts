import type { IExpressionBuilder } from "./expression-builder";
import type { FilterOperator } from "./operators";

export class ConditionBuilder {
	protected conditions: Array<{
		field: string;
		operator: FilterOperator | "attribute_exists" | "attribute_not_exists";
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

	protected buildConditionExpression() {
		return this.expressionBuilder.buildConditionExpression(this.conditions);
	}
}
