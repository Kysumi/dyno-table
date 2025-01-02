import { ExpressionBuilder } from "./builders/expression-builder";
import type { PrimaryKey, FilterCondition } from "./builders/operators";
import { PutBuilder } from "./builders/put-builder";
import { QueryBuilder } from "./builders/query-builder";
import { UpdateBuilder } from "./builders/update-builder";
import { ExponentialBackoffStrategy } from "./retry/exponential-backoff-strategy";
import type { RetryStrategy } from "./retry/retry-strategy";
import type { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import type {
	PutCommandInput,
	DeleteCommandInput,
	UpdateCommandInput,
	GetCommandInput,
	QueryCommandInput,
	ScanCommandInput,
	TransactWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";

const DDB_BATCH_WRITE_LIMIT = 25;
const DDB_TRANSACT_WRITE_LIMIT = 100;

export type PrimaryKeyWithoutExpression = {
	pk: string;
	sk?: string;
};

type BatchWriteOperation =
	| { type: "put"; item: Record<string, unknown> }
	| { type: "delete"; key: PrimaryKey };

interface TableIndexConfig {
	pkName: string;
	skName?: string;
}

export class Table {
	private readonly client: DynamoDBDocument;
	private readonly tableName: string;
	/**
	 * DynamoDB GSI table indexes
	 */
	private readonly indexes: Record<string, TableIndexConfig>;
	private readonly expressionBuilder: ExpressionBuilder;

	constructor({
		client,
		/**
		 * The name of your DynamoDB table
		 */
		tableName,
		/**
		 * Global Secondary Indexes
		 *
		 * These are the indexes that are available/configured on your DyanmoDB table
		 * https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html
		 */
		gsiIndexes: tableIndexes,
		expressionBuilder,
	}: {
		client: DynamoDBDocument;
		tableName: string;
		gsiIndexes: Record<string, TableIndexConfig>;
		expressionBuilder?: ExpressionBuilder;
	}) {
		this.client = client;
		this.tableName = tableName;
		this.indexes = tableIndexes;
		this.expressionBuilder = expressionBuilder ?? new ExpressionBuilder();
	}

	/**
	 * Gets the configuration for a specified index
	 *
	 * @param indexName - Name of the index (undefined for base table)
	 * @returns Index configuration
	 * @throws Error if index doesn't exist
	 */
	getIndexConfig(indexName?: string): TableIndexConfig {
		if (!indexName) {
			return this.indexes.base;
		}

		if (this.indexes[indexName]) {
			return this.indexes[indexName];
		}

		throw new Error(`Index ${indexName} does not exist`);
	}

	/**
	 * Validates that the provided sort key matches index configuration
	 *
	 * @param key - Primary key to validate
	 * @param indexConfig - Index configuration to validate against
	 * @throws Error if sort key usage is invalid
	 */
	private assertValidSortKey(key: PrimaryKey, indexConfig: TableIndexConfig) {
		if (key.sk && !indexConfig.skName) {
			throw new Error("Sort key provided but index does not support sort keys");
		}
	}

	/**
	 * Constructs a DynamoDB key object based on index configuration
	 *
	 * @param key - Primary key components
	 * @param indexConfig - Index configuration to use
	 * @returns Formatted key object for DynamoDB
	 * @throws Error if required sort key is missing
	 */
	private buildKeyFromIndex(
		key: PrimaryKeyWithoutExpression,
		indexConfig: TableIndexConfig,
	): Record<string, unknown> {
		const keyObject = {
			[indexConfig.pkName]: key.pk,
		};

		if (indexConfig.skName && key.sk) {
			keyObject[indexConfig.skName] = key.sk;
		}

		// If index has a sort key but none was provided
		if (indexConfig.skName && !key.sk) {
			throw new Error("Index requires a sort key but none was provided");
		}

		return keyObject;
	}

	/**
	 * Creates or replaces an item in the table
	 *
	 * @param item - The item to put into the table
	 * @returns Promise resolving to the PutCommand result
	 */
	put(item: Record<string, unknown>): PutBuilder {
		return new PutBuilder(this, item, this.expressionBuilder);
	}

	async nativePut(
		item: Record<string, unknown>,
		options?: {
			conditionExpression?: string;
			expressionAttributeNames?: Record<string, string>;
			expressionAttributeValues?: Record<string, unknown>;
		},
	) {
		return this.withRetry(async () => {
			// https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_PutItem.html
			// For `PutCommand`, the only valid `ReturnValues` options are:
			// - `"NONE"` (default)
			// - `"ALL_OLD"` (returns the previous item if it existed)
			const params: PutCommandInput = {
				TableName: this.tableName,
				Item: item,
				ConditionExpression: options?.conditionExpression,
				ExpressionAttributeNames: options?.expressionAttributeNames,
				ExpressionAttributeValues: options?.expressionAttributeValues,
				// ...options,
			};

			return await this.client.put(params);
		});
	}

	/**
	 * Deletes a single item from the table by its primary key
	 *
	 * @param key - Primary key of the item to delete
	 * @returns Promise resolving to the DeleteCommand result
	 */
	async delete(key: PrimaryKeyWithoutExpression) {
		return this.withRetry(async () => {
			const params: DeleteCommandInput = {
				TableName: this.tableName,
				Key: key,
			};

			return await this.client.delete(params);
		});
	}

	/**
	 * Deletes multiple items matching the query criteria
	 * Note: This operation is NOT atomic and processes items in batches
	 *
	 * @param key - Primary key to query items for deletion
	 * @param options - Optional filters and index name
	 * @returns Promise resolving to the deletion result
	 */
	async deleteMany(
		key: PrimaryKey,
		options?: {
			filters?: FilterCondition[];
			indexName?: string;
		},
	) {
		const { Items } = await this.nativeQuery(key, {
			filters: options?.filters,
			indexName: options?.indexName,
			autoPaginate: true,
			consistentRead: true,
		});

		if (!Items || Items.length === 0) {
			return {
				deletedCount: 0,
			};
		}

		// Break items into chunks based on the size of the DDB transact write limit
		const chunks = Array.from(
			{ length: Math.ceil(Items.length / DDB_TRANSACT_WRITE_LIMIT) },
			(_, i) =>
				Items.slice(
					i * DDB_TRANSACT_WRITE_LIMIT,
					(i + 1) * DDB_TRANSACT_WRITE_LIMIT,
				),
		);

		const indexConfig = this.getIndexConfig(options?.indexName);

		// Process each chunk in a separate transaction
		// This is not atomic, but it's the best we can do with the current DDB limitations
		for (const chunk of chunks) {
			const transactItems = chunk.map((item) => ({
				Delete: {
					TableName: this.tableName,
					Key: {
						pk: item[indexConfig.pkName],
						sk: item[indexConfig.skName],
					},
				},
			}));

			await this.transactWrite(transactItems);
		}
	}

	/**
	 * Creates a fluent interface for building update operations
	 *
	 * @param key - Primary key of the item to update
	 * @returns UpdateBuilder instance for chaining update operations
	 */
	update(key: PrimaryKeyWithoutExpression): UpdateBuilder {
		return new UpdateBuilder(this, key, this.expressionBuilder);
	}

	async nativeUpdate(
		key: PrimaryKeyWithoutExpression,
		updates: Record<string, unknown>,
		options?: {
			conditionExpression?: string;
			expressionAttributeNames?: Record<string, string>;
			expressionAttributeValues?: Record<string, unknown>;
		},
	) {
		return this.withRetry(async () => {
			const { expression, attributes } =
				this.expressionBuilder.buildUpdateExpression(updates);

			const params: UpdateCommandInput = {
				TableName: this.tableName,
				Key: key,
				UpdateExpression: expression,
				ExpressionAttributeNames: {
					...attributes.names,
					...options?.expressionAttributeNames,
				},
				ExpressionAttributeValues: {
					...attributes.values,
					...options?.expressionAttributeValues,
				},
				...(options?.conditionExpression && {
					ConditionExpression: options.conditionExpression,
				}),
			};

			return await this.client.update(params);
		});
	}

	/**
	 * Retrieves a single item by its key
	 *
	 * @param key - Primary key of the item to retrieve
	 * @param options - Optional index name to use
	 * @returns Promise resolving to the item or undefined if not found
	 */
	async get(
		key: PrimaryKeyWithoutExpression,
		options?: { indexName?: string },
	) {
		try {
			const indexConfig = this.getIndexConfig(options?.indexName);
			this.assertValidSortKey(key, indexConfig);

			const keyObject = this.buildKeyFromIndex(key, indexConfig);

			const params: GetCommandInput = {
				TableName: this.tableName,
				Key: keyObject,
				...(options?.indexName && { IndexName: options.indexName }),
			};

			const result = await this.client.get(params);
			return result.Item;
		} catch (e) {
			console.error("Error in get operation:", e);
			console.error("Key:", JSON.stringify(key, null, 2));
			console.error(
				"Index config:",
				JSON.stringify(this.getIndexConfig(options?.indexName), null, 2),
			);
			throw e;
		}
	}

	/**
	 * Creates a fluent interface for building query operations
	 *
	 * @param key - Primary key conditions for the query
	 * @returns QueryBuilder instance for chaining query operations
	 */
	query(key: PrimaryKey): QueryBuilder {
		return new QueryBuilder(this, key, this.expressionBuilder);
	}

	/**
	 * Performs a direct query operation without using the fluent interface
	 *
	 * @param key - Primary key conditions for the query
	 * @param options - Query options including filters, pagination, and consistency
	 * @returns Promise resolving to the query results
	 */
	async nativeQuery(
		key: PrimaryKey,
		options?: {
			filters?: FilterCondition[];
			indexName?: string;
			limit?: number;
			autoPaginate?: boolean;
			pageKey?: Record<string, unknown>;
			consistentRead?: boolean;
			conditionExpression?: string;
			expressionAttributeNames?: Record<string, string>;
			expressionAttributeValues?: Record<string, unknown>;
		},
	) {
		return this.withRetry(async () => {
			const indexConfig = this.getIndexConfig(options?.indexName);

			const keyCondition = this.expressionBuilder.buildKeyCondition(
				key,
				indexConfig,
			);
			const filterExpression = options?.filters
				? this.expressionBuilder.buildFilterExpression(options.filters)
				: { expression: "", attributes: { names: {}, values: {} } };

			const merged = this.expressionBuilder.mergeExpressionResults(
				keyCondition,
				filterExpression,
			);

			const params: QueryCommandInput = {
				TableName: this.tableName,
				KeyConditionExpression: keyCondition.expression,
				...(filterExpression.expression && {
					FilterExpression: filterExpression.expression,
				}),
				ExpressionAttributeNames: {
					...merged.attributes.names,
					...options?.expressionAttributeNames,
				},
				ExpressionAttributeValues: {
					...merged.attributes.values,
					...options?.expressionAttributeValues,
				},
				...(options?.conditionExpression && {
					ConditionExpression: options.conditionExpression,
				}),
				IndexName: options?.indexName,
				Limit: options?.limit,
				ConsistentRead: options?.consistentRead,
				ExclusiveStartKey: options?.pageKey,
			};

			// Return single query result if not auto-paginating
			if (!options?.autoPaginate) {
				return await this.client.query(params);
			}

			// Handle auto-pagination
			const allItems: unknown[] = [];
			let lastEvaluatedKey: Record<string, unknown> | undefined;

			do {
				const result = await this.client.query({
					...params,
					...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey }),
				});

				if (result.Items) allItems.push(...result.Items);
				lastEvaluatedKey = result.LastEvaluatedKey;
			} while (lastEvaluatedKey);

			return {
				Items: allItems,
				Count: allItems.length,
				ScannedCount: allItems.length,
			};
		});
	}

	/**
	 * Scans the entire table with optional filtering
	 * Note: Scanning should be used sparingly as it can be expensive
	 *
	 * @param filters - Optional filter conditions
	 * @param options - Scan options including pagination
	 * @returns Promise resolving to the scan results
	 */
	async scan(
		filters?: FilterCondition[],
		options?: {
			limit?: number;
			/**
			 * This will be the PK/SK of the last record from the results array.
			 * It is how dynamodb handles pagination
			 */
			pageKey?: Record<string, unknown>;
		},
	) {
		return this.withRetry(async () => {
			const params: ScanCommandInput = {
				TableName: this.tableName,
				ExclusiveStartKey: options?.pageKey,
				Limit: options?.limit,
			};

			if (filters && filters.length > 0) {
				const { expression, attributes } =
					this.expressionBuilder.buildFilterExpression(filters);
				params.FilterExpression = expression;
				params.ExpressionAttributeNames = attributes.names;
				params.ExpressionAttributeValues = attributes.values;
			}

			return await this.client.scan(params);
		});
	}

	/**
	 * Performs multiple write operations in batches
	 * Note: Each batch can contain up to 25 operations
	 *
	 * @param operations - Array of put or delete operations
	 * @returns Promise resolving to the batch results
	 */
	async batchWrite(operations: BatchWriteOperation[]) {
		const chunks = Array.from(
			{ length: Math.ceil(operations.length / DDB_BATCH_WRITE_LIMIT) },
			(_, i) =>
				operations.slice(
					i * DDB_BATCH_WRITE_LIMIT,
					(i + 1) * DDB_BATCH_WRITE_LIMIT,
				),
		);

		const mapOperationToRequest = (op: BatchWriteOperation) =>
			op.type === "put"
				? { PutRequest: { Item: op.item } }
				: { DeleteRequest: { Key: op.key } };

		const processBatch = async (
			requests: ReturnType<typeof mapOperationToRequest>[],
		) => {
			const processUnprocessedItems = async (items: typeof requests) => {
				const result = await this.client.batchWrite({
					RequestItems: { [this.tableName]: items },
				});

				if (result.UnprocessedItems?.[this.tableName]?.length) {
					throw { unprocessedItems: result.UnprocessedItems[this.tableName] };
				}

				return result;
			};

			const initialResult = await this.client.batchWrite({
				RequestItems: { [this.tableName]: requests },
			});

			// If no unprocessed items, return the initial result. Otherwise, retry with unprocessed items
			if (!initialResult.UnprocessedItems?.[this.tableName]?.length) {
				return initialResult;
			}

			return this.withRetry(() =>
				processUnprocessedItems(
					initialResult.UnprocessedItems![this.tableName]!,
				),
			);
		};

		return Promise.all(
			chunks.map((chunk) => processBatch(chunk.map(mapOperationToRequest))),
		);
	}

	/**
	 * Performs multiple operations in a single atomic transaction
	 * Note: Limited to 100 operations per transaction
	 *
	 * @param operations - Array of transactional operations
	 * @returns Promise resolving to the transaction result
	 */
	async transactWrite(operations: TransactWriteCommandInput["TransactItems"]) {
		return this.withRetry(async () => {
			const params: TransactWriteCommandInput = {
				TransactItems: operations,
			};

			return await this.client.transactWrite(params);
		});
	}

	/**
	 * Executes an operation with automatic retries using a retry strategy.
	 * This method will retry failed operations that meet the retry criteria (like throttling errors)
	 * using exponential backoff by default.
	 *
	 * @param operation - The async operation to execute with retries
	 * @param strategy - The retry strategy to use (defaults to ExponentialBackoffStrategy)
	 * @returns Promise resolving to the operation result
	 *
	 * @example
	 * // Retry a DynamoDB put operation with default retry strategy
	 * await this.withRetry(() => this.client.put(params));
	 */
	private async withRetry<T>(
		operation: () => Promise<T>,
		strategy: RetryStrategy = new ExponentialBackoffStrategy(),
	) {
		let attempt = 0;

		while (true) {
			try {
				return await operation();
			} catch (error) {
				if (!strategy.shouldRetry(error, attempt)) {
					throw error;
				}

				await new Promise((resolve) =>
					setTimeout(resolve, strategy.getDelay(attempt)),
				);

				attempt++;
			}
		}
	}
}
