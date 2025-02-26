import type {
  AttributeExists,
  AttributeNotExists,
  AttributeType,
  BeginsWith,
  Condition,
  Contains,
  Expression,
  LogicalOperator,
  Size,
} from "../builders/operators";

export const isCondition = <T>(expr: Expression<T>): expr is Condition<T> => {
  return (expr as Condition<T>).field !== undefined && (expr as Condition<T>).operator !== undefined;
};

export const isLogicalOperator = <T>(expr: Expression<T>): expr is LogicalOperator<T> => {
  return (expr as LogicalOperator<T>).operator !== undefined && (expr as LogicalOperator<T>).expressions !== undefined;
};

export const isAttributeExists = <T>(expr: Expression<T>): expr is AttributeExists => {
  return (expr as AttributeExists).type === "attribute_exists";
};

export const isAttributeNotExists = <T>(expr: Expression<T>): expr is AttributeNotExists => {
  return (expr as AttributeNotExists).type === "attribute_not_exists";
};

export const isAttributeType = <T>(expr: Expression<T>): expr is AttributeType => {
  return (expr as AttributeType).type === "attribute_type";
};

export const isContains = <T>(expr: Expression<T>): expr is Contains => {
  return (expr as Contains).type === "contains";
};

export const isBeginsWith = <T>(expr: Expression<T>): expr is BeginsWith => {
  return (expr as BeginsWith).type === "begins_with";
};

export const isSize = <T>(expr: Expression<T>): expr is Size => {
  return (expr as Size).type === "size";
};
