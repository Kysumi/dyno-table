import type { DynamoPutOperation } from "../dynamo/dynamo-types";
import type { IExpressionBuilder } from "./expression-builder";
import type { Condition, ConditionOperator, FilterOperator } from "./operators";
import type { DynamoRecord } from "./types";

type StringKeys<T> = Extract<keyof T, string>;

/**
 * Base builder class for DynamoDB operations that supports condition expressions.
 * Provides methods to add various conditions to the operation.
 *
 * @see https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html
 */
export abstract class OperationBuilder<T extends DynamoRecord, TOperation extends DynamoPutOperation> {
  protected conditions: Array<{
    field: keyof T;
    operator: ConditionOperator;
    value?: unknown;
  }> = [];

  constructor(protected expressionBuilder: IExpressionBuilder) {}

  /**
   * Adds a condition to the operation.
   *
   * @param field - The field to apply the condition on.
   * @param operator - The operator to use for the condition.
   * @param value - The value to compare the field against.
   * @returns The current instance of OperationBuilder for method chaining.
   *
   * Usage:
   * - To add a condition: `operationBuilder.where("fieldName", "=", value);`
   */
  where<K extends keyof T>(field: K, operator: FilterOperator, value: T[K] | T[K][]) {
    this.conditions.push({ field, operator, value });
    return this;
  }

  /**
   * Adds an "attribute exists" condition to the operation.
   *
   * @param field - The field to check for existence.
   * @returns The current instance of OperationBuilder for method chaining.
   *
   * Usage:
   * - To check if an attribute exists: `operationBuilder.whereExists("fieldName");`
   */
  whereExists<K extends StringKeys<T>>(field: K) {
    this.conditions.push({ field, operator: "attribute_exists" });
    return this;
  }

  /**
   * Adds an "attribute not exists" condition to the operation.
   *
   * @param field - The field to check for non-existence.
   * @returns The current instance of OperationBuilder for method chaining.
   *
   * Usage:
   * - To check if an attribute does not exist: `operationBuilder.whereNotExists("fieldName");`
   */
  whereNotExists<K extends keyof T>(field: K) {
    this.conditions.push({ field, operator: "attribute_not_exists" });
    return this;
  }

  /**
   * Adds an "equals" condition to the operation.
   *
   * @param field - The field to apply the condition on.
   * @param value - The value to compare the field against.
   * @returns The current instance of OperationBuilder for method chaining.
   *
   * Usage:
   * - To add an equals condition: `operationBuilder.whereEquals("fieldName", value);`
   */
  whereEquals<K extends keyof T>(field: K, value: T[K]) {
    return this.where(field, "=", value);
  }

  /**
   * Adds a "between" condition to the operation.
   *
   * @param field - The field to apply the condition on.
   * @param start - The start value of the range.
   * @param end - The end value of the range.
   * @returns The current instance of OperationBuilder for method chaining.
   *
   * Usage:
   * - To add a between condition: `operationBuilder.whereBetween("fieldName", start, end);`
   */
  whereBetween<K extends keyof T>(field: K, start: T[K], end: T[K]) {
    return this.where(field, "BETWEEN", [start, end]);
  }

  /**
   * Adds an "in" condition to the operation.
   *
   * @param field - The field to apply the condition on.
   * @param values - The values to compare the field against.
   * @returns The current instance of OperationBuilder for method chaining.
   *
   * Usage:
   * - To add an in condition: `operationBuilder.whereIn("fieldName", [value1, value2]);`
   */
  whereIn<K extends keyof T>(field: K, values: T[K][]) {
    return this.where(field, "IN", values);
  }

  /**
   * Adds a "less than" condition to the operation.
   *
   * @param field - The field to apply the condition on.
   * @param value - The value to compare the field against.
   * @returns The current instance of OperationBuilder for method chaining.
   *
   * Usage:
   * - To add a less than condition: `operationBuilder.whereLessThan("fieldName", value);`
   */
  whereLessThan<K extends keyof T>(field: K, value: T[K]) {
    return this.where(field, "<", value);
  }

  /**
   * Adds a "less than or equal" condition to the operation.
   *
   * @param field - The field to apply the condition on.
   * @param value - The value to compare the field against.
   * @returns The current instance of OperationBuilder for method chaining.
   *
   * Usage:
   * - To add a less than or equal condition: `operationBuilder.whereLessThanOrEqual("fieldName", value);`
   */
  whereLessThanOrEqual<K extends keyof T>(field: K, value: T[K]) {
    return this.where(field, "<=", value);
  }

