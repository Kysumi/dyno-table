import type { Table } from "../table";
import { ConditionBuilder } from "./condition-builder";
import type { ExpressionBuilder } from "./expression-builder";

export class PutBuilder extends ConditionBuilder {
	constructor(
		private table: Table,
		private item: Record<string, unknown>,
		expressionBuilder: ExpressionBuilder,
	) {
		super(expressionBuilder);
	}

	async execute() {
		const { expression, attributes } = this.buildConditionExpression();

		return this.table.nativePut(this.item, {
			conditionExpression: expression,
			expressionAttributeNames: attributes.names,
			expressionAttributeValues: attributes.values,
		});
	}
}
