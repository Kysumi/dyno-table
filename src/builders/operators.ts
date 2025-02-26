// Define the types for different DynamoDB attribute types
export type DynamoDBAttributeType =
  | "S" // String
  | "N" // Number
  | "B" // Binary
  | "SS" // String Set
  | "NS" // Number Set
  | "BS" // Binary Set
  | "L" // List
  | "M" // Map
  | "BOOL" // Boolean
  | "NULL"; // Null

// Define the base Expression type, which is a union of all possible expression types
export type Expression<T> =
  | Condition<T>
  | LogicalOperator<T>
  | AttributeExists
  | AttributeNotExists
  | AttributeType
  | Contains
  | BeginsWith
  | Size;

// Represents a condition (e.g., field = value, field > value)
export type Condition<T> = {
  field: string;
  operator: string;
  value: T | T[] | Expression<T>; // Value can be a simple value or another expression (for nested conditions)
};

// Represents a logical operator (AND, OR, NOT)
export type LogicalOperator<T> = {
  operator: "AND" | "OR" | "NOT";
  expressions: Expression<T>[]; // Array of expressions to combine
};

// Represents the attribute_exists function
export type AttributeExists = {
  type: "attribute_exists";
  field: string;
};

// Represents the attribute_not_exists function
export type AttributeNotExists = {
  type: "attribute_not_exists";
  field: string;
};

// Represents the attribute_type function
export type AttributeType = {
  type: "attribute_type";
  field: string;
  attributeType: DynamoDBAttributeType;
};

// Represents the contains function
export type Contains = {
  type: "contains";
  field: string;
  value: unknown;
};

// Represents the begins_with function
export type BeginsWith = {
  type: "begins_with";
  field: string;
  value: unknown;
};

// Represents the size function
export type Size = {
  type: "size";
  field: string;
  operator: string;
  value: number;
};

/**
 * OLDER STUFF BELOW
 */
export type FilterOperator = "=" | "<" | "<=" | ">" | ">=" | "<>" | "BETWEEN" | "IN" | "contains" | "begins_with";

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value: unknown;
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

export type RequiredIndexConfig<T extends string> = Record<T | "primary", TableIndexConfig>;
