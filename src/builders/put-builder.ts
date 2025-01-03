import type { DynamoPutOperation } from "../dynamo/dynamo-types";
import type { IExpressionBuilder } from "./expression-builder";
import { OperationBuilder } from "./operation-builder";

export class PutBuilder extends OperationBuilder<DynamoPutOperation> {
	constructor(
		private readonly item: Record<string, unknown>,
		expressionBuilder: IExpressionBuilder,
		private readonly onBuild: (operation: DynamoPutOperation) => Promise<void>,
	) {
		super(expressionBuilder);
	}

	build(): DynamoPutOperation {
		const { expression, attributes } = this.buildConditionExpression();

		return {
			type: "put",
			item: this.item,
			condition: expression
				? {
						expression,
						names: attributes.names,
						values: attributes.values,
					}
				: undefined,
		};
	}

	async execute(): Promise<void> {
		return this.onBuild(this.build());
	}
}
