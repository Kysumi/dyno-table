/**
 * Interface for DynamoDB command objects that can contain expressions
 */
export interface DynamoCommandWithExpressions {
  conditionExpression?: string;
  updateExpression?: string;
  filterExpression?: string;
  keyConditionExpression?: string;
  projectionExpression?: string;
  searchConditionExpression?: string;
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
  searchConditionExpression?: string;
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
    const attributeNames =
      command.expressionAttributeNames ?? (command.ExpressionAttributeNames as Record<string, string> | undefined);
    const attributeValues =
      command.expressionAttributeValues ?? (command.ExpressionAttributeValues as Record<string, unknown> | undefined);
    for (const alias in attributeNames) {
      const attributeName = attributeNames?.[alias];
      const regex = new RegExp(alias, "g");

      replacedString = replacedString.replace(regex, attributeName as string);
    }

    for (const alias in attributeValues) {
      let attributeValue = attributeValues?.[alias];

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
  const searchConditionExpression =
    command.searchConditionExpression ?? (command.SearchConditionExpression as string | undefined);
  if (searchConditionExpression) {
    result.searchConditionExpression = replaceAliases(searchConditionExpression);
  }
  const projectionExpression = command.projectionExpression ?? (command.ProjectionExpression as string | undefined);
  if (!command.projectionExpression && projectionExpression) {
    result.projectionExpression = replaceAliases(projectionExpression);
  }

  return {
    raw: command,
    readable: result,
  };
}
