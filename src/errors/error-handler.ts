import type { ExpressionAttributes } from "../builders/operators";
import { ConditionalCheckFailedError, DynamoError, ResourceNotFoundError } from "./dynamo-error";

interface ErrorContext extends Record<string, unknown> {
  operation: string;
  tableName: string;
  key?: Record<string, unknown>;
  expression?: {
    condition?: string;
    update?: string;
    filter?: string;
    keyCondition?: string;
  };
  attributes?: ExpressionAttributes;
}

function translateExpression(expression: string | undefined, attributes?: ExpressionAttributes): string {
  if (!expression || !attributes) return expression || "";

  let translated = expression;

  // Replace attribute name aliases with actual names
  if (attributes.names) {
    for (const [alias, name] of Object.entries(attributes.names)) {
      translated = translated.replace(new RegExp(alias, "g"), name);
    }
  }

  // Replace value aliases with actual values
  if (attributes.values) {
    for (const [alias, value] of Object.entries(attributes.values)) {
      translated = translated.replace(new RegExp(alias, "g"), typeof value === "string" ? `"${value}"` : String(value));
    }
  }

  return translated;
}

function buildErrorMessage(context: ErrorContext, error: Error): string {
  const parts: string[] = [`DynamoDB ${context.operation} operation failed`];

  if (context.tableName) {
    parts.push(`\nTable: ${context.tableName}`);
  }

  if (context.key) {
    parts.push(`\nKey: ${JSON.stringify(context.key, null, 2)}`);
  }

  if (context.expression) {
    const { condition, update, filter, keyCondition } = context.expression;

    if (condition) {
      parts.push(`\nCondition: ${translateExpression(condition, context.attributes)}`);
    }
    if (update) {
      parts.push(`\nUpdate: ${translateExpression(update, context.attributes)}`);
    }
    if (filter) {
      parts.push(`\nFilter: ${translateExpression(filter, context.attributes)}`);
    }
    if (keyCondition) {
      parts.push(`\nKey Condition: ${translateExpression(keyCondition, context.attributes)}`);
    }
  }

  parts.push(`\nOriginal Error: ${error.message}`);

  return parts.join("");
}

export function handleDynamoError(error: unknown, context: ErrorContext): never {
  if (!(error instanceof Error)) {
    throw error;
  }

  const errorMessage = buildErrorMessage(context, error);

  switch (error.name) {
    case "ConditionalCheckFailedException":
      throw new ConditionalCheckFailedError(errorMessage, error, context);

    case "ResourceNotFoundException":
      throw new ResourceNotFoundError(errorMessage, error, context);

    default:
      throw new DynamoError(errorMessage, error, context);
  }
}
