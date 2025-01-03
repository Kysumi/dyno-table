type DynamoKey = Record<string, unknown>;

export interface DynamoExpression {
	expression?: string;
	names?: Record<string, string>;
	values?: Record<string, unknown>;
}

export interface DynamoGetOptions {
	key: DynamoKey;
	indexName?: string;
}

export interface DynamoQueryOptions {
	indexName?: string;
	filter?: DynamoExpression;
	keyCondition?: DynamoExpression;
	limit?: number;
	pageKey?: Record<string, unknown>;
	autoPaginate?: boolean;
	consistentRead?: boolean;
}

export interface DynamoPutOptions {
	item: Record<string, unknown>;
	condition?: DynamoExpression;
}

export interface DynamoUpdateOptions {
	key: DynamoKey;
	update: DynamoExpression;
	condition?: DynamoExpression;
	returnValues?: "ALL_NEW" | "ALL_OLD" | "UPDATED_NEW" | "UPDATED_OLD";
}

export interface DynamoDeleteOptions {
	key: DynamoKey;
	condition?: DynamoExpression;
}

export interface DynamoScanOptions {
	filter?: DynamoExpression;
	limit?: number;
	pageKey?: Record<string, unknown>;
	indexName?: string;
}

export interface DynamoBatchWriteItem {
	put?: Record<string, unknown>;
	delete?: DynamoKey;
}

export interface DynamoTransactItem {
	put?: {
		item: Record<string, unknown>;
		condition?: DynamoExpression;
	};
	delete?: {
		key: DynamoKey;
		condition?: DynamoExpression;
	};
	update?: {
		key: DynamoKey;
		update: DynamoExpression;
		condition?: DynamoExpression;
	};
}

export interface DynamoPutOperation {
	type: "put";
	item: Record<string, unknown>;
	condition?: DynamoExpression;
}

export interface DynamoUpdateOperation {
	type: "update";
	key: PrimaryKeyWithoutExpression;
	update: DynamoExpression;
	condition?: DynamoExpression;
}

export interface DynamoQueryOperation {
	type: "query";
	keyCondition?: DynamoExpression;
	filter?: DynamoExpression;
	limit?: number;
	indexName?: string;
}

export interface DynamoDeleteOperation {
	type: "delete";
	key: PrimaryKeyWithoutExpression;
	condition?: DynamoExpression;
}

export interface DynamoBatchWriteOperation {
	type: "batchWrite";
	operations: DynamoBatchWriteItem[];
}

export interface DynamoTransactOperation {
	type: "transactWrite";
	operations: Array<{
		put?: {
			item: Record<string, unknown>;
			condition?: DynamoExpression;
		};
		delete?: {
			key: PrimaryKeyWithoutExpression;
			condition?: DynamoExpression;
		};
		update?: {
			key: PrimaryKeyWithoutExpression;
			update: DynamoExpression;
			condition?: DynamoExpression;
		};
	}>;
}

export type DynamoOperation =
	| DynamoPutOperation
	| DynamoUpdateOperation
	| DynamoQueryOperation
	| DynamoDeleteOperation
	| DynamoBatchWriteOperation
	| DynamoTransactOperation;

export type PrimaryKeyWithoutExpression = {
	pk: string;
	sk?: string;
};

export type BatchWriteOperation =
	| { type: "put"; item: Record<string, unknown> }
	| { type: "delete"; key: PrimaryKeyWithoutExpression };
