import type { PrimaryKeyWithoutExpression, Table } from "../table";

/**
 * Updates can only be made against the table index.
 */
export class UpdateBuilder {
	private updates: Record<string, unknown> = {};

	constructor(
		private table: Table,
		private key: PrimaryKeyWithoutExpression,
	) {}

	set(field: string, value: unknown) {
		this.updates[field] = value;
		return this;
	}

	remove(...fields: string[]) {
		for (const field of fields) {
			this.updates[field] = null;
		}
		return this;
	}

	increment(field: string, by = 1) {
		this.updates[field] = { $add: by };
		return this;
	}

	async execute() {
		return this.table.nativeUpdate(this.key, this.updates);
	}
}
