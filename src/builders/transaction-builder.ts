import type { DynamoTransactItem } from "../dynamo/dynamo-types";

/**
 * Builder class for constructing DynamoDB transaction operations.
 * Allows adding multiple operations to be executed in a single transaction.
 */
export class TransactionBuilder {
  private operations: DynamoTransactItem[] = [];

  /**
   * Retrieves the current transaction operation.
   *
   * @returns An array of DynamoTransactItem objects representing the transaction operations.
   *
   * Usage:
   * - To get the transaction operations: `const operations = transactionBuilder.getOperation();`
   */
  getOperation(): DynamoTransactItem[] {
    return this.operations.map((operation) => ({
      put: operation.put,
      delete: operation.delete,
    }));
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
  addOperation(operation: DynamoTransactItem) {
    this.operations.push(operation);
    return this;
  }
}
