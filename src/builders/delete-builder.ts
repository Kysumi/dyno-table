import type { DynamoDeleteOperation, PrimaryKeyWithoutExpression } from "../dynamo/dynamo-types";
import type { IExpressionBuilder } from "./expression-builder";
import { OperationBuilder } from "./operation-builder";
import type { TransactionBuilder } from "./transaction-builder";
import type { DynamoRecord } from "./types";

export class DeleteBuilder<T extends DynamoRecord> extends OperationBuilder<T, DynamoDeleteOperation> {
  constructor(
    private readonly key: PrimaryKeyWithoutExpression,
    expressionBuilder: IExpressionBuilder,
    private readonly onBuild: (operation: DynamoDeleteOperation) => Promise<void>,
  ) {
    super(expressionBuilder);
  }

  build(): DynamoDeleteOperation {
    const condition = this.buildConditionExpression();

    return {
      type: "delete",
      key: this.key,
      condition: condition.expression
        ? {
            expression: condition.expression,
            names: condition.attributes.names,
            values: condition.attributes.values,
          }
        : undefined,
    };
  }

  withTransaction(transaction: TransactionBuilder) {
    const operation = this.build();

    transaction.addOperation({
      delete: operation,
    });
  }

  async execute(): Promise<void> {
    return this.onBuild(this.build());
  }
}
