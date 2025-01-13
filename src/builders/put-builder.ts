import type { DynamoPutOperation } from "../dynamo/dynamo-types";
import type { IExpressionBuilder } from "./expression-builder";
import { OperationBuilder } from "./operation-builder";
import type { DynamoRecord } from "./types";

export class PutBuilder<T extends DynamoRecord> extends OperationBuilder<T, DynamoPutOperation> {
  private item: T;

  constructor(
    item: T,
    expressionBuilder: IExpressionBuilder,
    private readonly onBuild: (operation: DynamoPutOperation) => Promise<T>,
  ) {
    super(expressionBuilder);
    this.item = item;
  }

  set<K extends keyof T>(field: K, value: T[K]) {
    this.item[field] = value;
    return this;
  }

  setMany(attributes: Partial<T>) {
    this.item = { ...this.item, ...attributes };
    return this;
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

  /**
   * Runs the put operation to insert the provided attributes into the table.
   *
   * @returns The provided attributes. This does not load the model from the DB after insert
   */
  async execute(): Promise<T> {
    return this.onBuild(this.build());
  }
}
