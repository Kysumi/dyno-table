import type { PrimaryKeyWithoutExpression, DynamoUpdateOptions } from "../dynamo/dynamo-types";
import type { IExpressionBuilder } from "./expression-builder";
import { OperationBuilder } from "./operation-builder";
import type { TransactionBuilder } from "./transaction-builder";
import type { DynamoRecord, Path, PathType } from "./types";

export class UpdateBuilder<T extends DynamoRecord> extends OperationBuilder<T, DynamoUpdateOptions> {
  private updates: Partial<T> = {};
  private inTransaction = false;
  private returnValues: DynamoUpdateOptions["returnValues"] = "ALL_NEW";

  constructor(
    private readonly key: PrimaryKeyWithoutExpression,
    expressionBuilder: IExpressionBuilder,
    private readonly onBuild: (operation: DynamoUpdateOptions) => Promise<T>,
  ) {
    super(expressionBuilder);
  }

  private setNestedField<K extends Path<T>>(field: K, value: PathType<T, K>) {
    const keys = field.split(".");
    let current: Record<string, unknown> = this.updates;
    while (keys.length > 1) {
      const key = keys.shift();
      if (key) {
        current[key] = current[key] || {};
        current = current[key] as Record<string, unknown>;
      }
    }
    if (keys.length > 0 && typeof keys[0] === "string") {
      current[keys[0]] = value;
    }
  }

  /**
   * Set one or more attributes in the update operation.
   * @param field - The field to update
   * @param value - The value to set
   */
  set<K extends Path<T>>(fieldOrAttributes: K | Partial<T>, value?: PathType<T, K>): this;

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
  set<K extends Path<T>>(fieldOrAttributes: K | Partial<T>, value?: PathType<T, K>) {
    if (typeof fieldOrAttributes === "string") {
      this.setNestedField(fieldOrAttributes, value as PathType<T, K>);
    } else {
      for (const [key, val] of Object.entries(fieldOrAttributes)) {
        this.setNestedField(key as K, val as PathType<T, K>);
      }
    }
    return this;
  }

  /**
   * Removes one or more attributes from the update operation.
   *
   * @param fields - The fields to remove.
   * @returns The current instance of UpdateBuilder for method chaining.
   *
   * Usage:
   * - To remove attributes: `updateBuilder.remove("field1", "field2");`
   */
  remove(...fields: Array<keyof T>) {
    for (const field of fields) {
      this.updates[field] = null as T[keyof T];
    }
    return this;
  }

  /**
   * Increments a numeric attribute by a specified value.
   *
   * @param field - The field to increment.
   * @param by - The amount to increment by. Defaults to 1.
   * @returns The current instance of UpdateBuilder for method chaining.
   *
   * Usage:
   * - To increment a field by 1: `updateBuilder.increment("fieldName");`
   * - To increment a field by a specific value: `updateBuilder.increment("fieldName", 5);`
   */
  increment<K extends keyof T>(field: K, by = 1) {
    this.updates[field] = { $add: by } as T[K];
    return this;
  }

  /**
   * Specifies the return values for the update operation.
   *
   * @param valuesToReturn - The return values option.
   * @returns The current instance of UpdateBuilder for method chaining.
   *
   * Usage:
   * - To set return values: `updateBuilder.return("ALL_NEW");`
   */
  return(valuesToReturn: DynamoUpdateOptions["returnValues"]) {
    this.returnValues = valuesToReturn;
    return this;
  }

  /**
   * Builds the update operation into a DynamoUpdateOperation object.
   *
   * @returns A DynamoUpdateOperation object representing the update operation.
   *
   * Usage:
   * - To build the operation: `const operation = updateBuilder.build();`
   */
  build(): DynamoUpdateOptions {
    const condition = this.buildConditionExpression();
    const update = this.expressionBuilder.buildUpdateExpression(this.updates);

    return {
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

  /**
   * Adds the update operation to a transaction.
   *
   * @param transaction - The transaction builder to add the operation to.
   *
   * Usage:
   * - To add to a transaction: `updateBuilder.withTransaction(transaction);`
   */
  withTransaction(transaction: TransactionBuilder) {
    this.inTransaction = true;
    const operation = this.build();

    transaction.addOperation({
      update: operation,
    });
  }

  /**
   * Executes the update operation.
   *
   * @returns A promise that resolves to the updated attributes.
   *
   * Usage:
   * - To execute the operation: `await updateBuilder.execute();`
   *
   * Note: Cannot be called after withTransaction.
   */
  async execute(): Promise<T> {
    if (this.inTransaction) {
      throw new Error("Cannot call execute after withTransaction");
    }
    return this.onBuild(this.build());
  }
}
