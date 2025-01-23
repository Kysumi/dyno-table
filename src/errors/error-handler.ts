import type { ExpressionAttributes } from "../builders/operators";
import { ConditionalCheckFailedError, DynamoError, ResourceNotFoundError, ValidationError } from "./dynamo-error";
import type { ErrorContext, TranslatedQuery } from "./types";

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

function translateCommandInput(commandInput: Record<string, unknown>): TranslatedQuery {
  const translated: TranslatedQuery = {
    TableName: commandInput.TableName as string,
  };

  const names = commandInput.ExpressionAttributeNames as Record<string, string>;
  const values = commandInput.ExpressionAttributeValues as Record<string, unknown>;

  // Translate KeyConditionExpression if present
  if (commandInput.KeyConditionExpression) {
    translated.KeyConditionExpression = translateExpression(commandInput.KeyConditionExpression as string, {
      names,
      values,
    });
  }
  // Translate UpdateExpression if present
  if (commandInput.UpdateExpression) {
    translated.UpdateExpression = translateExpression(commandInput.UpdateExpression as string, { names, values });
  }

  // Translate FilterExpression if present
  if (commandInput.FilterExpression) {
    translated.FilterExpression = translateExpression(commandInput.FilterExpression as string, { names, values });
  }

  // Copy other relevant fields
  if (commandInput.IndexName) translated.IndexName = commandInput.IndexName as string;
  if (commandInput.ConsistentRead !== undefined) translated.ConsistentRead = commandInput.ConsistentRead as boolean;
  if (commandInput.ScanIndexForward !== undefined)
    translated.ScanIndexForward = commandInput.ScanIndexForward as boolean;
  if (commandInput.Limit !== undefined) translated.Limit = commandInput.Limit as number;

  return translated;
}

function buildErrorMessage(context: ErrorContext, error: Error): string {
  const parts: string[] = [`DynamoDB ${context.operation} operation failed`];

  if (context.tableName) {
    parts.push(`\nTable: ${context.tableName}`);
  }

  if (context.commandInput) {
    const translatedQuery = translateCommandInput(context.commandInput);
    parts.push(`\nGenerated Query: ${JSON.stringify(translatedQuery, null, 2)}`);
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

    case "ValidationException":
      throw ValidationError.fromDynamoError(errorMessage, error, context);

    default:
      throw new DynamoError(errorMessage, error, context);
  }
}
