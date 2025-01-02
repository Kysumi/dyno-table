export interface ExpressionAttributes {
	names: Record<string, string>;
	values: Record<string, unknown>;
}

export interface ExpressionResult {
	expression: string;
	attributes: ExpressionAttributes;
}

export type FilterOperator =
	| "="
	| "<"
	| "<="
	| ">"
	| ">="
	| "<>"
	| "BETWEEN"
	| "IN"
	| "contains"
	| "begins_with";

export interface FilterCondition {
	field: string;
	operator: FilterOperator;
	value: unknown;
}

export type SKCondition = {
	operator: "=" | "begins_with";
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
