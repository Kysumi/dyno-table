import type {
	Condition,
	ConditionOperator,
	ExpressionAttributes,
	ExpressionResult,
	FilterCondition,
	PrimaryKey,
	TableIndexConfig,
} from "./operators";

export interface IExpressionBuilder {
	buildKeyCondition(
		key: PrimaryKey,
		indexConfig: TableIndexConfig,
	): ExpressionResult;

	buildFilterExpression(filters: FilterCondition[]): ExpressionResult;

	buildConditionExpression(conditions: Condition[]): ExpressionResult;

	buildUpdateExpression(updates: Record<string, unknown>): ExpressionResult;

	mergeExpressionResults(...results: ExpressionResult[]): ExpressionResult;
}

export class ExpressionBuilder implements IExpressionBuilder {
	private nameCount = 0;
	private valueCount = 0;

	/**
	 * Generates a unique alias for attribute names in DynamoDB expressions
	 * Format: #n0, #n1, #n2, etc.
	 */
	private getNextNameAlias() {
		return `#n${this.nameCount++}`;
	}

	/**
	 * Generates a unique alias for attribute values in DynamoDB expressions
	 * Format: :v0, :v1, :v2, etc.
	 */
	private getNextValueAlias() {
		return `:v${this.valueCount++}`;
	}

	/**
	 * Resets the name and value counters.
	 * Should be called at the start of building each new expression
	 * to ensure consistent alias generation.
	 */
	private resetCounters() {
		this.nameCount = 0;
		this.valueCount = 0;
	}

	/**
	 * Handles nested attribute paths by creating appropriate aliases
	 * Example: "user.address.city" becomes "#n0.#n1.#n2"
	 *
	 * @param field - The attribute path (e.g., "user.address.city")
	 * @returns Object containing the aliased path and name mappings
	 */
	private createFieldPath(field: string): {
		fieldPath: string;
		aliases: { [key: string]: string };
	} {
		const pathParts = field.split(".");
		const fieldAliases = pathParts.map(() => this.getNextNameAlias());
		const fieldPath = fieldAliases.join(".");

		const aliases = pathParts.reduce(
			(acc, part, index) => {
				acc[fieldAliases[index]] = part;
				return acc;
			},
			{} as Record<string, string>,
		);

		return { fieldPath, aliases };
	}

	/**
	 * Expression builder that handles the common pattern of creating
	 * DynamoDB expressions with attribute name/value substitutions
	 *
	 * @param conditions - Array of conditions to build expressions for
	 * @param buildCondition - Function that builds the specific expression syntax
	 * @returns Expression string and attribute mappings
	 */
	private buildExpression(
		conditions: Array<{
			field: string;
			operator: ConditionOperator;
			value?: unknown;
		}>,
		buildCondition: (params: {
			fieldPath: string;
			operator: ConditionOperator;
			valueAlias?: string;
			value?: unknown;
		}) => string,
	): ExpressionResult {
		this.resetCounters();
		const attributes: ExpressionAttributes = {
			names: {},
			values: {},
		};

		const expressions = conditions.map((condition) => {
			const { fieldPath, aliases } = this.createFieldPath(condition.field);
			Object.assign(attributes.names, aliases);

			// Handle operators that don't require values
			if (
				condition.operator === "attribute_exists" ||
				condition.operator === "attribute_not_exists"
			) {
				return buildCondition({ fieldPath, operator: condition.operator });
			}

			// Handle operators that require values
			const valueAlias = this.getNextValueAlias();
			attributes.values[valueAlias] = condition.value;

			return buildCondition({
				fieldPath,
				operator: condition.operator,
				valueAlias,
				value: condition.value,
			});
		});

		return {
			expression: expressions.join(" AND "),
			attributes,
		};
	}

	/**
	 * Builds a KeyConditionExpression for DynamoDB queries
	 * Handles both partition key and optional sort key conditions
	 *
	 * @param key - Primary key with partition key and optional sort key
	 * @param indexConfig - Configuration of the table/index being queried
	 * @returns KeyConditionExpression and attribute mappings
	 *
	 * @example
	 * ```ts
	 * buildKeyCondition(
	 *   { pk: "USER#123", sk: { operator: "begins_with", value: "ORDER#" } },
	 *   { pkName: "PK", skName: "SK" }
	 * )
	 * ```
	 */
	buildKeyCondition(
		key: PrimaryKey,
		indexConfig: TableIndexConfig,
	): ExpressionResult {
		this.resetCounters();
		const conditions: string[] = [];
		const attributes: ExpressionAttributes = {
			names: {},
			values: {},
		};

		// Handle partition key
		const pkAlias = this.getNextNameAlias();
		const pkValueAlias = this.getNextValueAlias();

		conditions.push(`${pkAlias} = ${pkValueAlias}`);
		attributes.names[pkAlias] = indexConfig.pkName;
		attributes.values[pkValueAlias] = key.pk;

		// Handle sort key if present
		if (key.sk && indexConfig.skName) {
			const skAlias = this.getNextNameAlias();
			const skValueAlias = this.getNextValueAlias();
			attributes.names[skAlias] = indexConfig.skName;

			if (typeof key.sk === "string") {
				conditions.push(`${skAlias} = ${skValueAlias}`);
				attributes.values[skValueAlias] = key.sk;
			} else {
				switch (key.sk.operator) {
					case "begins_with":
						conditions.push(`begins_with(${skAlias}, ${skValueAlias})`);
						attributes.values[skValueAlias] = key.sk.value;
						break;
					case "=":
						conditions.push(`${skAlias} = ${skValueAlias}`);
						attributes.values[skValueAlias] = key.sk.value;
						break;
				}
			}
		}

		return {
			expression: conditions.join(" AND "),
			attributes,
		};
	}

