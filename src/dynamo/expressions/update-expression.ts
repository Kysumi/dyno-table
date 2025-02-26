import { escapeValue, processAttributePath } from "./util";

export const buildSetUpdateExpression = <T>(
  updates: Record<string, T>,
  prefix = "u",
): {
  UpdateExpression: string;
  ExpressionAttributeValues: { [key: string]: unknown };
  ExpressionAttributeNames: { [key: string]: string };
} => {
  const attributeValues: { [key: string]: unknown } = {};
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
};
