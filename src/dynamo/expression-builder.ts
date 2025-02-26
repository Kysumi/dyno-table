import {
  type AttributeExists,
  type AttributeNotExists,
  type AttributeType,
  type BeginsWith,
  type Condition,
  type Contains,
  DynamoDBAttributeType,
  type Expression,
  type LogicalOperator,
  type RawExpression,
  type Size,
} from "./query-builder";

// Define the structure of the DynamoDB filter object
export interface DynamoDBFilter {
  FilterExpression: string;
  ExpressionAttributeValues: { [key: string]: any };
  ExpressionAttributeNames: { [key: string]: string };
}

// Helper function to escape value for expression attributes
function escapeValue(name: string): string {
  return `:${name.replace(/[^a-zA-Z0-9_]+/g, "")}`;
}

// Helper function to handle attribute paths including nested properties and array indices
function processAttributePath(
  path: string,
  attributeNames: { [key: string]: string },
  prefix: string,
  counter: number,
): {
  expressionPath: string;
  nextCounter: number;
} {
  const parts = path.split(".");
  const expressionParts: string[] = [];
  let currentCounter = counter;

  parts.forEach((part) => {
    // Check if there's an array index in the path (e.g., items[0])
    const indexMatch = part.match(/^(.+)\[(\d+)\]$/);

    if (indexMatch) {
      // Handle array indexing
      const arrayName = indexMatch[1];
      const arrayIndex = indexMatch[2];

      const nameKey = `${prefix}${currentCounter++}`;
      const escapedName = `#${nameKey}`;
      attributeNames[escapedName] = arrayName;

      expressionParts.push(`${escapedName}[${arrayIndex}]`);
    } else {
      // Regular attribute name
      const nameKey = `${prefix}${currentCounter++}`;
      const escapedName = `#${nameKey}`;
      attributeNames[escapedName] = part;

      expressionParts.push(escapedName);
    }
  });

  return {
    expressionPath: expressionParts.join("."),
    nextCounter: currentCounter,
  };
}

// Main function to build the DynamoDB filter
export function buildDynamoDBFilter<T>(expression: Expression<T>, prefix = "a"): DynamoDBFilter {
  const attributeValues: { [key: string]: any } = {};
  const attributeNames: { [key: string]: string } = {};
  let counter = 0;

  // Recursive function to process each expression
  function processExpression(expr: Expression<T>): string {
    if (isCondition(expr)) {
      // Handle nested attribute paths
      const { expressionPath, nextCounter } = processAttributePath(expr.field, attributeNames, prefix, counter);
      counter = nextCounter;

      switch (expr.operator) {
        case "BETWEEN":
          if (Array.isArray(expr.value) && expr.value.length === 2) {
            const lowerValueKey = `${prefix}${counter++}`;
            const upperValueKey = `${prefix}${counter++}`;
            const escapedLowerValue = escapeValue(lowerValueKey);
            const escapedUpperValue = escapeValue(upperValueKey);

            attributeValues[escapedLowerValue] = expr.value[0];
            attributeValues[escapedUpperValue] = expr.value[1];

            return `(${expressionPath} BETWEEN ${escapedLowerValue} AND ${escapedUpperValue})`;
          } else {
            throw new Error("BETWEEN operator requires an array of two values");
          }
        case "IN":
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
          } else {
            throw new Error("IN operator requires an array of values");
          }
        default:
          const attributeValueKey = `${prefix}${counter++}`;
          const escapedValue = escapeValue(attributeValueKey);
          attributeValues[escapedValue] = expr.value;
          return `(${expressionPath} ${expr.operator} ${escapedValue})`;
      }
    } else if (isLogicalOperator(expr)) {
      // Handle LogicalOperator expressions (AND, OR, NOT)
      const subExpressions = expr.expressions.map(processExpression);

      if (expr.operator === "NOT" && subExpressions.length === 1) {
        return `(NOT ${subExpressions[0]})`;
      }

      return `(${subExpressions.join(` ${expr.operator} `)})`;
    } else if (isAttributeExists(expr)) {
      // Handle AttributeExists expressions
      const { expressionPath, nextCounter } = processAttributePath(expr.field, attributeNames, prefix, counter);
      counter = nextCounter;
      return `(attribute_exists(${expressionPath}))`;
    } else if (isAttributeNotExists(expr)) {
      // Handle AttributeNotExists expressions
      const { expressionPath, nextCounter } = processAttributePath(expr.field, attributeNames, prefix, counter);
      counter = nextCounter;
      return `(attribute_not_exists(${expressionPath}))`;
    } else if (isAttributeType(expr)) {
      // Handle AttributeType expressions
      const { expressionPath, nextCounter } = processAttributePath(expr.field, attributeNames, prefix, counter);
      counter = nextCounter;

      const attributeValueKey = `${prefix}${counter++}`;
      const escapedValue = escapeValue(attributeValueKey);
      attributeValues[escapedValue] = expr.attributeType;

      return `(attribute_type(${expressionPath}, ${escapedValue}))`;
    } else if (isContains(expr)) {
      // Handle Contains expressions
      const { expressionPath, nextCounter } = processAttributePath(expr.field, attributeNames, prefix, counter);
      counter = nextCounter;

      const attributeValueKey = `${prefix}${counter++}`;
      const escapedValue = escapeValue(attributeValueKey);
      attributeValues[escapedValue] = expr.value;

      return `(contains(${expressionPath}, ${escapedValue}))`;
    } else if (isBeginsWith(expr)) {
      // Handle BeginsWith expressions
      const { expressionPath, nextCounter } = processAttributePath(expr.field, attributeNames, prefix, counter);
      counter = nextCounter;

      const attributeValueKey = `${prefix}${counter++}`;
      const escapedValue = escapeValue(attributeValueKey);
      attributeValues[escapedValue] = expr.value;

      return `(begins_with(${expressionPath}, ${escapedValue}))`;
    } else if (isSize(expr)) {
      // Handle Size expressions
      const { expressionPath, nextCounter } = processAttributePath(expr.field, attributeNames, prefix, counter);
      counter = nextCounter;

      const attributeValueKey = `${prefix}${counter++}`;
      const escapedValue = escapeValue(attributeValueKey);
      attributeValues[escapedValue] = expr.value;

      return `(size(${expressionPath}) ${expr.operator} ${escapedValue})`;
    } else if (isRawExpression(expr)) {
      // Handle RawExpression expressions
      if (expr.params) {
        let processedRaw = expr.raw;
        expr.params.forEach((param, index) => {
          const paramKey = `${prefix}${counter++}`;
          const escapedParam = escapeValue(paramKey);
          attributeValues[escapedParam] = param;
          processedRaw = processedRaw.replace(`$${index + 1}`, escapedParam);
        });
        return `(${processedRaw})`;
      }
      return `(${expr.raw})`;
    }
    throw new Error("Unknown expression type");
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
}

