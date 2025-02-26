// Debug function to get a readable expression without aliases
import type { Expression } from "../builders/operators";
import {
  isAttributeExists,
  isAttributeNotExists,
  isAttributeType,
  isBeginsWith,
  isCondition,
  isContains,
  isLogicalOperator,
  isSize,
} from "./util";

export function getReadableExpression<T>(expression: Expression<T>): string {
  function processExpressionForReadability(expr: Expression<T>): string {
    if (isAttributeExists(expr)) {
      return `(attribute_exists(${expr.field}))`;
    }
    if (isAttributeNotExists(expr)) {
      return `(attribute_not_exists(${expr.field}))`;
    }
    if (isAttributeType(expr)) {
      return `(attribute_type(${expr.field}, "${expr.attributeType}"))`;
    }
    if (isContains(expr)) {
      return `(contains(${expr.field}, ${JSON.stringify(expr.value)}))`;
    }
    if (isBeginsWith(expr)) {
      return `(begins_with(${expr.field}, ${JSON.stringify(expr.value)}))`;
    }
    if (isSize(expr)) {
      return `(size(${expr.field}) ${expr.operator} ${expr.value})`;
    }

    if (isCondition(expr)) {
      if (expr.operator === "BETWEEN" && Array.isArray(expr.value) && expr.value.length === 2) {
        return `(${expr.field} BETWEEN ${JSON.stringify(expr.value[0])} AND ${JSON.stringify(expr.value[1])})`;
      }
      if (expr.operator === "IN" && Array.isArray(expr.value)) {
        const values = expr.value.map((v) => JSON.stringify(v)).join(", ");
        return `(${expr.field} IN (${values}))`;
      }
      return `(${expr.field} ${expr.operator} ${JSON.stringify(expr.value)})`;
    }
    if (isLogicalOperator(expr)) {
      const subExpressions = expr.expressions.map(processExpressionForReadability);

      if (expr.operator === "NOT" && subExpressions.length === 1) {
        return `(NOT ${subExpressions[0]})`;
      }

      return `(${subExpressions.join(` ${expr.operator} `)})`;
    }

    throw new Error("Unknown expression type");
  }

  return processExpressionForReadability(expression);
}