	/**
	 * Builds a FilterExpression for DynamoDB queries/scans
	 * Supports various comparison operators and functions
	 *
	 * @param filters - Array of filter conditions
	 * @returns FilterExpression and attribute mappings
	 *
	 * @example
	 * ```ts
	 * buildFilterExpression([
	 *   { field: "age", operator: ">", value: 21 },
	 *   { field: "status", operator: "IN", value: ["active", "pending"] }
	 * ])
	 * ```
	 */
	buildFilterExpression(filters: FilterCondition[]): ExpressionResult {
		return this.buildExpression(
			filters,
			({ fieldPath, operator, valueAlias, value }) => {
				switch (operator) {
					case "BETWEEN":
						return `${fieldPath} BETWEEN ${valueAlias}[0] AND ${valueAlias}[1]`;
					case "IN":
						return `${fieldPath} IN (${valueAlias})`;
					case "begins_with":
						return `begins_with(${fieldPath}, ${valueAlias})`;
					case "contains":
						return `contains(${fieldPath}, ${valueAlias})`;
					default:
						return `${fieldPath} ${operator} ${valueAlias}`;
				}
			},
		);
	}

	/**
	 * Builds a ConditionExpression for DynamoDB write operations
	 * Supports attribute existence checks and comparison operators
	 *
	 * @param conditions - Array of conditions to check
	 * @returns ConditionExpression and attribute mappings
	 *
	 * @example
	 * ```ts
	 * buildConditionExpression([
	 *   { field: "version", operator: "=", value: 1 },
	 *   { field: "status", operator: "attribute_exists" }
	 * ])
	 * ```
	 */
	buildConditionExpression(conditions: Condition[]): ExpressionResult {
		return this.buildExpression(
			conditions,
			({ fieldPath, operator, valueAlias }) => {
				if (operator === "attribute_exists") {
					return `attribute_exists(${fieldPath})`;
				}
				if (operator === "attribute_not_exists") {
					return `attribute_not_exists(${fieldPath})`;
				}
				return `${fieldPath} ${operator} ${valueAlias}`;
			},
		);
	}

	/**
	 * Builds an UpdateExpression for DynamoDB update operations
	 * Handles SET and REMOVE operations based on value presence
	 *
	 * @param updates - Record of attribute updates
	 * @returns UpdateExpression and attribute mappings
	 *
	 * @example
	 * ```ts
	 * buildUpdateExpression({
	 *   name: "John",       // SET name = :v0
	 *   age: 30,            // SET age = :v1
	 *   oldField: null      // REMOVE oldField
	 * })
	 * ```
	 */
	buildUpdateExpression(updates: Record<string, unknown>): ExpressionResult {
		this.resetCounters();
		const attributes: ExpressionAttributes = {
			names: {},
			values: {},
		};

		const { sets, removes } = Object.entries(updates).reduce(
			(acc, [key, value]) => {
				const nameAlias = this.getNextNameAlias();
				attributes.names[nameAlias] = key;

				if (value === null || value === undefined) {
					acc.removes.push(nameAlias);
				} else {
					const valueAlias = this.getNextValueAlias();
					acc.sets.push(`${nameAlias} = ${valueAlias}`);
					attributes.values[valueAlias] = value;
				}
				return acc;
			},
			{ sets: [] as string[], removes: [] as string[] },
		);

		const expressions: string[] = [];
		if (sets.length > 0) expressions.push(`SET ${sets.join(", ")}`);
		if (removes.length > 0) expressions.push(`REMOVE ${removes.join(", ")}`);

		return {
			expression: expressions.join(" "),
			attributes,
		};
	}

	/**
	 * Combines multiple expression results into a single expression
	 * Useful when combining different types of expressions
	 *
	 * @param results - Array of expression results to merge
	 * @returns Combined expression and merged attribute mappings
	 *
	 * @example
	 * ```ts
	 * mergeExpressionResults(
	 *   buildKeyCondition(...),
	 *   buildFilterExpression(...)
	 * )
	 * ```
	 */
	mergeExpressionResults(...results: ExpressionResult[]): ExpressionResult {
		return {
			expression: results
				.map((r) => r.expression)
				.filter(Boolean)
				.join(" "),
			attributes: {
				names: Object.assign({}, ...results.map((r) => r.attributes.names)),
				values: Object.assign({}, ...results.map((r) => r.attributes.values)),
			},
		};
	}
}
