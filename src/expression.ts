import type { ComparisonOperator, Condition, ExpressionParams, LogicalOperator } from "./conditions";

export const generateAttributeName = (params: ExpressionParams, attr: string): string => {
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
    throw new Error(`Attribute is required for ${condition.type} condition`);
  }

  if (requiresValue && condition.value === undefined) {
    throw new Error(`Value is required for ${condition.type} condition`);
  }
};

const buildComparisonExpression = (condition: Condition, operator: string, params: ExpressionParams): string => {
  validateCondition(condition);

  if (!condition.attr) {
    throw new Error(`Attribute is required for ${condition.type} condition`);
  }

  const attrName = generateAttributeName(params, condition.attr);
  const valueName = generateValueName(params, condition.value);

  return `${attrName} ${operator} ${valueName}`;
};

const buildBetweenExpression = (condition: Condition, params: ExpressionParams): string => {
  validateCondition(condition);

  if (!condition.attr) {
    throw new Error(`Attribute is required for ${condition.type} condition`);
  }

  if (!Array.isArray(condition.value) || condition.value.length !== 2) {
    throw new Error("Between condition requires an array of two values");
  }

  const attrName = generateAttributeName(params, condition.attr);
  const lowerName = generateValueName(params, condition.value[0]);
  const upperName = generateValueName(params, condition.value[1]);

  return `${attrName} BETWEEN ${lowerName} AND ${upperName}`;
};

const buildFunctionExpression = (functionName: string, condition: Condition, params: ExpressionParams): string => {
  validateCondition(condition);

  if (!condition.attr) {
    throw new Error(`Attribute is required for ${condition.type} condition`);
  }

  const attrName = generateAttributeName(params, condition.attr);
  const valueName = generateValueName(params, condition.value);

  return `${functionName}(${attrName}, ${valueName})`;
};

const buildAttributeFunction = (functionName: string, condition: Condition, params: ExpressionParams): string => {
  validateCondition(condition, true, false);

  if (!condition.attr) {
    throw new Error(`Attribute is required for ${condition.type} condition`);
  }

  const attrName = generateAttributeName(params, condition.attr);
  return `${functionName}(${attrName})`;
};

const buildLogicalExpression = (operator: string, conditions: Condition[], params: ExpressionParams): string => {
  if (!conditions || conditions.length === 0) {
    throw new Error(`At least one condition is required for ${operator} expression`);
  }

  const expressions = conditions.map((c) => buildExpression(c, params));
  return `(${expressions.join(` ${operator} `)})`;
};

export const buildExpression = (condition: Condition, params: ExpressionParams): string => {
  if (!condition) return "";

  try {
    // Map of condition types to their expression builders
    const expressionBuilders: Record<ComparisonOperator | LogicalOperator, () => string> = {
      eq: () => buildComparisonExpression(condition, "=", params),
      ne: () => buildComparisonExpression(condition, "<>", params),
      lt: () => buildComparisonExpression(condition, "<", params),
      lte: () => buildComparisonExpression(condition, "<=", params),
      gt: () => buildComparisonExpression(condition, ">", params),
      gte: () => buildComparisonExpression(condition, ">=", params),
      between: () => buildBetweenExpression(condition, params),
      beginsWith: () => buildFunctionExpression("begins_with", condition, params),
      contains: () => buildFunctionExpression("contains", condition, params),
      attributeExists: () => buildAttributeFunction("attribute_exists", condition, params),
      attributeNotExists: () => buildAttributeFunction("attribute_not_exists", condition, params),
      and: () => {
        if (!condition.conditions) {
          throw new Error("Conditions array is required for AND operator");
        }
        return buildLogicalExpression("AND", condition.conditions, params);
      },
      or: () => {
        if (!condition.conditions) {
          throw new Error("Conditions array is required for OR operator");
        }
        return buildLogicalExpression("OR", condition.conditions, params);
      },
      not: () => {
        if (!condition.condition) {
          throw new Error("Condition is required for NOT operator");
        }
        return `NOT (${buildExpression(condition.condition, params)})`;
      },
    };

    const builder = expressionBuilders[condition.type];
    if (!builder) {
      throw new Error(`Unknown condition type: ${condition.type}`);
    }

    return builder();
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`Error building expression for condition type ${condition.type}:`, error.message);
    } else {
      console.error(`Error building expression for condition type ${condition.type}:`, error);
    }
    throw error;
  }
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
