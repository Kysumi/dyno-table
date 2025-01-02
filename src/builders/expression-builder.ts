import type {
	PrimaryKey,
	TableIndexConfig,
	ExpressionResult,
	ExpressionAttributes,
	FilterCondition,
} from "./operators";

export class ExpressionBuilder {
	private nameCount = 0;
	private valueCount = 0;

	private getNextNameAlias() {
		return `#n${this.nameCount++}`;
	}

	private getNextValueAlias() {
		return `:v${this.valueCount++}`;
	}

	private resetCounters() {
		this.nameCount = 0;
		this.valueCount = 0;
	}

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

	buildFilterExpression(filters: FilterCondition[]): ExpressionResult {
		this.resetCounters();
		const attributes: ExpressionAttributes = {
			names: {},
			values: {},
		};

		const conditions = filters.map((filter) => {
			const pathParts = filter.field.split(".");
			const fieldAliases = pathParts.map(() => this.getNextNameAlias());
			const fieldPath = fieldAliases.join(".");
			const valueAlias = this.getNextValueAlias();

			// Add name aliases for each path part
			pathParts.forEach((part, index) => {
				attributes.names[fieldAliases[index]] = part;
			});

			attributes.values[valueAlias] = filter.value;

			switch (filter.operator) {
				case "BETWEEN":
					return `${fieldPath} BETWEEN ${valueAlias}[0] AND ${valueAlias}[1]`;
				case "IN":
					return `${fieldPath} IN (${valueAlias})`;
				case "begins_with":
					return `begins_with(${fieldPath}, ${valueAlias})`;
				case "contains":
					return `contains(${fieldPath}, ${valueAlias})`;
				default:
					return `${fieldPath} ${filter.operator} ${valueAlias}`;
			}
		});

		return {
			expression: conditions.join(" AND "),
			attributes,
		};
	}

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
