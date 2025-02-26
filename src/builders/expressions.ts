import type {
  AttributeExists,
  AttributeNotExists,
  AttributeType,
  BeginsWith,
  Condition,
  Contains,
  DynamoDBAttributeType,
  Expression,
  LogicalOperator,
  Size,
} from "./operators";
import type { DynamoRecord, Path, PathType } from "./types";

/**
 * Creates an equality condition expression for DynamoDB.
 *
 * This function creates a condition that checks if an attribute equals a specific value.
 * It's commonly used in query conditions and filter expressions.
 *
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Comparators AWS Comparison Operator Documentation}
 *
 * @example
 * ```typescript
 * // Check if status equals "ACTIVE"
 * eq("status", "ACTIVE")
 * // Generates: #status = :status
 * ```
 *
 * @param field - The attribute name to compare
 * @param value - The value to compare against
 * @returns A condition expression for equality comparison
 */
export function eq<T extends DynamoRecord, K extends Path<T>>(
  field: K,
  value: PathType<T, K>,
): Condition<PathType<T, K>> {
  return { field, operator: "=", value };
}

/**
 * Creates a not-equal condition expression for DynamoDB.
 *
 * This function creates a condition that checks if an attribute is not equal to a specific value.
 *
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Comparators AWS Comparison Operator Documentation}
 *
 * @example
 * ```typescript
 * // Check if status is not "DELETED"
 * ne("status", "DELETED")
 * // Generates: #status <> :status
 * ```
 *
 * @param field - The attribute name to compare
 * @param value - The value to compare against
 * @returns A condition expression for inequality comparison
 */
export function ne<T extends DynamoRecord, K extends Path<T>>(
  field: K,
  value: PathType<T, K>,
): Condition<PathType<T, K>> {
  return { field, operator: "<>", value };
}

/**
 * Creates a greater-than condition expression for DynamoDB.
 *
 * This function creates a condition that checks if an attribute is greater than a specific value.
 * Commonly used for numeric and string comparisons.
 *
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Comparators AWS Comparison Operator Documentation}
 *
 * @example
 * ```typescript
 * // Check if price is greater than 100
 * gt("price", 100)
 * // Generates: #price > :price
 * ```
 *
 * @param field - The attribute name to compare
 * @param value - The value to compare against
 * @returns A condition expression for greater-than comparison
 */
export function gt<T extends DynamoRecord, K extends Path<T>>(
  field: K,
  value: PathType<T, K>,
): Condition<PathType<T, K>> {
  return { field, operator: ">", value };
}

/**
 * Creates a greater-than-or-equal condition expression for DynamoDB.
 *
 * This function creates a condition that checks if an attribute is greater than or equal to a specific value.
 *
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Comparators AWS Comparison Operator Documentation}
 *
 * @example
 * ```typescript
 * // Check if age is greater than or equal to 18
 * gte("age", 18)
 * // Generates: #age >= :age
 * ```
 *
 * @param field - The attribute name to compare
 * @param value - The value to compare against
 * @returns A condition expression for greater-than-or-equal comparison
 */
export function gte<T extends DynamoRecord, K extends Path<T>>(
  field: K,
  value: PathType<T, K>,
): Condition<PathType<T, K>> {
  return { field, operator: ">=", value };
}

/**
 * Creates a less-than condition expression for DynamoDB.
 *
 * This function creates a condition that checks if an attribute is less than a specific value.
 * Commonly used for numeric and string comparisons.
 *
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Comparators AWS Comparison Operator Documentation}
 *
 * @example
 * ```typescript
 * // Check if quantity is less than 5
 * lt("quantity", 5)
 * // Generates: #quantity < :quantity
 * ```
 *
 * @param field - The attribute name to compare
 * @param value - The value to compare against
 * @returns A condition expression for less-than comparison
 */
export function lt<T extends DynamoRecord, K extends Path<T>>(
  field: K,
  value: PathType<T, K>,
): Condition<PathType<T, K>> {
  return { field, operator: "<", value };
}

/**
 * Creates a less-than-or-equal condition expression for DynamoDB.
 *
 * This function creates a condition that checks if an attribute is less than or equal to a specific value.
 *
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Comparators AWS Comparison Operator Documentation}
 *
 * @example
 * ```typescript
 * // Check if temperature is less than or equal to 100
 * lte("temperature", 100)
 * // Generates: #temperature <= :temperature
 * ```
 *
 * @param field - The attribute name to compare
 * @param value - The value to compare against
 * @returns A condition expression for less-than-or-equal comparison
 */
export function lte<T extends DynamoRecord, K extends Path<T>>(
  field: K,
  value: PathType<T, K>,
): Condition<PathType<T, K>> {
  return { field, operator: "<=", value };
}

