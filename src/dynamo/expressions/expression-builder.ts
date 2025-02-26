import type { Expression } from "../../builders/operators";
import { buildDynamoDBFilter } from "./filter-builder";
import { escapeValue, processAttributePath } from "./util";

// Define the structure of the DynamoDB filter object
export interface DynamoDBFilter {
  FilterExpression: string;
  ExpressionAttributeValues: { [key: string]: unknown };
  ExpressionAttributeNames: { [key: string]: string };
}

// Helper function to escape value for expression attributes

// Helper function to handle attribute paths including nested properties and array indices

// Main function to build the DynamoDB filter

// Function to generate a KeyConditionExpression
export const buildKeyConditionExpression = <T>(expression: Expression<T>, prefix = "k"): DynamoDBFilter => {
  return buildDynamoDBFilter(expression, prefix);
};

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
