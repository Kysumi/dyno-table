import type { Table } from "../table";
import type { FilterCondition, PrimaryKey, FilterOperator } from "./operators";

export class QueryBuilder {
	private filters: FilterCondition[] = [];
	private limitValue?: number;
	private indexNameValue?: string;

	constructor(
		private table: Table,
		private key: PrimaryKey,
	) {}

	where(field: string, operator: FilterOperator, value: unknown) {
		this.filters.push({ field, operator, value });
		return this;
	}

	whereEquals(field: string, value: unknown) {
		return this.where(field, "=", value);
	}

	whereBetween(field: string, start: unknown, end: unknown) {
		return this.where(field, "BETWEEN", [start, end]);
	}

	whereIn(field: string, values: unknown[]) {
		return this.where(field, "IN", values);
	}

	limit(value: number) {
		this.limitValue = value;
		return this;
	}

	useIndex(indexName: string) {
		this.indexNameValue = indexName;
		return this;
	}

	async execute() {
		return this.table.nativeQuery(this.key, {
			filters: this.filters,
			limit: this.limitValue,
			indexName: this.indexNameValue,
		});
	}
}
