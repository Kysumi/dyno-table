import type { ComparisonOperator, Condition, ExpressionParams, LogicalOperator } from "./conditions";
import { ExpressionErrors } from "./utils/error-factory";

export const generateAttributeName = (params: ExpressionParams, attr: string): string => {
  // Handle nested paths by splitting on dots
  if (attr.includes(".")) {
    const pathSegments = attr.split(".");
    const segmentNames: string[] = [];

    for (const segment of pathSegments) {
      // Check if this segment already exists in expressionAttributeNames
      let segmentName: string | undefined;
      for (const [existingName, existingAttr] of Object.entries(params.expressionAttributeNames)) {
        if (existingAttr === segment) {
          segmentName = existingName;
          break;
        }
      }

      // If not found, create a new attribute name for this segment
      if (!segmentName) {
        segmentName = `#${Object.keys(params.expressionAttributeNames).length}`;
        params.expressionAttributeNames[segmentName] = segment;
      }

      segmentNames.push(segmentName);
    }

    return segmentNames.join(".");
  }

  // Handle single-level attributes (original logic)
  // Check if the attribute already exists in the expressionAttributeNames
  for (const [existingName, existingAttr] of Object.entries(params.expressionAttributeNames)) {
    if (existingAttr === attr) {
      return existingName;
    }
  }

  // If not found, create a new attribute name
  const attrName = `#${Object.keys(params.expressionAttributeNames).length}`;
  params.expressionAttributeNames[attrName] = attr;
  return attrName;
};

export const generateValueName = (params: ExpressionParams, value: unknown): string => {
  const valueName = `:${params.valueCounter.count++}`;
  params.expressionAttributeValues[valueName] = value;
  return valueName;
};

const validateCondition = (condition: Condition, requiresAttr = true, requiresValue = true): void => {
  if (requiresAttr && !condition.attr) {
    throw ExpressionErrors.missingAttribute(condition.type, condition);
  }

  if (requiresValue && condition.value === undefined) {
    throw ExpressionErrors.missingValue(condition.type, condition);
  }
};

const buildComparisonExpression = (condition: Condition, operator: string, params: ExpressionParams): string => {
  validateCondition(condition);

  if (!condition.attr) {
    throw ExpressionErrors.missingAttribute(condition.type, condition);
  }

  const attrName = generateAttributeName(params, condition.attr);
  const valueName = generateValueName(params, condition.value);

  return `${attrName} ${operator} ${valueName}`;
};

const buildBetweenExpression = (condition: Condition, params: ExpressionParams): string => {
  validateCondition(condition);

  if (!condition.attr) {
    throw ExpressionErrors.missingAttribute(condition.type, condition);
  }

  if (!Array.isArray(condition.value) || condition.value.length !== 2) {
    throw ExpressionErrors.invalidCondition(
      condition.type,
      condition,
      "Provide an array with exactly two values: [lowerBound, upperBound]",
    );
  }

  const attrName = generateAttributeName(params, condition.attr);
  const lowerName = generateValueName(params, condition.value[0]);
  const upperName = generateValueName(params, condition.value[1]);

  return `${attrName} BETWEEN ${lowerName} AND ${upperName}`;
};

const buildInExpression = (condition: Condition, params: ExpressionParams): string => {
  validateCondition(condition);

  if (!condition.attr) {
    throw ExpressionErrors.missingAttribute(condition.type, condition);
  }

  if (!Array.isArray(condition.value) || condition.value.length === 0) {
    throw ExpressionErrors.emptyArray(condition.type, condition.value);
  }

  if (condition.value.length > 100) {
    throw ExpressionErrors.invalidCondition(
      condition.type,
      condition,
      "Split your query into multiple operations or use a different condition type",
    );
  }

  const attrName = generateAttributeName(params, condition.attr);
  const valueNames = condition.value.map((value) => generateValueName(params, value));

  return `${attrName} IN (${valueNames.join(", ")})`;
};

const buildFunctionExpression = (functionName: string, condition: Condition, params: ExpressionParams): string => {
  validateCondition(condition);

  if (!condition.attr) {
    throw ExpressionErrors.missingAttribute(condition.type, condition);
  }

  const attrName = generateAttributeName(params, condition.attr);
  const valueName = generateValueName(params, condition.value);

  return `${functionName}(${attrName}, ${valueName})`;
};

const buildAttributeFunction = (functionName: string, condition: Condition, params: ExpressionParams): string => {
  validateCondition(condition, true, false);

  if (!condition.attr) {
    throw ExpressionErrors.missingAttribute(condition.type, condition);
  }

  const attrName = generateAttributeName(params, condition.attr);
  return `${functionName}(${attrName})`;
};

const buildLogicalExpression = (operator: string, conditions: Condition[], params: ExpressionParams): string => {
  if (!conditions || conditions.length === 0) {
    throw ExpressionErrors.emptyArray(operator, conditions);
  }

  const expressions = conditions.map((c) => buildExpression(c, params));
  return `(${expressions.join(` ${operator} `)})`;
};

export const buildExpression = (condition: Condition, params: ExpressionParams): string => {
  if (!condition) return "";

  // Map of condition types to their expression builders
  const expressionBuilders: Record<ComparisonOperator | LogicalOperator, () => string> = {
    eq: () => buildComparisonExpression(condition, "=", params),
    ne: () => buildComparisonExpression(condition, "<>", params),
    lt: () => buildComparisonExpression(condition, "<", params),
    lte: () => buildComparisonExpression(condition, "<=", params),
    gt: () => buildComparisonExpression(condition, ">", params),
    gte: () => buildComparisonExpression(condition, ">=", params),
    between: () => buildBetweenExpression(condition, params),
    in: () => buildInExpression(condition, params),
    beginsWith: () => buildFunctionExpression("begins_with", condition, params),
    contains: () => buildFunctionExpression("contains", condition, params),
    attributeExists: () => buildAttributeFunction("attribute_exists", condition, params),
    attributeNotExists: () => buildAttributeFunction("attribute_not_exists", condition, params),
    and: () => {
      if (!condition.conditions) {
        throw ExpressionErrors.invalidCondition(
          condition.type,
          condition,
          "Provide an array of conditions to combine with AND",
        );
      }
      return buildLogicalExpression("AND", condition.conditions, params);
    },
    or: () => {
      if (!condition.conditions) {
        throw ExpressionErrors.invalidCondition(
          condition.type,
          condition,
          "Provide an array of conditions to combine with OR",
        );
      }
      return buildLogicalExpression("OR", condition.conditions, params);
    },
    not: () => {
      if (!condition.condition) {
        throw ExpressionErrors.invalidCondition(condition.type, condition, "Provide a condition to negate with NOT");
      }
      return `NOT (${buildExpression(condition.condition, params)})`;
    },
  };

  const builder = expressionBuilders[condition.type];
  if (!builder) {
    throw ExpressionErrors.unknownType(condition.type, condition);
  }

  return builder();
};

export const prepareExpressionParams = (
  condition?: Condition,
): {
  expression?: string;
  names?: Record<string, string>;
  values?: Record<string, unknown>;
} => {
  if (!condition) return {};

  const params: ExpressionParams = {
    expressionAttributeNames: {},
    expressionAttributeValues: {},
    valueCounter: { count: 0 },
  };

  const expression = buildExpression(condition, params);

  return {
    expression,
    names: Object.keys(params.expressionAttributeNames).length > 0 ? params.expressionAttributeNames : undefined,
    values: Object.keys(params.expressionAttributeValues).length > 0 ? params.expressionAttributeValues : undefined,
  };
};
