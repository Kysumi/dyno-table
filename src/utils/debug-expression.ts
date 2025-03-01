/**
 * Utility function to replace attribute name and value placeholders in DynamoDB expressions
 * with their actual values for easier debugging.
 *
 * @param expression The DynamoDB expression (condition, update, filter, etc.)
 * @param attributeNames Map of attribute name placeholders to actual attribute names
 * @param attributeValues Map of value placeholders to actual values
 * @returns A human-readable expression with placeholders replaced by actual values
 */
export function debugExpression(
  expression: string | undefined,
  attributeNames?: Record<string, string>,
  attributeValues?: Record<string, unknown>,
): string {
  if (!expression) {
    return "";
  }

  let result = expression;

  // Replace attribute name placeholders (#n1, #n2, etc.) with their actual names
  if (attributeNames) {
    for (const [placeholder, actualName] of Object.entries(attributeNames)) {
      // Use a regex with word boundaries to ensure we replace complete tokens
      const regex = new RegExp(`\\b${placeholder}\\b`, "g");
      result = result.replace(regex, `"${actualName}"`);
    }
  }

  // Replace value placeholders (:v1, :v2, etc.) with their string representation
  if (attributeValues) {
    for (const [placeholder, value] of Object.entries(attributeValues)) {
      const regex = new RegExp(`\\b${placeholder}\\b`, "g");

      // Format the value based on its type
      let formattedValue: string;

      if (value === null || value === undefined) {
        formattedValue = "null";
      } else if (typeof value === "string") {
        formattedValue = `"${value}"`;
      } else if (typeof value === "number" || typeof value === "boolean") {
        formattedValue = String(value);
      } else if (value instanceof Set) {
        formattedValue = `Set(${JSON.stringify(Array.from(value))})`;
      } else if (Array.isArray(value)) {
        formattedValue = JSON.stringify(value);
      } else if (typeof value === "object") {
        formattedValue = JSON.stringify(value);
      } else {
        formattedValue = String(value);
      }

      result = result.replace(regex, formattedValue);
    }
  }

  return result;
}

/**
 * Interface for DynamoDB command objects that can contain expressions
 */
export interface DynamoCommandWithExpressions {
  conditionExpression?: string;
  updateExpression?: string;
  filterExpression?: string;
  keyConditionExpression?: string;
  projectionExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, unknown>;
  [key: string]: unknown;
}

type ReadableDynamoCommand = {
  conditionExpression?: string;
  updateExpression?: string;
  filterExpression?: string;
  keyConditionExpression?: string;
  projectionExpression?: string;
};

/**
 * Utility function to debug a DynamoDB command by replacing all placeholders
 * in expressions with their actual values.
 *
 * @param command Any DynamoDB command with expressions and attribute maps
 * @returns An object with the same structure but with readable expressions
 */
export function debugCommand<T extends DynamoCommandWithExpressions>(
  command: T,
): {
  raw: T;
  readable: ReadableDynamoCommand;
} {
  // Create a copy of the command
  const result: ReadableDynamoCommand = {};

  function replaceAliases(expressionString: string) {
    if (!expressionString) {
      return expressionString;
    }

    let replacedString = expressionString;
    for (const alias in command.expressionAttributeNames) {
      const attributeName = command.expressionAttributeNames[alias];
      const regex = new RegExp(alias, "g");

      replacedString = replacedString.replace(regex, attributeName as string);
    }

    for (const alias in command.expressionAttributeValues) {
      let attributeValue = command.expressionAttributeValues[alias];

      // Handle Set objects for better readability
      if (attributeValue instanceof Set) {
        const array = Array.from(attributeValue);
        attributeValue = `Set(${array.length}){${array.map((v) => JSON.stringify(v)).join(", ")}}`;
      } else {
        // Stringify other values for display
        attributeValue = JSON.stringify(attributeValue);
      }

      const regex = new RegExp(alias, "g");
      replacedString = replacedString.replace(regex, attributeValue as string);
    }

    return replacedString;
  }

  if (command.updateExpression) {
    result.updateExpression = replaceAliases(command.updateExpression);
  }
  if (command.conditionExpression) {
    result.conditionExpression = replaceAliases(command.conditionExpression);
  }
  if (command.filterExpression) {
    result.filterExpression = replaceAliases(command.filterExpression);
  }
  if (command.keyConditionExpression) {
    result.keyConditionExpression = replaceAliases(command.keyConditionExpression);
  }
  if (command.projectionExpression) {
    result.projectionExpression = replaceAliases(command.projectionExpression);
  }

  return {
    raw: command,
    readable: result,
  };
}
