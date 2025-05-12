import type { Path, PathType } from "./builders/types";
import type { DynamoItem } from "./types";

/**
 * Supported comparison operators for DynamoDB conditions.
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html AWS DynamoDB - Comparison Operator Reference}
 *
 * - eq: Equals (=)
 * - ne: Not equals (≠ / <>)
 * - lt: Less than (<)
 * - lte: Less than or equal to (≤)
 * - gt: Greater than (>)
 * - gte: Greater than or equal to (≥)
 * - between: Between two values (inclusive)
 * - beginsWith: Checks if string attribute begins with specified substring
 * - contains: Checks if string/set attribute contains specified value
 * - attributeExists: Checks if attribute exists
 * - attributeNotExists: Checks if attribute does not exist
 */
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

/**
 * Logical operators for combining multiple conditions.
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Logical AWS DynamoDB - Logical Operator Reference}
 *
 * - and: Evaluates to true if all conditions are true
 * - or: Evaluates to true if any condition is true
 * - not: Negate the result of a condition
 */
export type LogicalOperator = "and" | "or" | "not";

/**
 * Represents a DynamoDB condition expression.
 * Can be either a comparison condition or a logical combination of conditions.
 *
 * @example
 * // Simple comparison condition
 * const condition: Condition = {
 *   type: "eq",
 *   attr: "status",
 *   value: "ACTIVE"
 * };
 *
 * @example
 * // Logical combination of conditions
 * const condition: Condition = {
 *   type: "and",
 *   conditions: [
 *     { type: "eq", attr: "status", value: "ACTIVE" },
 *     { type: "gt", attr: "age", value: 5 }
 *   ]
 * };
 */
export interface Condition {
  /** The type of condition (comparison or logical operator) */
  type: ComparisonOperator | LogicalOperator;
  /** The attribute name for comparison conditions */
  attr?: string;
  /** The value to compare against for comparison conditions */
  value?: unknown;
  /** Array of conditions for logical operators (and/or) */
  conditions?: Condition[];
  /** Single condition for the 'not' operator */
  condition?: Condition;
}

/**
 * Parameters used to build DynamoDB expression strings.
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ExpressionAttributeNames.html Expression Attribute Names}
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ExpressionAttributeValues.html Expression Attribute Values}
 */
export interface ExpressionParams {
  /** Map of attribute name placeholders to actual attribute names */
  expressionAttributeNames: Record<string, string>;
  /** Map of value placeholders to actual values */
  expressionAttributeValues: DynamoItem;
  /** Counter for generating unique value placeholders */
  valueCounter: { count: number };
}

/**
 * Creates a comparison condition builder function for the specified operator.
 * @internal
 */
export const createComparisonCondition =
  (type: ComparisonOperator) =>
  (attr: string, value: unknown): Condition => ({
    type,
    attr,
    value,
  });

/**
 * Creates an equals (=) condition
 * @example
 * eq("status", "ACTIVE") // status = "ACTIVE"
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html}
 */
export const eq = createComparisonCondition("eq");

/**
 * Creates a not equals (≠) condition
 * @example
 * ne("status", "DELETED") // status <> "DELETED"
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html}
 */
export const ne = createComparisonCondition("ne");

/**
 * Creates a less than (<) condition
 * @example
 * lt("age", 18) // age < 18
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html}
 */
export const lt = createComparisonCondition("lt");

/**
 * Creates a less than or equal to (≤) condition
 * @example
 * lte("age", 18) // age <= 18
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html}
 */
export const lte = createComparisonCondition("lte");

/**
 * Creates a greater than (>) condition
 * @example
 * gt("price", 100) // price > 100
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html}
 */
export const gt = createComparisonCondition("gt");

/**
 * Creates a greater than or equal to (≥) condition
 * @example
 * gte("price", 100) // price >= 100
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html}
 */
export const gte = createComparisonCondition("gte");

/**
 * Creates a between condition that checks if a value is within a range (inclusive)
 * @example
 * between("age", 18, 65) // age BETWEEN 18 AND 65
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Comparators AWS DynamoDB - BETWEEN}
 */
export const between = (attr: string, lower: unknown, upper: unknown): Condition => ({
  type: "between",
  attr,
  value: [lower, upper],
});

/**
 * Creates a begins_with condition that checks if a string attribute starts with a substring
 * @example
 * beginsWith("email", "@example.com") // begins_with(email, "@example.com")
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Functions AWS DynamoDB - begins_with}
 */
export const beginsWith = createComparisonCondition("beginsWith");

/**
 * Creates a contains condition that checks if a string contains a substring or if a set contains an element
 * @example
 * contains("tags", "important") // contains(tags, "important")
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Functions AWS DynamoDB - contains}
 */
export const contains = createComparisonCondition("contains");