  /**
   * Adds a "greater than" condition to the operation.
   *
   * @param field - The field to apply the condition on.
   * @param value - The value to compare the field against.
   * @returns The current instance of OperationBuilder for method chaining.
   *
   * Usage:
   * - To add a greater than condition: `operationBuilder.whereGreaterThan("fieldName", value);`
   */
  whereGreaterThan<K extends keyof T>(field: K, value: T[K]) {
    return this.where(field, ">", value);
  }

  /**
   * Adds a "greater than or equal" condition to the operation.
   *
   * @param field - The field to apply the condition on.
   * @param value - The value to compare the field against.
   * @returns The current instance of OperationBuilder for method chaining.
   *
   * Usage:
   * - To add a greater than or equal condition: `operationBuilder.whereGreaterThanOrEqual("fieldName", value);`
   */
  whereGreaterThanOrEqual<K extends keyof T>(field: K, value: T[K]) {
    return this.where(field, ">=", value);
  }

  /**
   * Adds a "not equal" condition to the operation.
   *
   * @param field - The field to apply the condition on.
   * @param value - The value to compare the field against.
   * @returns The current instance of OperationBuilder for method chaining.
   *
   * Usage:
   * - To add a not equal condition: `operationBuilder.whereNotEqual("fieldName", value);`
   */
  whereNotEqual<K extends keyof T>(field: K, value: T[K]) {
    return this.where(field, "<>", value);
  }

  /**
   * Adds a "begins with" condition to the operation.
   *
   * @param field - The field to apply the condition on.
   * @param value - The value to compare the field against.
   * @returns The current instance of OperationBuilder for method chaining.
   *
   * Usage:
   * - To add a begins with condition: `operationBuilder.whereBeginsWith("fieldName", value);`
   */
  whereBeginsWith<K extends keyof T>(field: K, value: T[K]) {
    return this.where(field, "begins_with", value);
  }

  /**
   * Adds a "contains" condition to the operation.
   *
   * @param field - The field to apply the condition on.
   * @param value - The value to compare the field against.
   * @returns The current instance of OperationBuilder for method chaining.
   *
   * Usage:
   * - To add a contains condition: `operationBuilder.whereContains("fieldName", value);`
   */
  whereContains<K extends keyof T>(field: K, value: T[K]) {
    return this.where(field, "contains", value);
  }

  /**
   * Adds a "not contains" condition to the operation.
   *
   * @param field - The field to apply the condition on.
   * @param value - The value to compare the field against.
   * @returns The current instance of OperationBuilder for method chaining.
   *
   * Usage:
   * - To add a not contains condition: `operationBuilder.whereNotContains("fieldName", value);`
   */
  whereNotContains<K extends keyof T>(field: K, value: T[K]) {
    this.conditions.push({ field, operator: "not_contains", value });
    return this;
  }

  /**
   * Adds an "attribute type" condition to the operation.
   *
   * @param field - The field to apply the condition on.
   * @param value - The type to compare the field against.
   * @returns The current instance of OperationBuilder for method chaining.
   *
   * Usage:
   * - To add an attribute type condition: `operationBuilder.whereAttributeType("fieldName", "S");`
   */
  whereAttributeType<K extends keyof T>(
    field: K,
    value: "S" | "SS" | "N" | "NS" | "B" | "BS" | "BOOL" | "NULL" | "M" | "L",
  ) {
    this.conditions.push({ field, operator: "attribute_type", value });
    return this;
  }

  /**
   * Adds a "size" condition to the operation.
   *
   * @param field - The field to apply the condition on.
   * @param value - The value to compare the field against.
   * @returns The current instance of OperationBuilder for method chaining.
   *
   * Usage:
   * - To add a size condition: `operationBuilder.whereSize("fieldName", value);`
   */
  whereSize<K extends keyof T>(field: K, value: T[K]) {
    this.conditions.push({ field, operator: "size", value });
    return this;
  }

  /**
   * Builds the condition expression for the operation.
   *
   * @returns An object representing the condition expression.
   *
   * Usage:
   * - To build the condition expression: `const condition = operationBuilder.buildConditionExpression();`
   */
  protected buildConditionExpression() {
    return this.expressionBuilder.createExpression(this.conditions as Condition[]);
  }

  /**
   * Abstract method to build the operation.
   * Must be implemented by subclasses.
   *
   * @returns An object representing the operation.
   */
  abstract build(): TOperation;
}
