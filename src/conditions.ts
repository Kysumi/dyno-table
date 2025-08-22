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
 * - in: Checks if attribute value is in a list of values
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
  | "in"
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
 * Creates an in condition that checks if a value is in a list of values
 * @example
 * inArray("status", ["ACTIVE", "PENDING", "PROCESSING"]) // status IN ("ACTIVE", "PENDING", "PROCESSING")
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Comparators AWS DynamoDB - IN}
 */
export const inArray = (attr: string, values: unknown[]): Condition => ({
  type: "in",
  attr,
  value: values,
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
// Helper types that allow string paths and unknown values when strict typing can't be resolved
type FlexiblePath<T> = Path<T> extends never ? string : Path<T>;
type FlexiblePathType<T, K extends keyof any> = PathType<T, K> extends never ? unknown : PathType<T, K>;

export type ConditionOperator<T extends DynamoItem> = {
  /**
   * Creates an equals (=) condition for type-safe attribute comparison.
   * Tests if the specified attribute equals the provided value.
   *
   * @param attr - The attribute path to compare (with full type safety)
   * @param value - The value to compare against (must match attribute type)
   * @returns A condition that evaluates to true when attr equals value
   *
   * @example
   * ```typescript
   * interface User { status: string; age: number; }
   *
   * // String comparison
   * op.eq("status", "ACTIVE") // status = "ACTIVE"
   *
   * // Numeric comparison
   * op.eq("age", 25) // age = 25
   *
   * // Nested attribute
   * op.eq("profile.role", "admin") // profile.role = "admin"
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Comparators AWS DynamoDB - Comparison Operators}
   */
  eq: <K extends FlexiblePath<T>>(attr: K, value: FlexiblePathType<T, K>) => Condition;

  /**
   * Creates a not equals (≠ / <>) condition for type-safe attribute comparison.
   * Tests if the specified attribute does not equal the provided value.
   *
   * @param attr - The attribute path to compare (with full type safety)
   * @param value - The value to compare against (must match attribute type)
   * @returns A condition that evaluates to true when attr does not equal value
   *
   * @example
   * ```typescript
   * interface User { status: string; priority: number; }
   *
   * // String comparison
   * op.ne("status", "DELETED") // status <> "DELETED"
   *
   * // Numeric comparison
   * op.ne("priority", 0) // priority <> 0
   *
   * // Useful for filtering out specific values
   * op.ne("category", "ARCHIVED") // category <> "ARCHIVED"
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Comparators AWS DynamoDB - Comparison Operators}
   */
  ne: <K extends FlexiblePath<T>>(attr: K, value: FlexiblePathType<T, K>) => Condition;

  /**
   * Creates a less than (<) condition for type-safe attribute comparison.
   * Tests if the specified attribute is less than the provided value.
   * Works with numbers, strings (lexicographic), and dates.
   *
   * @param attr - The attribute path to compare (with full type safety)
   * @param value - The value to compare against (must match attribute type)
   * @returns A condition that evaluates to true when attr is less than value
   *
   * @example
   * ```typescript
   * interface Product { price: number; name: string; createdAt: string; }
   *
   * // Numeric comparison
   * op.lt("price", 100) // price < 100
   *
   * // String comparison (lexicographic)
   * op.lt("name", "M") // name < "M" (names starting with A-L)
   *
   * // Date comparison (ISO strings)
   * op.lt("createdAt", "2024-01-01") // createdAt < "2024-01-01"
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Comparators AWS DynamoDB - Comparison Operators}
   */
  lt: <K extends FlexiblePath<T>>(attr: K, value: FlexiblePathType<T, K>) => Condition;

  /**
   * Creates a less than or equal to (≤) condition for type-safe attribute comparison.
   * Tests if the specified attribute is less than or equal to the provided value.
   * Works with numbers, strings (lexicographic), and dates.
   *
   * @param attr - The attribute path to compare (with full type safety)
   * @param value - The value to compare against (must match attribute type)
   * @returns A condition that evaluates to true when attr is less than or equal to value
   *
   * @example
   * ```typescript
   * interface Order { total: number; priority: number; dueDate: string; }
   *
   * // Numeric comparison
   * op.lte("total", 1000) // total <= 1000
   *
   * // Priority levels
   * op.lte("priority", 3) // priority <= 3 (low to medium priority)
   *
   * // Date deadlines
   * op.lte("dueDate", "2024-12-31") // dueDate <= "2024-12-31"
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Comparators AWS DynamoDB - Comparison Operators}
   */
  lte: <K extends FlexiblePath<T>>(attr: K, value: FlexiblePathType<T, K>) => Condition;

  /**
   * Creates a greater than (>) condition for type-safe attribute comparison.
   * Tests if the specified attribute is greater than the provided value.
   * Works with numbers, strings (lexicographic), and dates.
   *
   * @param attr - The attribute path to compare (with full type safety)
   * @param value - The value to compare against (must match attribute type)
   * @returns A condition that evaluates to true when attr is greater than value
   *
   * @example
   * ```typescript
   * interface User { age: number; score: number; lastLogin: string; }
   *
   * // Age restrictions
   * op.gt("age", 18) // age > 18 (adults only)
   *
   * // Performance thresholds
   * op.gt("score", 85) // score > 85 (high performers)
   *
   * // Recent activity
   * op.gt("lastLogin", "2024-01-01") // lastLogin > "2024-01-01"
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Comparators AWS DynamoDB - Comparison Operators}
   */
  gt: <K extends FlexiblePath<T>>(attr: K, value: FlexiblePathType<T, K>) => Condition;

  /**
   * Creates a greater than or equal to (≥) condition for type-safe attribute comparison.
   * Tests if the specified attribute is greater than or equal to the provided value.
   * Works with numbers, strings (lexicographic), and dates.
   *
   * @param attr - The attribute path to compare (with full type safety)
   * @param value - The value to compare against (must match attribute type)
   * @returns A condition that evaluates to true when attr is greater than or equal to value
   *
   * @example
   * ```typescript
   * interface Product { rating: number; version: string; releaseDate: string; }
   *
   * // Minimum ratings
   * op.gte("rating", 4.0) // rating >= 4.0 (highly rated)
   *
   * // Version requirements
   * op.gte("version", "2.0.0") // version >= "2.0.0"
   *
   * // Release date filters
   * op.gte("releaseDate", "2024-01-01") // releaseDate >= "2024-01-01"
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Comparators AWS DynamoDB - Comparison Operators}
   */
  gte: <K extends FlexiblePath<T>>(attr: K, value: FlexiblePathType<T, K>) => Condition;

  /**
   * Creates a between condition for type-safe range comparison.
   * Tests if the specified attribute value falls within the inclusive range [lower, upper].
   * Works with numbers, strings (lexicographic), and dates.
   *
   * @param attr - The attribute path to compare (with full type safety)
   * @param lower - The lower bound of the range (inclusive, must match attribute type)
   * @param upper - The upper bound of the range (inclusive, must match attribute type)
   * @returns A condition that evaluates to true when lower ≤ attr ≤ upper
   *
   * @example
   * ```typescript
   * interface Event { price: number; date: string; priority: number; }
   *
   * // Price range
   * op.between("price", 50, 200) // price BETWEEN 50 AND 200
   *
   * // Date range
   * op.between("date", "2024-01-01", "2024-12-31") // date BETWEEN "2024-01-01" AND "2024-12-31"
   *
   * // Priority levels
   * op.between("priority", 1, 5) // priority BETWEEN 1 AND 5
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Comparators AWS DynamoDB - BETWEEN}
   */
  between: <K extends FlexiblePath<T>>(
    attr: K,
    lower: FlexiblePathType<T, K>,
    upper: FlexiblePathType<T, K>,
  ) => Condition;

  /**
   * Creates an IN condition for type-safe list membership testing.
   * Tests if the specified attribute value matches any value in the provided list.
   * Supports up to 100 values in the list as per DynamoDB limitations.
   *
   * @param attr - The attribute path to compare (with full type safety)
   * @param values - Array of values to test against (must match attribute type, max 100 items)
   * @returns A condition that evaluates to true when attr matches any value in the list
   *
   * @example
   * ```typescript
   * interface User { status: string; role: string; priority: number; }
   *
   * // Status filtering
   * op.inArray("status", ["ACTIVE", "PENDING", "PROCESSING"]) // status IN ("ACTIVE", "PENDING", "PROCESSING")
   *
   * // Role-based access
   * op.inArray("role", ["admin", "moderator", "editor"]) // role IN ("admin", "moderator", "editor")
   *
   * // Priority levels
   * op.inArray("priority", [1, 2, 3]) // priority IN (1, 2, 3)
   * ```
   *
   * @throws {Error} When values array is empty or contains more than 100 items
   * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Comparators AWS DynamoDB - IN}
   */
  inArray: <K extends FlexiblePath<T>>(attr: K, values: FlexiblePathType<T, K>[]) => Condition;

  /**
   * Creates a begins_with condition for type-safe string prefix testing.
   * Tests if the specified string attribute starts with the provided substring.
   * Only works with string attributes - will fail on other data types.
   *
   * @param attr - The string attribute path to test (with full type safety)
   * @param value - The prefix string to test for (must match attribute type)
   * @returns A condition that evaluates to true when attr starts with value
   *
   * @example
   * ```typescript
   * interface User { email: string; name: string; id: string; }
   *
   * // Email domain filtering
   * op.beginsWith("email", "admin@") // begins_with(email, "admin@")
   *
   * // Name prefix search
   * op.beginsWith("name", "John") // begins_with(name, "John")
   *
   * // ID pattern matching
   * op.beginsWith("id", "USER#") // begins_with(id, "USER#")
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Functions AWS DynamoDB - begins_with}
   */
  beginsWith: <K extends FlexiblePath<T>>(attr: K, value: FlexiblePathType<T, K>) => Condition;

  /**
   * Creates a contains condition for type-safe substring or set membership testing.
   * For strings: tests if the attribute contains the specified substring.
   * For sets: tests if the set contains the specified element.
   *
   * @param attr - The attribute path to test (with full type safety)
   * @param value - The substring or element to search for (must match attribute type)
   * @returns A condition that evaluates to true when attr contains value
   *
   * @example
   * ```typescript
   * interface Post { content: string; tags: Set<string>; categories: string[]; }
   *
   * // Substring search in content
   * op.contains("content", "important") // contains(content, "important")
   *
   * // Tag membership (for DynamoDB String Sets)
   * op.contains("tags", "featured") // contains(tags, "featured")
   *
   * // Category search (for string arrays stored as lists)
   * op.contains("categories", "technology") // contains(categories, "technology")
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Functions AWS DynamoDB - contains}
   */
  contains: <K extends FlexiblePath<T>>(attr: K, value: FlexiblePathType<T, K>) => Condition;

  /**
   * Creates an attribute_exists condition for type-safe attribute presence testing.
   * Tests if the specified attribute exists in the item, regardless of its value.
   * Useful for filtering items that have optional attributes populated.
   *
   * @param attr - The attribute path to test for existence (with full type safety)
   * @returns A condition that evaluates to true when the attribute exists
   *
   * @example
   * ```typescript
   * interface User { email: string; phone?: string; profile?: { avatar?: string; }; }
   *
   * // Check for optional fields
   * op.attributeExists("phone") // attribute_exists(phone)
   *
   * // Check for nested optional attributes
   * op.attributeExists("profile.avatar") // attribute_exists(profile.avatar)
   *
   * // Useful in combination with other conditions
   * op.and(
   *   op.eq("status", "ACTIVE"),
   *   op.attributeExists("email") // Only active users with email
   * )
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Functions AWS DynamoDB - attribute_exists}
   */
  attributeExists: <K extends FlexiblePath<T>>(attr: K) => Condition;

  /**
   * Creates an attribute_not_exists condition for type-safe attribute absence testing.
   * Tests if the specified attribute does not exist in the item.
   * Useful for conditional writes to prevent overwriting existing data.
   *
   * @param attr - The attribute path to test for absence (with full type safety)
   * @returns A condition that evaluates to true when the attribute does not exist
   *
   * @example
   * ```typescript
   * interface User { id: string; email: string; deletedAt?: string; }
   *
   * // Ensure item hasn't been soft-deleted
   * op.attributeNotExists("deletedAt") // attribute_not_exists(deletedAt)
   *
   * // Prevent duplicate creation
   * op.attributeNotExists("id") // attribute_not_exists(id)
   *
   * // Conditional updates
   * op.and(
   *   op.eq("status", "PENDING"),
   *   op.attributeNotExists("processedAt") // Only unprocessed items
   * )
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Functions AWS DynamoDB - attribute_not_exists}
   */
  attributeNotExists: <K extends FlexiblePath<T>>(attr: K) => Condition;

  /**
   * Combines multiple conditions with logical AND operator.
   * All provided conditions must evaluate to true for the AND condition to be true.
   * Supports any number of conditions as arguments.
   *
   * @param conditions - Variable number of conditions to combine with AND
   * @returns A condition that evaluates to true when all input conditions are true
   *
   * @example
   * ```typescript
   * interface User { status: string; age: number; role: string; verified: boolean; }
   *
   * // Multiple criteria
   * op.and(
   *   op.eq("status", "ACTIVE"),
   *   op.gt("age", 18),
   *   op.eq("verified", true)
   * ) // status = "ACTIVE" AND age > 18 AND verified = true
   *
   * // Complex business logic
   * op.and(
   *   op.inArray("role", ["admin", "moderator"]),
   *   op.attributeExists("permissions"),
   *   op.ne("status", "SUSPENDED")
   * )
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Logical AWS DynamoDB - AND}
   */
  and: (...conditions: Condition[]) => Condition;

  /**
   * Combines multiple conditions with logical OR operator.
   * At least one of the provided conditions must evaluate to true for the OR condition to be true.
   * Supports any number of conditions as arguments.
   *
   * @param conditions - Variable number of conditions to combine with OR
   * @returns A condition that evaluates to true when any input condition is true
   *
   * @example
   * ```typescript
   * interface Order { status: string; priority: string; urgent: boolean; }
   *
   * // Alternative statuses
   * op.or(
   *   op.eq("status", "PENDING"),
   *   op.eq("status", "PROCESSING"),
   *   op.eq("status", "SHIPPED")
   * ) // status = "PENDING" OR status = "PROCESSING" OR status = "SHIPPED"
   *
   * // High priority items
   * op.or(
   *   op.eq("priority", "HIGH"),
   *   op.eq("urgent", true)
   * )
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Logical AWS DynamoDB - OR}
   */
  or: (...conditions: Condition[]) => Condition;

  /**
   * Negates a condition with logical NOT operator.
   * Inverts the boolean result of the provided condition.
   *
   * @param condition - The condition to negate
   * @returns A condition that evaluates to true when the input condition is false
   *
   * @example
   * ```typescript
   * interface User { status: string; role: string; banned: boolean; }
   *
   * // Exclude specific status
   * op.not(op.eq("status", "DELETED")) // NOT status = "DELETED"
   *
   * // Complex negation
   * op.not(
   *   op.and(
   *     op.eq("role", "guest"),
   *     op.eq("banned", true)
   *   )
   * ) // NOT (role = "guest" AND banned = true)
   *
   * // Exclude multiple values
   * op.not(op.inArray("status", ["DELETED", "ARCHIVED"]))
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Logical AWS DynamoDB - NOT}
   */
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
