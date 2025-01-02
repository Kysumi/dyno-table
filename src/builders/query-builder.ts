import type { Table } from "../table";
import { ConditionBuilder } from "./condition-builder";
import type { ExpressionBuilder } from "./expression-builder";
import type { PrimaryKey } from "./operators";

export class QueryBuilder extends ConditionBuilder {
	private limitValue?: number;
	private indexNameValue?: string;

	constructor(
		private table: Table,
		private key: PrimaryKey,
		expressionBuilder: ExpressionBuilder,
	) {
		super(expressionBuilder);
	}

	limit(value: number) {
		this.limitValue = value;
		return this;
	}

	useIndex(indexName: string) {
		this.indexNameValue = indexName;
		return this;
	}

	async execute() {
		// Get the filter conditions from ConditionBuilder
		const { expression, attributes } = this.buildConditionExpression();

		return this.table.nativeQuery(this.key, {
			filters: this.conditions,
			limit: this.limitValue,
			indexName: this.indexNameValue,

			conditionExpression: expression,
			expressionAttributeNames: attributes.names,
			expressionAttributeValues: attributes.values,
		});
	}
}
