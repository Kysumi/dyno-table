import type { TransactWriteCommandInput } from "@aws-sdk/lib-dynamodb";
import type { DynamoItem, VectorIndexConfig } from "./types.js";
import { ConfigurationErrors, ValidationErrors } from "./utils/error-factory.js";

const isTopLevelAttribute = (attribute: string): boolean =>
  attribute.length > 0 && !attribute.includes(".") && !attribute.includes("[") && !attribute.includes("]");

export function validateVectorIndexes(vectorIndexes: Record<string, VectorIndexConfig>): void {
  const entries = Object.entries(vectorIndexes);
  if (entries.length > 5) {
    throw ConfigurationErrors.vectorIndexInvalid("*", "A table can configure at most five vector indexes");
  }

  const dimensionsByAttribute = new Map<string, number>();
  for (const [indexName, index] of entries) {
    if (!Number.isInteger(index.dimensions) || index.dimensions < 1 || index.dimensions > 4096) {
      throw ConfigurationErrors.vectorIndexInvalid(indexName, "dimensions must be an integer between 1 and 4096");
    }
    if (!["COSINE", "DOT_PRODUCT", "EUCLIDEAN"].includes(index.distanceFunction)) {
      throw ConfigurationErrors.vectorIndexInvalid(indexName, "distanceFunction is not supported");
    }

    const inlineFilters = index.inlineFilters ?? [];
    if (inlineFilters.length > 18 || new Set(inlineFilters).size !== inlineFilters.length) {
      throw ConfigurationErrors.vectorIndexInvalid(
        indexName,
        "inlineFilters must contain at most 18 unique attributes",
      );
    }

    const roles = [index.vectorAttribute, ...(index.partitionKey ? [index.partitionKey] : []), ...inlineFilters];
    if (roles.some((attribute) => !isTopLevelAttribute(attribute))) {
      throw ConfigurationErrors.vectorIndexInvalid(
        indexName,
        "vector search schema attributes must be top-level names",
      );
    }
    if (new Set(roles).size !== roles.length) {
      throw ConfigurationErrors.vectorIndexInvalid(
        indexName,
        "vector, partition, and inline-filter roles cannot overlap",
      );
    }

    if (!index.projection || !["ALL", "KEYS_ONLY", "INCLUDE"].includes(index.projection.type)) {
      throw ConfigurationErrors.vectorIndexInvalid(indexName, "projection must be ALL, KEYS_ONLY, or INCLUDE");
    }
    if (index.projection.type === "INCLUDE") {
      const attributes = index.projection.attributes;
      if (
        !Array.isArray(attributes) ||
        attributes.some((attribute) => !isTopLevelAttribute(attribute)) ||
        new Set(attributes).size !== attributes.length
      ) {
        throw ConfigurationErrors.vectorIndexInvalid(
          indexName,
          "INCLUDE projection attributes must be unique top-level names",
        );
      }
    }

    const existingDimensions = dimensionsByAttribute.get(index.vectorAttribute);
    if (existingDimensions !== undefined && existingDimensions !== index.dimensions) {
      throw ConfigurationErrors.vectorIndexInvalid(
        indexName,
        `vector attribute "${index.vectorAttribute}" has conflicting dimensions`,
      );
    }
    dimensionsByAttribute.set(index.vectorAttribute, index.dimensions);
  }
}

export function validateVectorValue(
  value: unknown,
  indexName: string,
  index: VectorIndexConfig,
): asserts value is number[] {
  if (!Array.isArray(value)) {
    throw ValidationErrors.vectorValueInvalid(
      indexName,
      index.vectorAttribute,
      index.dimensions,
      "value must be an array",
    );
  }
  if (value.length !== index.dimensions) {
    throw ValidationErrors.vectorValueInvalid(
      indexName,
      index.vectorAttribute,
      index.dimensions,
      `received ${value.length} dimensions`,
    );
  }
  for (let position = 0; position < value.length; position++) {
    if (!(position in value) || typeof value[position] !== "number" || !Number.isFinite(value[position])) {
      throw ValidationErrors.vectorValueInvalid(
        indexName,
        index.vectorAttribute,
        index.dimensions,
        `dimension ${position} must be a finite number`,
      );
    }
  }
}

