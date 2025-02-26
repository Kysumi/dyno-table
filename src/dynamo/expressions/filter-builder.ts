import type { Expression } from "../../builders/operators";
import type { DynamoDBFilter } from "./expression-builder";
import {
  escapeValue,
  isAttributeExists,
  isAttributeNotExists,
  isAttributeType,
  isBeginsWith,
  isCondition,
  isContains,
  isLogicalOperator,
  isSize,
  processAttributePath,
} from "./util";

export const buildDynamoDBFilter = <T>(expression: Expression<T>, prefix = "a"): DynamoDBFilter => {
  const attributeValues: { [key: string]: unknown } = {};
  const attributeNames: { [key: string]: string } = {};
  let counter = 0;

  // Recursive function to process each expression
  function processExpression(expr: Expression<T>): string {
    if (isCondition(expr)) {
      // Handle nested attribute paths
      const { expressionPath, nextCounter } = processAttributePath(expr.field, attributeNames, prefix, counter);
      counter = nextCounter;

      switch (expr.operator) {
        case "BETWEEN": {
          if (Array.isArray(expr.value) && expr.value.length === 2) {
            const lowerValueKey = `${prefix}${counter++}`;
            const upperValueKey = `${prefix}${counter++}`;
            const escapedLowerValue = escapeValue(lowerValueKey);
            const escapedUpperValue = escapeValue(upperValueKey);

            attributeValues[escapedLowerValue] = expr.value[0];
            attributeValues[escapedUpperValue] = expr.value[1];

            return `(${expressionPath} BETWEEN ${escapedLowerValue} AND ${escapedUpperValue})`;
          }

          throw new Error("BETWEEN operator requires an array of two values");
        }
        case "IN": {
          if (Array.isArray(expr.value)) {
            const inValues = expr.value
              .map((val) => {
                const inValueKey = `${prefix}${counter++}`;
                const escapedInValue = escapeValue(inValueKey);
                attributeValues[escapedInValue] = val;
                return escapedInValue;
              })
              .join(", ");
            return `(${expressionPath} IN (${inValues}))`;
          }
          throw new Error("IN operator requires an array of values");
        }
        default: {
          const attributeValueKey = `${prefix}${counter++}`;
          const escapedValue = escapeValue(attributeValueKey);
          attributeValues[escapedValue] = expr.value;
          return `(${expressionPath} ${expr.operator} ${escapedValue})`;
        }
      }
    }

    if (isLogicalOperator(expr)) {
      // Handle LogicalOperator expressions (AND, OR, NOT)
      const subExpressions = expr.expressions.map(processExpression);

      if (expr.operator === "NOT" && subExpressions.length === 1) {
        return `(NOT ${subExpressions[0]})`;
      }

      return `(${subExpressions.join(` ${expr.operator} `)})`;
    }
    if (isAttributeExists(expr)) {
      // Handle AttributeExists expressions
      const { expressionPath, nextCounter } = processAttributePath(expr.field, attributeNames, prefix, counter);
      counter = nextCounter;
      return `(attribute_exists(${expressionPath}))`;
    }
    if (isAttributeNotExists(expr)) {
      // Handle AttributeNotExists expressions
      const { expressionPath, nextCounter } = processAttributePath(expr.field, attributeNames, prefix, counter);
      counter = nextCounter;
      return `(attribute_not_exists(${expressionPath}))`;
    }
    if (isAttributeType(expr)) {
      // Handle AttributeType expressions
      const { expressionPath, nextCounter } = processAttributePath(expr.field, attributeNames, prefix, counter);
      counter = nextCounter;

      const attributeValueKey = `${prefix}${counter++}`;
      const escapedValue = escapeValue(attributeValueKey);
      attributeValues[escapedValue] = expr.attributeType;

      return `(attribute_type(${expressionPath}, ${escapedValue}))`;
    }
    if (isContains(expr)) {
      // Handle Contains expressions
      const { expressionPath, nextCounter } = processAttributePath(expr.field, attributeNames, prefix, counter);
      counter = nextCounter;

      const attributeValueKey = `${prefix}${counter++}`;
      const escapedValue = escapeValue(attributeValueKey);
      attributeValues[escapedValue] = expr.value;

      return `(contains(${expressionPath}, ${escapedValue}))`;
    }
    if (isBeginsWith(expr)) {
      // Handle BeginsWith expressions
      const { expressionPath, nextCounter } = processAttributePath(expr.field, attributeNames, prefix, counter);
      counter = nextCounter;

      const attributeValueKey = `${prefix}${counter++}`;
      const escapedValue = escapeValue(attributeValueKey);
      attributeValues[escapedValue] = expr.value;

      return `(begins_with(${expressionPath}, ${escapedValue}))`;
    }
    if (isSize(expr)) {
      // Handle Size expressions
      const { expressionPath, nextCounter } = processAttributePath(expr.field, attributeNames, prefix, counter);
      counter = nextCounter;

      const attributeValueKey = `${prefix}${counter++}`;
      const escapedValue = escapeValue(attributeValueKey);
      attributeValues[escapedValue] = expr.value;

      return `(size(${expressionPath}) ${expr.operator} ${escapedValue})`;
    }

    throw new Error("Unknown expression type", {
      cause: {
        expr,
      },
    });
  }

  // Start processing the expression
  const FilterExpression = processExpression(expression);

  // Only return attributes if they're used
  const ExpressionAttributeValues = Object.keys(attributeValues).length > 0 ? attributeValues : undefined;

  const ExpressionAttributeNames = Object.keys(attributeNames).length > 0 ? attributeNames : undefined;

  // Return the DynamoDB filter object
  return {
    FilterExpression,
    ExpressionAttributeValues,
    ExpressionAttributeNames,
  } as DynamoDBFilter;
};
