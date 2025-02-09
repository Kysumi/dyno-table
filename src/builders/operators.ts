export interface ExpressionAttributes {
  names?: Record<string, string>;
  values?: Record<string, unknown>;
}

export interface ExpressionResult {
  expression?: string;
  attributes: ExpressionAttributes;
}

/**
 * Function operators
 *
 * attribute_exists - Checks if an attribute exists
 * attribute_not_exists - Checks if an attribute does not exist
 * begins_with - Checks if a string begins with a specified prefix
 * contains - Checks if a string contains a specified substring
 * not_contains - Checks if a string does not contain a specified substring
 * attribute_type - Checks if an attribute is of a specified type
 */
export type FunctionOperator =
  | "attribute_exists"
  | "attribute_not_exists"
  | "begins_with"
  | "contains"
  | "not_contains"
  | "attribute_type";

/**
 * Examples of DynamoDB attribute types:
 * S    - String         e.g. "Hello World"
 * SS   - String Set     e.g. ["Hello", "World"]
 * N    - Number         e.g. "123.45" (stored as string)
 * NS   - Number Set     e.g. ["1", "2", "3"]
 * B    - Binary         e.g. Buffer/Blob data
 * BS   - Binary Set     e.g. [Buffer1, Buffer2]
 * BOOL - Boolean        e.g. true/false
 * NULL - Null           e.g. null
 */
export type AttributeTypes = "S" | "N" | "B" | "SS" | "NS" | "BS" | "BOOL" | "NULL";

/**
 * Comparison operators
 *
 * =    - Equal to
 * <>   - Not equal to
 * <    - Less than
 * <=   - Less than or equal to
 * >    - Greater than
 * >=   - Greater than or equal to
 */
export type ComparisonOperator = "=" | "<" | "<=" | ">" | ">=" | "<>";

/**
 * Special operators
 *
 * between - Between two values
 * in    - In a list
 * size  - Returns a number that represents an attribute's size. The following are valid data types for use with size.
 * - String - length of the string
 * - Binary - number of bytes in the binary data
 * - Set - number of elements in the set
 * - List - number of elements in the list
 * - Map - number of elements in the map
 */
export type SpecialOperator = "between" | "in" | "size";

export type ConditionOperator = FunctionOperator | ComparisonOperator | SpecialOperator;
export type FilterOperator = "=" | "<" | "<=" | ">" | ">=" | "between" | "in" | "contains" | "begins_with";

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
  value: unknown | [unknown, unknown];
};

export type PrimaryKey = {
  pk: unknown;
  sk?: SKCondition | unknown;
};

export interface TableIndexConfig {
  pkName: string;
  skName?: string;
}

export type RequiredIndexConfig<T extends string> = Record<T | "primary", TableIndexConfig>;
