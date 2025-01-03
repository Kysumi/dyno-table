import type { z } from "zod";
import type { Table } from "../table";
import type { QueryBuilder } from "../builders/query-builder";
import type { PrimaryKeyWithoutExpression } from "../dynamo/dynamo-types";

type InferZodSchema<T extends z.ZodType> = z.infer<T>;

export abstract class BaseRepository<TSchema extends z.ZodType> {
	constructor(
		protected readonly table: Table,
		protected readonly schema: TSchema,
	) {}

	protected abstract createPrimaryKey(
		data: InferZodSchema<TSchema>,
	): PrimaryKeyWithoutExpression;

	/**
	 * Default attribute applied to ALL records that get stored in DDB
	 */
	protected abstract getType(): string;
	protected abstract getTypeAttributeName(): string;

	protected beforeInsert(
		data: InferZodSchema<TSchema>,
	): InferZodSchema<TSchema> {
		return data;
	}

	protected beforeUpdate(
		data: InferZodSchema<TSchema>,
	): InferZodSchema<TSchema> {
		return data;
	}

	async create(
		data: InferZodSchema<TSchema>,
	): Promise<InferZodSchema<TSchema>> {
		const parsed = this.schema.parse(data);
		const key = this.createPrimaryKey(parsed);
		const item = {
			...parsed,
			...key,
		};
		const indexConfig = this.table.getIndexConfig();
		await this.table.put(item).whereNotExists(indexConfig.pkName).execute();
		return parsed;
	}

	async update(
		key: PrimaryKeyWithoutExpression,
		updates: Partial<InferZodSchema<TSchema>>,
	): Promise<InferZodSchema<TSchema>> {
		const parsed = this.schema.parse(updates);
		const result = await this.table.update(key).setMany(parsed).execute();

		return result.Attributes ? this.schema.parse(result.Attributes) : null;
	}

	async delete(key: PrimaryKeyWithoutExpression): Promise<void> {
		await this.table.delete(key);
	}

	async findOne(
		key: PrimaryKeyWithoutExpression,
	): Promise<InferZodSchema<TSchema> | null> {
		const item = await this.table
			.query(key)
			.where(this.getTypeAttributeName(), "=", this.getType())
			.execute();

		if (!item) {
			return null;
		}
		return this.schema.parse(item);
	}

	async findOrFail(
		key: PrimaryKeyWithoutExpression,
	): Promise<InferZodSchema<TSchema>> {
		const result = await this.findOne(key);

		if (!result) {
			throw new Error("Item not found");
		}

		return this.schema.parse(result);
	}

	protected query(key: PrimaryKeyWithoutExpression): QueryBuilder {
		return this.table
			.query(key)
			.where(this.getTypeAttributeName(), "=", this.getType());
	}
}