// ponytail: validateItemVectors/validateVectorUpdates/validateTransactWriteVectors are called
// individually from each write path (put, update, batch, transaction in table.ts) by convention —
// there's no shared command-preparation chokepoint those builders funnel through. A new write path
// must remember to call the matching validator here, or it silently skips vector validation; the
// "validates vector configuration and every write entry point" test in
// src/__tests__/vector-search.test.ts is the regression guard for that. Upgrade to a shared
// prepare-command step if a fifth write path is added.
export function validateItemVectors(item: DynamoItem, vectorIndexes: Record<string, VectorIndexConfig>): void {
  for (const [indexName, index] of Object.entries(vectorIndexes)) {
    if (Object.hasOwn(item, index.vectorAttribute)) validateVectorValue(item[index.vectorAttribute], indexName, index);
  }
}

export function redactItemVectors(item: DynamoItem, vectorIndexes: Record<string, VectorIndexConfig>): DynamoItem {
  const redacted = { ...item };
  for (const index of Object.values(vectorIndexes)) {
    if (Object.hasOwn(redacted, index.vectorAttribute)) redacted[index.vectorAttribute] = "[vector redacted]";
  }
  return redacted;
}

export function validateVectorUpdates(
  updates: readonly { type: "SET" | "REMOVE" | "ADD" | "DELETE"; path: string; value?: unknown }[],
  vectorIndexes: Record<string, VectorIndexConfig>,
): void {
  for (const update of updates) {
    for (const [indexName, index] of Object.entries(vectorIndexes)) {
      if (update.path !== index.vectorAttribute) continue;
      if (update.type === "SET") validateVectorValue(update.value, indexName, index);
      if (update.type === "ADD" || update.type === "DELETE") {
        throw ValidationErrors.vectorValueInvalid(
          indexName,
          index.vectorAttribute,
          index.dimensions,
          `${update.type} is not supported for vector attributes; use SET or REMOVE`,
        );
      }
    }
  }
}

export function validateVectorUpdateExpression(
  updateExpression: string,
  names: Record<string, string> | undefined,
  values: Record<string, unknown> | undefined,
  vectorIndexes: Record<string, VectorIndexConfig>,
): void {
  const clauses = [...updateExpression.matchAll(/\b(SET|REMOVE|ADD|DELETE)\b/gi)];
  for (let position = 0; position < clauses.length; position++) {
    const match = clauses[position];
    if (!match || match.index === undefined) continue;
    const action = match[1]?.toUpperCase();
    const start = match.index + match[0].length;
    const end = clauses[position + 1]?.index ?? updateExpression.length;
    const body = updateExpression.slice(start, end);

    for (const [indexName, index] of Object.entries(vectorIndexes)) {
      const aliases = [
        index.vectorAttribute,
        ...Object.entries(names ?? {})
          .filter(([, name]) => name === index.vectorAttribute)
          .map(([alias]) => alias),
      ];
      for (const alias of aliases) {
        const token = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (action === "SET") {
          const valueAlias = body.match(new RegExp(`(?:^|,)\\s*${token}\\s*=\\s*(:[A-Za-z0-9_]+)`))?.[1];
          if (valueAlias) validateVectorValue(values?.[valueAlias], indexName, index);
        } else if (
          (action === "ADD" || action === "DELETE") &&
          new RegExp(`(?:^|,)\\s*${token}(?:\\s|,|$)`).test(body)
        ) {
          throw ValidationErrors.vectorValueInvalid(
            indexName,
            index.vectorAttribute,
            index.dimensions,
            `${action} is not supported for vector attributes; use SET or REMOVE`,
          );
        }
      }
    }
  }
}

export function validateTransactWriteVectors(
  input: TransactWriteCommandInput,
  tableName: string,
  vectorIndexes: Record<string, VectorIndexConfig>,
): void {
  for (const item of input.TransactItems ?? []) {
    if (item.Put?.TableName === tableName && item.Put.Item) validateItemVectors(item.Put.Item, vectorIndexes);
    if (item.Update?.TableName === tableName && item.Update.UpdateExpression) {
      validateVectorUpdateExpression(
        item.Update.UpdateExpression,
        item.Update.ExpressionAttributeNames,
        item.Update.ExpressionAttributeValues,
        vectorIndexes,
      );
    }
  }
}

export function projectedVectorAttributes(
  index: VectorIndexConfig,
  partitionKey: string,
  sortKey?: string,
): Set<string> | undefined {
  if (index.projection.type === "ALL") return undefined;
  return new Set([
    partitionKey,
    ...(sortKey ? [sortKey] : []),
    index.vectorAttribute,
    ...(index.partitionKey ? [index.partitionKey] : []),
    ...(index.inlineFilters ?? []),
    ...(index.projection.type === "INCLUDE" ? index.projection.attributes : []),
  ]);
}
