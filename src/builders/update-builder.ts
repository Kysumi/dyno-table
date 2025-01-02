import type { PrimaryKeyWithoutExpression, Table } from "../table";
import { ConditionBuilder } from "./condition-builder";
import type { ExpressionBuilder } from "./expression-builder";

export class UpdateBuilder extends ConditionBuilder {
	private updates: Record<string, unknown> = {};

	constructor(
		private table: Table,
		private key: PrimaryKeyWithoutExpression,
		expressionBuilder: ExpressionBuilder,
	) {
		super(expressionBuilder);
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