/**
 * Creates a BETWEEN condition expression for DynamoDB.
 *
 * This function creates a condition that checks if an attribute value is between two bounds (inclusive).
 * Commonly used for numeric ranges, dates, or strings.
 *
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Comparators AWS BETWEEN Operator Documentation}
 *
 * @example
 * ```typescript
 * // Check if price is between 10 and 20
 * between("price", 10, 20)
 * // Generates: #price BETWEEN :lower AND :upper
 *
 * // Check if date is between two timestamps
 * between("date", "2023-01-01", "2023-12-31")
 * ```
 *
 * @param field - The attribute name to compare
 * @param lower - The lower bound value (inclusive)
 * @param upper - The upper bound value (inclusive)
 * @returns A condition expression for BETWEEN comparison
 */
export function between<T extends DynamoRecord, K extends Path<T>>(
  field: K,
  lower: PathType<T, K>,
  upper: PathType<T, K>,
): Condition<PathType<T, K>> {
  return { field, operator: "BETWEEN", value: [lower, upper] as [PathType<T, K>, PathType<T, K>] };
}

/**
 * Creates an IN condition expression for DynamoDB.
 *
 * This function creates a condition that checks if an attribute value matches any value in a set of values.
 * Useful for checking multiple possible values for an attribute.
 *
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Comparators AWS IN Operator Documentation}
 *
 * @example
 * ```typescript
 * // Check if status is one of several values
 * inArray("status", ["PENDING", "PROCESSING", "COMPLETED"])
 * // Generates: #status IN (:value0, :value1, :value2)
 *
 * // Check if category is in a set of categories
 * inArray("category", ["Books", "Electronics"])
 * ```
 *
 * @param field - The attribute name to compare
 * @param values - Array of values to check against
 * @returns A condition expression for IN comparison
 */
export function inArray<T extends DynamoRecord, K extends Path<T>>(
  field: K,
  values: PathType<T, K>,
): Condition<PathType<T, K>> {
  return { field, operator: "IN", value: values };
}

// Logical Operators
/**
 * Creates an AND logical operator expression for DynamoDB.
 *
 * This function combines multiple conditions with AND logic, requiring all conditions to be true.
 * It can combine any type of conditions including comparison and function-based conditions.
 *
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.LogicalOperators AWS Logical Operators Documentation}
 *
 * @example
 * ```typescript
 * // Check if status is "ACTIVE" AND price is greater than 100
 * and(
 *   eq("status", "ACTIVE"),
 *   gt("price", 100)
 * )
 * // Generates: (#status = :status) AND (#price > :price)
 *
 * // Multiple conditions
 * and(
 *   eq("status", "ACTIVE"),
 *   between("price", 100, 200),
 *   attributeExists("description")
 * )
 * ```
 *
 * @param expressions - One or more expressions to combine with AND logic
 * @returns A logical operator expression combining all conditions with AND
 */
export function and<T>(...expressions: Expression<T>[]): LogicalOperator<T> {
  return { operator: "AND", expressions };
}

/**
 * Creates an OR logical operator expression for DynamoDB.
 *
 * This function combines multiple conditions with OR logic, requiring at least one condition to be true.
 * It can combine any type of conditions including comparison and function-based conditions.
 *
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.LogicalOperators AWS Logical Operators Documentation}
 *
 * @example
 * ```typescript
 * // Check if status is "PENDING" OR status is "PROCESSING"
 * or(
 *   eq("status", "PENDING"),
 *   eq("status", "PROCESSING")
 * )
 * // Generates: (#status = :status1) OR (#status = :status2)
 *
 * // Complex conditions
 * or(
 *   and(
 *     eq("category", "Electronics"),
 *     gt("price", 1000)
 *   ),
 *   and(
 *     eq("category", "Books"),
 *     lt("price", 50)
 *   )
 * )
 * ```
 *
 * @param expressions - One or more expressions to combine with OR logic
 * @returns A logical operator expression combining all conditions with OR
 */
export function or<T>(...expressions: Expression<T>[]): LogicalOperator<T> {
  return { operator: "OR", expressions };
}

/**
 * Creates a NOT logical operator expression for DynamoDB.
 *
 * This function negates the result of a condition expression.
 * It can be used with any type of condition including comparison and function-based conditions.
 *
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.LogicalOperators AWS Logical Operators Documentation}
 *
 * @example
 * ```typescript
 * // Check if status is NOT "DELETED"
 * not(eq("status", "DELETED"))
 * // Generates: NOT (#status = :status)
 *
 * // More complex example
 * not(
 *   or(
 *     eq("status", "DELETED"),
 *     eq("status", "ARCHIVED")
 *   )
 * )
 * ```
 *
 * @param expression - The expression to negate
 * @returns A logical operator expression that negates the input expression
 */
