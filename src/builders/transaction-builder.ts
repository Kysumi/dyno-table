import type { DynamoTransactOperation } from "../dynamo/dynamo-types";

/**
 * Builder class for constructing DynamoDB transaction operations.
 * Allows adding multiple operations to be executed in a single transaction.
 */
export class TransactionBuilder {
  private operations: DynamoTransactOperation["operations"] = [];

  /**
   * Retrieves the current transaction operation.
   *
   * @returns A DynamoTransactOperation object representing the transaction.
   *
   * Usage:
   * - To get the current transaction operation: `const operation = transactionBuilder.getOperation();`
   */
  getOperation(): DynamoTransactOperation {
    return {
      type: "transactWrite",
      operations: this.operations,
    };
  }

  /**
   * Adds an operation to the transaction.
   *
   * @param operation - The operation to add to the transaction.
   * @returns The current instance of TransactionBuilder for method chaining.
   *
   * Usage:
   * - To add a put operation: `transactionBuilder.addOperation({ put: { item: {...} } });`
   * - To add a delete operation: `transactionBuilder.addOperation({ delete: { key: {...} } });`
   */
  addOperation(operation: DynamoTransactOperation["operations"][0]) {
    this.operations.push(operation);
    return this;
  }
}
