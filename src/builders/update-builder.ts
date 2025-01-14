import type { PrimaryKeyWithoutExpression, DynamoUpdateOperation } from "../dynamo/dynamo-types";
import type { IExpressionBuilder } from "./expression-builder";
import { OperationBuilder } from "./operation-builder";
import type { TransactionBuilder } from "./transaction-builder";
import type { DynamoRecord } from "./types";

export class UpdateBuilder<T extends DynamoRecord> extends OperationBuilder<T, DynamoUpdateOperation> {
  private updates: Partial<T> = {};
  private inTransaction = false;

  constructor(
    private readonly key: PrimaryKeyWithoutExpression,
    expressionBuilder: IExpressionBuilder,
    private readonly onBuild: (operation: DynamoUpdateOperation) => Promise<{ Attributes?: T }>,
  ) {
    super(expressionBuilder);
  }

  set<K extends keyof T>(field: K, value: T[K]) {
    this.updates[field] = value;
    return this;
  }

  setMany(attributes: Partial<T>) {
    this.updates = { ...this.updates, ...attributes };
    return this;
  }

  remove(...fields: Array<keyof T>) {
    for (const field of fields) {
      this.updates[field] = null as T[keyof T];
    }
    return this;
  }

  increment<K extends keyof T>(field: K, by = 1) {
    this.updates[field] = { $add: by } as T[K];
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

  withTransaction(transaction: TransactionBuilder) {
    this.inTransaction = true;
    const operation = this.build();

    transaction.addOperation({
      update: operation,
    });
  }

  async execute(): Promise<{ Attributes?: T }> {
    if (this.inTransaction) {
      throw new Error("Cannot call execute after withTransaction");
    }
    return this.onBuild(this.build());
  }
}