export function not<T>(expression: Expression<T>): LogicalOperator<T> {
  return { operator: "NOT", expressions: [expression] };
}

// Function-Based Operators
/**
 * Creates an attribute_exists function expression for DynamoDB.
 *
 * This function checks if an attribute exists in the item, regardless of its value.
 * Useful for verifying the presence of optional attributes.
 *
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Functions AWS Function Documentation}
 *
 * @example
 * ```typescript
 * // Check if the description attribute exists
 * attributeExists("description")
 * // Generates: attribute_exists(#description)
 * ```
 *
 * @param field - The attribute name to check for existence
 * @returns An attribute_exists function expression
 */
export function attributeExists<T extends DynamoRecord, K extends Path<T>>(field: K): AttributeExists {
  return { type: "attribute_exists", field };
}

/**
 * Creates an attribute_not_exists function expression for DynamoDB.
 *
 * This function checks if an attribute does not exist in the item.
 * Commonly used in conditional puts to ensure you're not overwriting existing items.
 *
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Functions AWS Function Documentation}
 *
 * @example
 * ```typescript
 * // Check if the item doesn't already exist
 * attributeNotExists("id")
 * // Generates: attribute_not_exists(#id)
 * ```
 *
 * @param field - The attribute path to check for non-existence
 * @returns An attribute_not_exists function expression
 */
export function attributeNotExists<T extends DynamoRecord, K extends Path<T>>(field: K): AttributeNotExists {
  return { type: "attribute_not_exists", field };
}

/**
 * Creates an attribute_type function expression for DynamoDB.
 *
 * This function checks if an attribute is of a specific DynamoDB type.
 * Useful for validating attribute types in conditions.
 *
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Functions AWS Function Documentation}
 *
 * @example
 * ```typescript
 * // Check if the age attribute is a number
 * attributeType("age", "N")
 * // Generates: attribute_type(#age, :type)
 *
 * // Check if the tags attribute is a list
 * attributeType("tags", "L")
 * ```
 *
 * @param field - The attribute path to check
 * @param attributeType - The expected DynamoDB attribute type (S, N, B, BOOL, etc.)
 * @returns An attribute_type function expression
 */
export function attributeType<T extends DynamoRecord, K extends Path<T>>(
  field: K,
  attributeType: DynamoDBAttributeType,
): AttributeType {
  return { type: "attribute_type", field, attributeType };
}

/**
 * Creates a contains function expression for DynamoDB.
 *
 * This function checks if a string attribute contains a substring,
 * or if a set attribute contains a specific element.
 *
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Functions AWS Function Documentation}
 *
 * @example
 * ```typescript
 * // Check if description contains a word
 * contains("description", "important")
 * // Generates: contains(#description, :value)
 *
 * // Check if a set contains a value
 * contains("tags", "urgent")
 * ```
 *
 * @param field - The attribute path to check
 * @param value - The substring or element to look for
 * @returns A contains function expression
 */
export function contains<T extends DynamoRecord, K extends Path<T>>(field: K, value: PathType<T, K>): Contains {
  return { type: "contains", field, value };
}

/**
 * Creates a begins_with function expression for DynamoDB.
 *
 * This function checks if a string attribute begins with a specific substring.
 * Useful for prefix-based searches and hierarchical data structures.
 *
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Functions AWS Function Documentation}
 *
 * @example
 * ```typescript
 * // Check if path starts with a prefix
 * beginsWith("path", "/users/")
 * // Generates: begins_with(#path, :value)
 *
 * // Check if email is from a specific domain
 * beginsWith("email", "admin@")
 * ```
 *
 * @param field - The attribute name to check
 * @param value - The prefix to look for
 * @returns A begins_with function expression
 */
export function beginsWith<T extends DynamoRecord, K extends Path<T>>(field: K, value: PathType<T, K>): BeginsWith {
  return { type: "begins_with", field, value };
}

/**
 * Creates a size function expression for DynamoDB.
 *
 * This function gets the size of a string attribute's value,
 * or the number of elements in a list, map, or set attribute.
 *
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html#Expressions.OperatorsAndFunctions.Functions AWS Function Documentation}
 *
 * @example
 * ```typescript
 * // Check if a string is longer than 100 characters
 * size("description", ">", 100)
 * // Generates: size(#description) > :value
 *
 * // Check if a list has exactly 5 elements
 * size("items", "=", 5)
 * ```
 *
 * @param field - The attribute name to check
 * @param operator - The comparison operator to use
 * @param value - The size value to compare against
 * @returns A size function expression
 */
export function size<T extends DynamoRecord, K extends Path<T>>(
  field: K,
  operator: "=" | "<" | "<=" | ">" | ">=" | "<>",
  value: number,
): Size {
  return { type: "size", field, operator, value };
}
