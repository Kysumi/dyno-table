import type { PrimaryKeyWithoutExpression, DynamoUpdateOperation } from "../dynamo/dynamo-types";
import type { IExpressionBuilder } from "./expression-builder";
import { OperationBuilder } from "./operation-builder";
import type { TransactionBuilder } from "./transaction-builder";
import type { DynamoRecord } from "./types";

export class UpdateBuilder<T extends DynamoRecord> extends OperationBuilder<T, DynamoUpdateOperation> {
  private updates: Partial<T> = {};
  private inTransaction = false;
  private returnValues: DynamoUpdateOperation["returnValues"] = "ALL_NEW";

  constructor(
    private readonly key: PrimaryKeyWithoutExpression,
    expressionBuilder: IExpressionBuilder,
    private readonly onBuild: (operation: DynamoUpdateOperation) => Promise<{ Attributes?: T }>,
  ) {
    super(expressionBuilder);
  }

  set<K extends keyof T>(field: K, value: T[K]): this;
  set(attributes: Partial<T>): this;
  set<K extends keyof T>(fieldOrAttributes: K | Partial<T>, value?: T[K]) {
    if (typeof fieldOrAttributes === "string") {
      this.updates[fieldOrAttributes as keyof T] = value as T[K];
    } else {
      this.updates = { ...this.updates, ...(fieldOrAttributes as Partial<T>) };
    }
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

  return(valuesToReturn: DynamoUpdateOperation["returnValues"]) {
    this.returnValues = valuesToReturn;
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
      returnValues: this.returnValues,
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
