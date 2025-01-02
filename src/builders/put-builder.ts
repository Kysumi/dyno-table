import type { Table } from "../table";
import type { IExpressionBuilder } from "./expression-builder";
import { OperationBuilder } from "./operation-builder";

export class PutBuilder extends OperationBuilder {
	constructor(
		table: Table,
		private item: Record<string, unknown>,
		expressionBuilder: IExpressionBuilder,
	) {
		super(table, expressionBuilder);
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
