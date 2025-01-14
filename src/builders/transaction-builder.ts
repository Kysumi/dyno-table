import type { DynamoTransactOperation } from "../dynamo/dynamo-types";

export class TransactionBuilder {
  private operations: DynamoTransactOperation["operations"] = [];

  getOperation(): DynamoTransactOperation {
    return {
      type: "transactWrite",
      operations: this.operations,
    };
  }

  addOperation(operation: DynamoTransactOperation["operations"][0]) {
    this.operations.push(operation);
    return this;
  }
}
