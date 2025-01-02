import type { z } from "zod";
import type { Table } from "../table";
import { QueryBuilder } from "../builders/query-builder";
import type { FilterOperator } from "../builders/operators";
import type { PrimaryKeyWithoutExpression } from "../table";

type InferZodSchema<T extends z.ZodType> = z.infer<T>;

export abstract class BaseRepository<TSchema extends z.ZodType> {
	constructor(
		protected readonly table: Table,
		protected readonly schema: TSchema,
	) {}

	protected abstract createPrimaryKey(
		data: InferZodSchema<TSchema>,
	): PrimaryKeyWithoutExpression;

	protected abstract getIndexKeys(): { pk: string; sk?: string };

	/**
	 * Default attribute applied to ALL records that get stored in DDB
	 */
	protected abstract getType(): string;

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

		// Get the index config to know which key attributes to check
		const indexConfig = this.table.getIndexConfig();

		// Build condition to ensure key doesn't exist
		const conditionExpression = `attribute_not_exists(${indexConfig.pkName})${
			indexConfig.skName
				? ` AND attribute_not_exists(${indexConfig.skName})`
				: ""
		}`;

		try {
			await this.table.put(item, {
				conditionExpression,
			});
			return parsed;
		} catch (error) {
			// Handle DynamoDB's ConditionalCheckFailedException
			if (
				error &&
				typeof error === "object" &&
				"name" in error &&
				error.name === "ConditionalCheckFailedException"
			) {
				throw new Error("Item already exists");
			}
			throw error;
		}
	}

	async update(
		key: PrimaryKeyWithoutExpression,
		updates: Partial<InferZodSchema<TSchema>>,
	): Promise<InferZodSchema<TSchema>> {
		const parsed = this.schema.parse(updates);
		const result = await this.table.nativeUpdate(key, parsed);

		return result.Attributes ? this.schema.parse(result.Attributes) : null;
	}

	async delete(key: PrimaryKeyWithoutExpression): Promise<void> {
		await this.table.delete(key);
	}

	async findOne(key: PrimaryKeyWithoutExpression): Promise<T | null> {
		const item = await this.table.get(key);
		if (!item) return null;
		return this.schema.parse(item);
	}

	protected query(key: PrimaryKeyWithoutExpression): QueryBuilder {
		return new QueryBuilder(this.table, key);
	}

	async find(options?: {
		where?: Array<{
			field: string;
			operator: FilterOperator;
			value: unknown;
		}>;
		limit?: number;
		indexName?: string;
	}): Promise<T[]> {
		const { pk, sk } = this.getIndexKeys();

		let queryBuilder = this.query({
			pk: pk,
			...(sk && { sk: sk }),
		});

		if (options?.where) {
			for (const condition of options.where) {
				queryBuilder = queryBuilder.where(
					condition.field,
					condition.operator,
					condition.value,
				);
			}
		}

		if (options?.limit) {
			queryBuilder = queryBuilder.limit(options.limit);
		}

		if (options?.indexName) {
			queryBuilder = queryBuilder.useIndex(options.indexName);
		}

		const result = await queryBuilder.execute();
		return (result.Items || []).map((item) => this.schema.parse(item));
	}
}
