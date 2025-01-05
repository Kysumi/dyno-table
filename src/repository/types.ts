import type { PrimaryKey } from "../builders/operators";
import type { PutBuilder } from "../builders/put-builder";
import type { QueryBuilder } from "../builders/query-builder";
import type { DynamoRecord } from "../builders/types";
import type { UpdateBuilder } from "../builders/update-builder";
import type { PrimaryKeyWithoutExpression } from "../dynamo/dynamo-types";
import type { BaseRepository } from "./base-repository";

interface UnkownRecord {
	[key: string]: unknown;
}

export interface RepositoryHooks<T extends UnkownRecord> {
	beforeCreate?: (data: T, builder: PutBuilder<T>) => Promise<T> | T;
	afterCreate?: (data: T) => Promise<void> | void;

	beforeUpdate?: (
		key: PrimaryKeyWithoutExpression,
		updates: Partial<T>,
		builder: UpdateBuilder<T>,
	) => Promise<Partial<T>> | Partial<T>;
	afterUpdate?: (data: T | null) => Promise<void> | void;

	beforeDelete?: (key: PrimaryKeyWithoutExpression) => Promise<void> | void;
	afterDelete?: (key: PrimaryKeyWithoutExpression) => Promise<void> | void;

	beforeFind?: (
		key: PrimaryKey,
		builder: QueryBuilder<T>,
	) => Promise<void> | void;
	beforeQuery?: (
		key: PrimaryKey,
		builder: QueryBuilder<T>,
	) => Promise<void> | void;
	afterFind?: (data: T | null) => Promise<T | null> | (T | null);
}

export interface RepositoryPlugin<T extends DynamoRecord> {
	name: string;
	hooks?: RepositoryHooks<T>;
	initialize?: (repository: BaseRepository<T>) => void | Promise<void>;
}
