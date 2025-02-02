import type { DynamoPutOptions } from "../dynamo/dynamo-types";
import type { IExpressionBuilder } from "./expression-builder";
import { OperationBuilder } from "./operation-builder";
import type { TransactionBuilder } from "./transaction-builder";
import type { DynamoRecord } from "./types";

/**
 * Builder class for constructing DynamoDB put operations.
 * Allows setting various parameters for a put operation.
 */
export class PutBuilder<T extends DynamoRecord> extends OperationBuilder<T, DynamoPutOptions> {
  private item: T;
  private inTransaction = false;

  constructor(
    item: T,
    expressionBuilder: IExpressionBuilder,
    private readonly onBuild: (operation: DynamoPutOptions) => Promise<T>,
  ) {
    super(expressionBuilder);
    this.item = item;
  }

  /**
   * Set one or more attributes in the update operation.
   * @param field - The field to update
   * @param value - The value to set
   */
  set<K extends keyof T>(field: K, value: T[K]): this;
  /**
   * Set multiple attributes in the update operation.
   * @param attributes - Object containing field-value pairs to update
   */
  set(attributes: Partial<T>): this;

  /**
   * Sets one or more attributes in the update operation.
   *
   * @param fieldOrAttributes - The field to update or an object containing field-value pairs to update.
   * @param value - The value to set if a single field is being updated.
   * @returns The current instance of UpdateBuilder for method chaining.
   *
   * Usage:
   * - To set a single attribute: `updateBuilder.set("fieldName", value);`
   * - To set multiple attributes: `updateBuilder.set({ field1: value1, field2: value2 });`
   */
  set<K extends keyof T>(fieldOrAttributes: K | Partial<T>, value?: T[K]) {
    if (typeof fieldOrAttributes === "string") {
      this.item[fieldOrAttributes as keyof T] = value as T[K];
    } else {
      this.item = { ...this.item, ...(fieldOrAttributes as Partial<T>) };
    }
    return this;
  }

  /**
   * Builds the put operation into a DynamoPutOperation object.
   *
   * @returns A DynamoPutOperation object representing the put operation.
   *
   * Usage:
   * - To build the operation: `const operation = putBuilder.build();`
   */
  build(): DynamoPutOptions {
    const { expression, attributes } = this.buildConditionExpression();

    return {
      item: this.item,
      condition: expression
        ? {
            expression,
            names: attributes.names,
            values: attributes.values,
          }
        : undefined,
      // Only option that does anything according to docs
      // https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_PutItem.html#API_PutItem_ResponseElements
      returnValues: "ALL_OLD",
    };
  }

  /**
   * Adds the put operation to a transaction.
   *
   * @param transaction - The transaction builder to add the operation to.
   *
   * Usage:
   * - To add to a transaction: `putBuilder.withTransaction(transaction);`
   */
  withTransaction(transaction: TransactionBuilder) {
    this.inTransaction = true;
    const operation = this.build();

    transaction.addOperation({
      put: operation,
    });
  }

  /**
   * Runs the put operation to insert the provided attributes into the table.
   *
   * @returns The provided attributes. This does not load the model from the DB after insert.
   *
   * Usage:
   * - To execute the operation: `await putBuilder.execute();`
   *
   * Note: Cannot be called after withTransaction.
   */
  async execute(): Promise<T> {
    if (this.inTransaction) {
      throw new Error("Cannot execute a put operation that is part of a transaction");
    }
    return this.onBuild(this.build());
  }
}