/**
 * Creates a condition that checks if an attribute exists
 * @example
 * attributeExists("email") // attribute_exists(email)
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Functions AWS DynamoDB - attribute_exists}
 */
export const attributeExists = (attr: string): Condition => ({
  type: "attributeExists",
  attr,
});

/**
 * Creates a condition that checks if an attribute does not exist
 * @example
 * attributeNotExists("deletedAt") // attribute_not_exists(deletedAt)
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Functions AWS DynamoDB - attribute_not_exists}
 */
export const attributeNotExists = (attr: string): Condition => ({
  type: "attributeNotExists",
  attr,
});

// --- Logical Operators ---

/**
 * Combines multiple conditions with AND operator
 * @example
 * and(
 *   eq("status", "ACTIVE"),
 *   gt("age", 18)
 * ) // status = "ACTIVE" AND age > 18
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Logical AWS DynamoDB - AND}
 */
export const and = (...conditions: Condition[]): Condition => ({
  type: "and",
  conditions,
});

/**
 * Combines multiple conditions with OR operator
 * @example
 * or(
 *   eq("status", "PENDING"),
 *   eq("status", "PROCESSING")
 * ) // status = "PENDING" OR status = "PROCESSING"
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Logical AWS DynamoDB - OR}
 */
export const or = (...conditions: Condition[]): Condition => ({
  type: "or",
  conditions,
});

/**
 * Negates a condition
 * @example
 * not(eq("status", "DELETED")) // NOT status = "DELETED"
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Logical AWS DynamoDB - NOT}
 */
export const not = (condition: Condition): Condition => ({
  type: "not",
  condition,
});

/**
 * Type-safe operators for building key conditions in DynamoDB queries.
 * Only includes operators that are valid for key conditions.
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.html#Query.KeyConditionExpressions AWS DynamoDB - Key Condition Expressions}
 *
 * @example
 * // Using with sort key conditions
 * table.query({
 *   pk: "USER#123",
 *   sk: op => op.beginsWith("ORDER#")
 * })
 */
export type KeyConditionOperator = {
  /** Equals comparison for key attributes */
  eq: (value: unknown) => Condition;
  /** Less than comparison for key attributes */
  lt: (value: unknown) => Condition;
  /** Less than or equal comparison for key attributes */
  lte: (value: unknown) => Condition;
  /** Greater than comparison for key attributes */
  gt: (value: unknown) => Condition;
  /** Greater than or equal comparison for key attributes */
  gte: (value: unknown) => Condition;
  /** Between range comparison for key attributes */
  between: (lower: unknown, upper: unknown) => Condition;
  /** Begins with comparison for key attributes */
  beginsWith: (value: unknown) => Condition;
  /** Combines multiple key conditions with AND */
  and: (...conditions: Condition[]) => Condition;
};

/**
 * Type-safe operators for building conditions in DynamoDB operations.
 * Includes all available condition operators with proper type inference.
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html AWS DynamoDB - Condition Expressions}
 *
 * @example
 * // Using with type-safe conditions
 * interface User {
 *   status: string;
 *   age: number;
 *   email?: string;
 * }
 *
 * table.scan<User>()
 *   .where(op => op.and(
 *     op.eq("status", "ACTIVE"),
 *     op.gt("age", 18),
 *     op.attributeExists("email")
 *   ))
 *
 * @template T The type of the item being operated on
 */
export type ConditionOperator<T extends DynamoItem> = {
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
 * Primary key type for QUERY operations.
 * Allows building complex key conditions for the sort key.
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.html AWS DynamoDB - Query Operations}
 *
 * @example
 * // Query items with a specific partition key and sort key prefix
 * table.query({
 *   pk: "USER#123",
 *   sk: op => op.beginsWith("ORDER#2023")
 * })
 *
 * @example
 * // Query items within a specific sort key range
 * table.query({
 *   pk: "USER#123",
 *   sk: op => op.between("ORDER#2023-01", "ORDER#2023-12")
 * })
 */
export type PrimaryKey = {
  /** Partition key value */
  pk: string;
  /** Optional sort key condition builder */
  sk?: (op: KeyConditionOperator) => Condition;
};

/**
 * Primary key type for GET and DELETE operations.
 * Used when you need to specify exact key values without conditions.
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithItems.html AWS DynamoDB - Working with Items}
 *
 * @example
 * // Get a specific item by its complete primary key
 * table.get({
 *   pk: "USER#123",
 *   sk: "PROFILE#123"
 * })
 *
 * @example
 * // Delete a specific item by its complete primary key
 * table.delete({
 *   pk: "USER#123",
 *   sk: "ORDER#456"
 * })
 */
export type PrimaryKeyWithoutExpression = {
  /** Partition key value */
  pk: string;
  /** Optional sort key value */
  sk?: string;
};
