import type { Table } from "../table";
import type { IExpressionBuilder } from "./expression-builder";
import { OperationBuilder } from "./operation-builder";
import type { PrimaryKey } from "./operators";

export class QueryBuilder extends OperationBuilder {
	private limitValue?: number;
	private indexNameValue?: string;

	constructor(
		table: Table,
		private key: PrimaryKey,
		expressionBuilder: IExpressionBuilder,
	) {
		super(table, expressionBuilder);
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
