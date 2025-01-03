import type { DynamoQueryOperation } from "../dynamo/dynamo-types";
import type { IExpressionBuilder } from "./expression-builder";
import { OperationBuilder } from "./operation-builder";
import type { PrimaryKey, TableIndexConfig } from "./operators";

export class QueryBuilder extends OperationBuilder<DynamoQueryOperation> {
	private limitValue?: number;
	private indexNameValue?: string;

	constructor(
		private readonly key: PrimaryKey,
		private readonly indexConfig: TableIndexConfig,
		expressionBuilder: IExpressionBuilder,
		private readonly onBuild: (operation: DynamoQueryOperation) => Promise<{
			Items?: Record<string, unknown>[];
			Count?: number;
			ScannedCount?: number;
			LastEvaluatedKey?: Record<string, unknown>;
		}>,
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

	build(): DynamoQueryOperation {
		const filter = this.buildConditionExpression();

		const keyCondition = this.expressionBuilder.buildKeyCondition(
			this.key,
			this.indexConfig,
		);

		return {
			type: "query",
			keyCondition: {
				expression: keyCondition.expression,
				names: keyCondition.attributes.names,
				values: keyCondition.attributes.values,
			},
			filter: filter.expression
				? {
						expression: filter.expression,
						names: filter.attributes.names,
						values: filter.attributes.values,
					}
				: undefined,
			limit: this.limitValue,
			indexName: this.indexNameValue,
		};
	}

	async execute() {
		return this.onBuild(this.build());
	}
}
