import type { Path, PathType } from "./builders/types";

export type ComparisonOperator =
  | "eq"
  | "ne"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "between"
  | "beginsWith"
  | "contains"
  | "attributeExists"
  | "attributeNotExists";

export type LogicalOperator = "and" | "or" | "not";

export interface Condition {
  type: ComparisonOperator | LogicalOperator;
  attr?: string;
  value?: unknown;
  conditions?: Condition[];
  condition?: Condition;
}

export interface ExpressionParams {
  expressionAttributeNames: Record<string, string>;
  expressionAttributeValues: Record<string, unknown>;
  valueCounter: { count: number };
}

// --- Condition Expression Builders ---

export const createComparisonCondition =
  (type: ComparisonOperator) =>
  (attr: string, value: unknown): Condition => ({
    type,
    attr,
    value,
  });

export const eq = createComparisonCondition("eq");
export const ne = createComparisonCondition("ne");
export const lt = createComparisonCondition("lt");
export const lte = createComparisonCondition("lte");
export const gt = createComparisonCondition("gt");
export const gte = createComparisonCondition("gte");

export const between = (attr: string, lower: unknown, upper: unknown): Condition => ({
  type: "between",
  attr,
  value: [lower, upper],
});

export const beginsWith = createComparisonCondition("beginsWith");
export const contains = createComparisonCondition("contains");

export const attributeExists = (attr: string): Condition => ({
  type: "attributeExists",
  attr,
});

export const attributeNotExists = (attr: string): Condition => ({
  type: "attributeNotExists",
  attr,
});

// --- Logical Operators ---

export const and = (...conditions: Condition[]): Condition => ({
  type: "and",
  conditions,
});

export const or = (...conditions: Condition[]): Condition => ({
  type: "or",
  conditions,
});

export const not = (condition: Condition): Condition => ({
  type: "not",
  condition,
});

export type KeyConditionOperator = {
  eq: (value: unknown) => Condition;
  lt: (value: unknown) => Condition;
  lte: (value: unknown) => Condition;
  gt: (value: unknown) => Condition;
  gte: (value: unknown) => Condition;
  between: (lower: unknown, upper: unknown) => Condition;
  beginsWith: (value: unknown) => Condition;
  and: (...conditions: Condition[]) => Condition;
};

export type ConditionOperator<T extends Record<string, unknown>> = {
  eq: <K extends Path<T>>(attr: K, value: PathType<T, K>) => Condition;
  ne: <K extends Path<T>>(attr: K, value: PathType<T, K>) => Condition;
  lt: <K extends Path<T>>(attr: K, value: PathType<T, K>) => Condition;
  lte: <K extends Path<T>>(attr: K, value: PathType<T, K>) => Condition;
  gt: <K extends Path<T>>(attr: K, value: PathType<T, K>) => Condition;
  gte: <K extends Path<T>>(attr: K, value: PathType<T, K>) => Condition;
  between: <K extends Path<T>>(attr: K, lower: PathType<T, K>, upper: PathType<T, K>) => Condition;
  beginsWith: <K extends Path<T>>(attr: K, value: PathType<T, K>) => Condition;
  contains: <K extends Path<T>>(attr: K, value: PathType<T, K>) => Condition;
  attributeExists: <K extends Path<T>>(attr: K) => Condition;
  attributeNotExists: <K extends Path<T>>(attr: K) => Condition;
  and: (...conditions: Condition[]) => Condition;
  or: (...conditions: Condition[]) => Condition;
  not: (condition: Condition) => Condition;
};

/**
 * Use this for QUERY operations
 */
export type PrimaryKey = {
  pk: string;
  sk?: (op: KeyConditionOperator) => Condition;
};

/**
 * Use this for GET and DELETE operations
 */
export type PrimaryKeyWithoutExpression = {
  pk: string;
  sk?: string;
};
