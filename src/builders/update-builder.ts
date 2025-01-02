import type { Table, PrimaryKeyWithoutExpression } from "../table";
import type { IExpressionBuilder } from "./expression-builder";
import { OperationBuilder } from "./operation-builder";

export class UpdateBuilder extends OperationBuilder {
	private updates: Record<string, unknown> = {};

	constructor(
		table: Table,
		private key: PrimaryKeyWithoutExpression,
		expressionBuilder: IExpressionBuilder,
	) {
		super(table, expressionBuilder);
	}

	set(field: string, value: unknown) {
		this.updates[field] = value;
		return this;
	}

	remove(...fields: string[]) {
		for (const field of fields) {
			this.updates[field] = null;
		}
		return this;
	}

	increment(field: string, by = 1) {
		this.updates[field] = { $add: by };
		return this;
	}

	async execute() {
		const { expression, attributes } = this.buildConditionExpression();
		return this.table.nativeUpdate(this.key, this.updates, {
			conditionExpression: expression,
			expressionAttributeNames: attributes.names,
			expressionAttributeValues: attributes.values,
		});
	}
}
