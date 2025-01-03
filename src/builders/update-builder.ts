import type {
	PrimaryKeyWithoutExpression,
	DynamoUpdateOperation,
} from "../dynamo/dynamo-types";
import type { IExpressionBuilder } from "./expression-builder";
import { OperationBuilder } from "./operation-builder";

export class UpdateBuilder extends OperationBuilder<DynamoUpdateOperation> {
	private updates: Record<string, unknown> = {};

	constructor(
		private readonly key: PrimaryKeyWithoutExpression,
		expressionBuilder: IExpressionBuilder,
		private readonly onBuild: (
			operation: DynamoUpdateOperation,
		) => Promise<{ Attributes?: Record<string, unknown> }>,
	) {
		super(expressionBuilder);
	}

	set(field: string, value: unknown) {
		this.updates[field] = value;
		return this;
	}

	setMany(attribtues: Record<string, unknown>) {
		this.updates = { ...this.updates, ...attribtues };
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

	build(): DynamoUpdateOperation {
		const condition = this.buildConditionExpression();
		const update = this.expressionBuilder.buildUpdateExpression(this.updates);

		return {
			type: "update",
			key: this.key,
			update: {
				expression: update.expression,
				names: update.attributes.names,
				values: update.attributes.values,
			},
			condition: condition.expression
				? {
						expression: condition.expression,
						names: condition.attributes.names,
						values: condition.attributes.values,
					}
				: undefined,
		};
	}

	async execute(): Promise<{ Attributes?: Record<string, unknown> }> {
		return this.onBuild(this.build());
	}
}