// Function to generate a KeyConditionExpression
export function buildKeyConditionExpression<T>(expression: Expression<T>, prefix = "k"): DynamoDBFilter {
  return buildDynamoDBFilter(expression, prefix);
}

// Function to generate a ProjectionExpression
export function buildProjectionExpression(
  attributes: string[],
  prefix = "p",
): {
  ProjectionExpression: string;
  ExpressionAttributeNames: { [key: string]: string };
} {
  const attributeNames: { [key: string]: string } = {};
  let counter = 0;

  const projections = attributes.map((attr) => {
    const { expressionPath, nextCounter } = processAttributePath(attr, attributeNames, prefix, counter);
    counter = nextCounter;
    return expressionPath;
  });

  return {
    ProjectionExpression: projections.join(", "),
    ExpressionAttributeNames: attributeNames,
  };
}

// --- Type Guard Functions ---

// Update expression builders for more complete DynamoDB support

// Build a SET update expression
export function buildSetUpdateExpression<T>(
  updates: Record<string, T>,
  prefix = "u",
): {
  UpdateExpression: string;
  ExpressionAttributeValues: { [key: string]: any };
  ExpressionAttributeNames: { [key: string]: string };
} {
  const attributeValues: { [key: string]: any } = {};
  const attributeNames: { [key: string]: string } = {};
  let counter = 0;

  const setExpressions = Object.entries(updates).map(([field, value]) => {
    const { expressionPath, nextCounter } = processAttributePath(field, attributeNames, prefix, counter);
    counter = nextCounter;

    const valueKey = `${prefix}${counter++}`;
    const escapedValue = escapeValue(valueKey);
    attributeValues[escapedValue] = value;

    return `${expressionPath} = ${escapedValue}`;
  });

  if (setExpressions.length === 0) {
    throw new Error("At least one update is required for SET operation");
  }

  return {
    UpdateExpression: `SET ${setExpressions.join(", ")}`,
    ExpressionAttributeValues: attributeValues,
    ExpressionAttributeNames: attributeNames,
  };
}

// Build a REMOVE update expression
export function buildRemoveUpdateExpression(
  attributes: string[],
  prefix = "r",
): {
  UpdateExpression: string;
  ExpressionAttributeNames: { [key: string]: string };
} {
  const attributeNames: { [key: string]: string } = {};
  let counter = 0;

  const removeExpressions = attributes.map((field) => {
    const { expressionPath, nextCounter } = processAttributePath(field, attributeNames, prefix, counter);
    counter = nextCounter;

    return expressionPath;
  });

  if (removeExpressions.length === 0) {
    throw new Error("At least one attribute is required for REMOVE operation");
  }

  return {
    UpdateExpression: `REMOVE ${removeExpressions.join(", ")}`,
    ExpressionAttributeNames: attributeNames,
  };
}

