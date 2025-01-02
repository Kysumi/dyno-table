import type { Table } from "../table";
import type { IExpressionBuilder } from "./expression-builder";
import type { ConditionOperator, FilterOperator } from "./operators";

export abstract class OperationBuilder {
	protected conditions: Array<{
		field: string;
		operator: ConditionOperator;
		value?: unknown;
	}> = [];

	constructor(
		protected table: Table,
		protected expressionBuilder: IExpressionBuilder,
	) {}

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
		this.validateConditions();
		return this.expressionBuilder.buildConditionExpression(this.conditions);
	}

	/**
	 * A place where we can extend and standardize the validation of conditions
	 * @returns
	 */
	protected validateConditions() {
		if (this.conditions.length === 0) return;
	}

	abstract execute(): Promise<unknown>;
}
