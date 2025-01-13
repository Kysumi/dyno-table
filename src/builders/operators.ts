export interface ExpressionAttributes {
  names?: Record<string, string>;
  values?: Record<string, unknown>;
}

export interface ExpressionResult {
  expression?: string;
  attributes: ExpressionAttributes;
}

export type FunctionOperator =
  | "attribute_exists"
  | "attribute_not_exists"
  | "begins_with"
  | "contains"
  | "not_contains"
  | "attribute_type";
export type ComparisonOperator = "=" | "<" | "<=" | ">" | ">=" | "<>";
export type SpecialOperator = "BETWEEN" | "IN" | "size";

export type ConditionOperator = FunctionOperator | ComparisonOperator | SpecialOperator;

export type FilterOperator = "=" | "<" | "<=" | ">" | ">=" | "<>" | "BETWEEN" | "IN" | "contains" | "begins_with";

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

export interface Condition {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}

export type SKCondition = {
  operator: FilterOperator;
  value: string;
};

export type PrimaryKey = {
  pk: string;
  sk?: SKCondition | string;
};

export interface TableIndexConfig {
  pkName: string;
  skName?: string;
}