// Build an ADD update expression
export function buildAddUpdateExpression<T>(
  updates: Record<string, T>,
  prefix = "a",
): {
  UpdateExpression: string;
  ExpressionAttributeValues: { [key: string]: unknown };
  ExpressionAttributeNames: { [key: string]: string };
} {
  const attributeValues: { [key: string]: unknown } = {};
  const attributeNames: { [key: string]: string } = {};
  let counter = 0;

  const addExpressions = Object.entries(updates).map(([field, value]) => {
    const { expressionPath, nextCounter } = processAttributePath(field, attributeNames, prefix, counter);
    counter = nextCounter;

    const valueKey = `${prefix}${counter++}`;
    const escapedValue = escapeValue(valueKey);
    attributeValues[escapedValue] = value;

    return `${expressionPath} ${escapedValue}`;
  });

  if (addExpressions.length === 0) {
    throw new Error("At least one update is required for ADD operation");
  }

  return {
    UpdateExpression: `ADD ${addExpressions.join(", ")}`,
    ExpressionAttributeValues: attributeValues,
    ExpressionAttributeNames: attributeNames,
  };
}

// Build a DELETE update expression (for removing elements from a set)
export function buildDeleteUpdateExpression<T>(
  updates: Record<string, T[]>,
  prefix = "d",
): {
  UpdateExpression: string;
  ExpressionAttributeValues: { [key: string]: unknown };
  ExpressionAttributeNames: { [key: string]: string };
} {
  const attributeValues: { [key: string]: unknown } = {};
  const attributeNames: { [key: string]: string } = {};
  let counter = 0;

  const deleteExpressions = Object.entries(updates).map(([field, values]) => {
    const { expressionPath, nextCounter } = processAttributePath(field, attributeNames, prefix, counter);
    counter = nextCounter;

    const valueKey = `${prefix}${counter++}`;
    const escapedValue = escapeValue(valueKey);
    attributeValues[escapedValue] = values;

    return `${expressionPath} ${escapedValue}`;
  });

  if (deleteExpressions.length === 0) {
    throw new Error("At least one update is required for DELETE operation");
  }

  return {
    UpdateExpression: `DELETE ${deleteExpressions.join(", ")}`,
    ExpressionAttributeValues: attributeValues,
    ExpressionAttributeNames: attributeNames,
  };
}

// Combine multiple update expressions
export function combineUpdateExpressions(
  ...expressions: {
    UpdateExpression: string;
    ExpressionAttributeValues?: { [key: string]: unknown };
    ExpressionAttributeNames?: { [key: string]: string };
  }[]
): {
  UpdateExpression: string;
  ExpressionAttributeValues: { [key: string]: unknown };
  ExpressionAttributeNames: { [key: string]: string };
} {
  const updateParts: string[] = [];
  let attributeValues: { [key: string]: unknown } = {};
  let attributeNames: { [key: string]: string } = {};

  for (const expr of expressions) {
    updateParts.push(expr.UpdateExpression);

    if (expr.ExpressionAttributeValues) {
      attributeValues = {
        ...attributeValues,
        ...expr.ExpressionAttributeValues,
      };
    }

    if (expr.ExpressionAttributeNames) {
      attributeNames = { ...attributeNames, ...expr.ExpressionAttributeNames };
    }
  }

  return {
    UpdateExpression: updateParts.join(" "),
    ExpressionAttributeValues: attributeValues,
    ExpressionAttributeNames: attributeNames,
  };
}

// Generate a ConditionExpression for conditional updates or deletes
export function buildConditionExpression<T>(
  expression: Expression<T>,
  prefix = "c",
): {
  ConditionExpression: string;
  ExpressionAttributeValues: { [key: string]: unknown };
  ExpressionAttributeNames: { [key: string]: string };
} {
  const result = buildDynamoDBFilter(expression, prefix);

  return {
    ConditionExpression: result.FilterExpression,
    ExpressionAttributeValues: result.ExpressionAttributeValues,
    ExpressionAttributeNames: result.ExpressionAttributeNames,
  };
}

// Merge multiple DynamoDB expression objects
export function mergeExpressionAttributes(
  ...expressions: {
    ExpressionAttributeValues?: { [key: string]: unknown };
    ExpressionAttributeNames?: { [key: string]: string };
  }[]
): {
  ExpressionAttributeValues: { [key: string]: unknown } | undefined;
  ExpressionAttributeNames: { [key: string]: string } | undefined;
} {
  let attributeValues: { [key: string]: unknown } = {};
  let attributeNames: { [key: string]: string } = {};

  for (const expr of expressions) {
    if (expr.ExpressionAttributeValues) {
      attributeValues = {
        ...attributeValues,
        ...expr.ExpressionAttributeValues,
      };
    }

    if (expr.ExpressionAttributeNames) {
      attributeNames = { ...attributeNames, ...expr.ExpressionAttributeNames };
    }
  }

  return {
    ExpressionAttributeValues: Object.keys(attributeValues).length > 0 ? attributeValues : undefined,
    ExpressionAttributeNames: Object.keys(attributeNames).length > 0 ? attributeNames : undefined,
  };
}
