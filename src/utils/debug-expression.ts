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
