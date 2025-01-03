import type { z } from "zod";
import type { Table } from "../table";
import type { QueryBuilder } from "../builders/query-builder";
import type { PrimaryKeyWithoutExpression } from "../dynamo/dynamo-types";
import type { PutBuilder } from "../builders/put-builder";
import type { DynamoRecord } from "../builders/types";
import type { PrimaryKey } from "../builders/operators";

export abstract class BaseRepository<TData extends DynamoRecord> {
	constructor(
		protected readonly table: Table,
		protected readonly schema: z.Schema<TData>,
	) {}

	protected abstract createPrimaryKey(data: TData): PrimaryKeyWithoutExpression;

	/**
	 * Default attribute applied to ALL records that get stored in DDB
	 */
	protected abstract getType(): string;
	protected abstract getTypeAttributeName(): string;

	protected beforeInsert(data: TData): TData {
		return data;
	}

	protected beforeUpdate(data: Partial<TData>): Partial<TData> {
		return data;
	}

	async exists(key: PrimaryKeyWithoutExpression): Promise<boolean> {
		const item = await this.findOne(key);
		return item !== null;
	}

	create(data: TData): PutBuilder<TData> {
		const parsed = this.schema.parse(data);
		const key = this.createPrimaryKey(parsed);
		const item = {
			...parsed,
			...key,
		};
		const indexConfig = this.table.getIndexConfig();

		const builder = this.table
			.put<TData>(item)
			.whereNotExists(indexConfig.pkName);

		if (indexConfig.skName) {
			builder.whereNotExists(indexConfig.skName);
		}

		return builder;
	}

	async update(
		key: PrimaryKeyWithoutExpression,
		updates: Partial<TData>,
	): Promise<TData | null> {
		const processed = this.beforeUpdate(updates);
		const parsed = this.schema.parse(processed);

		const updateData = {
			...parsed,
			updatedAt: new Date().toISOString(),
		};

		const result = await this.table.update(key).setMany(updateData).execute();

		if (!result.Attributes) return null;

		return this.findOne(key);
	}

	upsert(data: TData): PutBuilder<TData> {
		const key = this.createPrimaryKey(data);

		return this.table.put<TData>({
			...data,
			...key,
		});
	}

	async delete(key: PrimaryKeyWithoutExpression): Promise<void> {
		await this.table.delete(key);
	}

	async findOne(key: PrimaryKey): Promise<TData | null> {
		const item = await this.table
			.query(key)
			.where(this.getTypeAttributeName(), "=", this.getType())
			.execute();

		if (!item) {
			return null;
		}
		return this.schema.parse(item);
	}

	async findOrFail(key: PrimaryKeyWithoutExpression): Promise<TData> {
		const result = await this.findOne(key);

		if (!result) {
			throw new Error("Item not found");
		}

		return this.schema.parse(result);
	}

	protected query(key: PrimaryKey): QueryBuilder<TData> {
		return this.table
			.query(key)
			.where(this.getTypeAttributeName(), "=", this.getType());
	}
}
