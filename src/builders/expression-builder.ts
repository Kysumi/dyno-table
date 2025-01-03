import type {
	ConditionOperator,
	ExpressionResult,
	ExpressionAttributes,
	PrimaryKey,
	TableIndexConfig,
	Condition,
} from "./operators";

interface InternalExpressionAttributes {
	names: Record<string, string>;
	values: Record<string, unknown>;
}

export interface IExpressionBuilder {
	buildKeyCondition(
		key: PrimaryKey,
		indexConfig: TableIndexConfig,
	): ExpressionResult;
	createExpression(filters: Condition[]): ExpressionResult;
	buildUpdateExpression(updates: Record<string, unknown>): ExpressionResult;
}

export class ExpressionBuilder implements IExpressionBuilder {
	private nameCount = 0;
	private valueCount = 0;

	private generateAlias(
		type: "name" | "value",
		prefix: string = type === "name" ? "n" : "v",
	): string {
		const count = type === "name" ? this.nameCount++ : this.valueCount++;
		const symbol = type === "name" ? "#" : ":";
		return `${symbol}${prefix}${count}`;
	}

	private reset(): void {
		this.nameCount = 0;
		this.valueCount = 0;
	}

	private createAttributePath(path: string) {
		const parts = path.split(".");
		const aliases = parts.map(() => this.generateAlias("name"));

		return {
			path: aliases.join("."),
			names: Object.fromEntries(parts.map((part, i) => [aliases[i], part])),
		};
	}

	private addValue(
		attributes: InternalExpressionAttributes,
		value: unknown,
		prefix?: string,
	) {
		const alias = this.generateAlias("value", prefix);
		attributes.values[alias] = value;
		return alias;
	}

	private buildComparison(
		path: string,
		operator: ConditionOperator,
		value: unknown,
		attributes: InternalExpressionAttributes,
		prefix?: string,
	): string {
		const simpleOperators = ["=", "<>", "<", "<=", ">", ">="];

		if (simpleOperators.includes(operator)) {
			const valueAlias = this.addValue(attributes, value, prefix);
			return `${path} ${operator} ${valueAlias}`;
		}

		switch (operator) {
			case "attribute_exists":
			case "attribute_not_exists":
				return `${operator}(${path})`;

			case "begins_with":
			case "contains":
			case "attribute_type":
				return `${operator}(${path}, ${this.addValue(attributes, value, prefix)})`;

			case "not_contains":
				return `NOT contains(${path}, ${this.addValue(attributes, value, prefix)})`;

			case "size": {
				const { compare, value: sizeValue } = value as {
					compare: string;
					value: unknown;
				};
				return `size(${path}) ${compare} ${this.addValue(attributes, sizeValue, prefix)}`;
			}

			case "BETWEEN": {
				const valueAlias = this.addValue(attributes, value, prefix);
				return `${path} BETWEEN ${valueAlias}[0] AND ${valueAlias}[1]`;
			}

			case "IN":
				return `${path} IN (${this.addValue(attributes, value, prefix)})`;

			default:
				throw new Error(`Unsupported operator: ${operator}`);
		}
	}

	createExpression(
		conditions: Array<{
			field: string;
			operator: ConditionOperator;
			value?: unknown;
		}>,
	): ExpressionResult {
		this.reset();
		const attributes: InternalExpressionAttributes = { names: {}, values: {} };

		const expressions = conditions.map(({ field, operator, value }) => {
			const { path, names } = this.createAttributePath(field);
			Object.assign(attributes.names, names);
			return this.buildComparison(path, operator, value, attributes);
		});

		return {
			expression: expressions.length ? expressions.join(" AND ") : undefined,
			attributes: this.formatAttributes(attributes),
		};
	}

	private formatAttributes({
		names,
		values,
	}: InternalExpressionAttributes): ExpressionAttributes {
		return {
			...(Object.keys(names).length && { names }),
			...(Object.keys(values).length && { values }),
		};
	}

	buildKeyCondition(
		key: PrimaryKey,
		indexConfig: TableIndexConfig,
	): ExpressionResult {
		this.reset();
		const attributes: InternalExpressionAttributes = { names: {}, values: {} };
		const conditions: string[] = [];

		// Handle partition key
		const pkName = this.generateAlias("name", "pk");
		attributes.names[pkName] = indexConfig.pkName;
		conditions.push(`${pkName} = ${this.addValue(attributes, key.pk, "pk")}`);

		// Handle sort key if present
		if (key.sk && indexConfig.skName) {
			const skName = this.generateAlias("name", "sk");
			attributes.names[skName] = indexConfig.skName;

			if (typeof key.sk === "string") {
				conditions.push(
					`${skName} = ${this.addValue(attributes, key.sk, "sk")}`,
				);
			} else {
				conditions.push(
					this.buildComparison(
						skName,
						key.sk.operator,
						key.sk.value,
						attributes,
					),
				);
			}
		}

		return {
			expression: conditions.join(" AND "),
			attributes: this.formatAttributes(attributes),
		};
	}

	buildUpdateExpression(updates: Record<string, unknown>): ExpressionResult {
		this.reset();
		const attributes: InternalExpressionAttributes = { names: {}, values: {} };
		const operations = { sets: [] as string[], removes: [] as string[] };

		for (const [key, value] of Object.entries(updates)) {
			if (key === "") {
				throw new Error("Empty key provided");
			}

			const nameAlias = this.generateAlias("name", "u");
			attributes.names[nameAlias] = key;

			if (value == null) {
				operations.removes.push(nameAlias);
			} else {
				const valueAlias = this.addValue(attributes, value, "u");
				operations.sets.push(`${nameAlias} = ${valueAlias}`);
			}
		}

		const expression = [
			operations.sets.length && `SET ${operations.sets.join(", ")}`,
			operations.removes.length && `REMOVE ${operations.removes.join(", ")}`,
		]
			.filter(Boolean)
			.join(" ");

		return {
			expression,
			attributes: this.formatAttributes(attributes),
		};
	}
}
