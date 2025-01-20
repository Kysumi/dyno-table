import type { DynamoDeleteOperation, PrimaryKeyWithoutExpression } from "../dynamo/dynamo-types";
import type { IExpressionBuilder } from "./expression-builder";
import { OperationBuilder } from "./operation-builder";
import type { TransactionBuilder } from "./transaction-builder";
import type { DynamoRecord } from "./types";

/**
 * Builder class for constructing DynamoDB delete operations.
 * Allows setting various parameters for a delete operation.
 */
export class DeleteBuilder<T extends DynamoRecord> extends OperationBuilder<T, DynamoDeleteOperation> {
  private inTransaction = false;

  constructor(
    private readonly key: PrimaryKeyWithoutExpression,
    expressionBuilder: IExpressionBuilder,
    private readonly onBuild: (operation: DynamoDeleteOperation) => Promise<void>,
  ) {
    super(expressionBuilder);
  }

  /**
   * Builds the delete operation into a DynamoDeleteOperation object.
   *
   * @returns A DynamoDeleteOperation object representing the delete operation.
   *
   * Usage:
   * - To build the operation: `const operation = deleteBuilder.build();`
   */
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

  /**
   * Adds the delete operation to a transaction.
   *
   * @param transaction - The transaction builder to add the operation to.
   *
   * Usage:
   * - To add to a transaction: `deleteBuilder.withTransaction(transaction);`
   */
  withTransaction(transaction: TransactionBuilder) {
    this.inTransaction = true;
    const operation = this.build();

    transaction.addOperation({
      delete: operation,
    });
  }

  /**
   * Executes the delete operation.
   *
   * @returns A promise that resolves when the delete operation is complete.
   *
   * Usage:
   * - To execute the operation: `await deleteBuilder.execute();`
   *
   * Note: Cannot be called after withTransaction.
   */
  async execute(): Promise<void> {
    if (this.inTransaction) {
      throw new Error("Delete operation is already in a transaction");
    }
    return this.onBuild(this.build());
  }
}
