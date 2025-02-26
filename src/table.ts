import type { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import type { RequiredIndexConfig, TableIndexConfig } from "./builders/operators";
import { DynamoService } from "./dynamo/dynamo-service";
import type { BatchWriteOperation, DynamoBatchWriteItem, PrimaryKeyWithoutExpression } from "./dynamo/dynamo-types";

/**
 * Main interface for interacting with a DynamoDB table. Provides type-safe methods
 * for CRUD operations, queries, scans, and transactions.
 */
export class Table<TIndexes extends string> {
  private readonly dynamoService: DynamoService;
  private readonly indexes: RequiredIndexConfig<TIndexes>;

  /**
   * Creates a new Table instance with the specified configuration
   * @param params - Configuration object
   * @param params.client - Pre-configured DynamoDB Document client instance
   * @param params.tableName - Name of the DynamoDB table to interact with
   * @param params.tableIndexes - Index configuration (both primary and secondary indexes)
   */
  constructor({
    client,
    tableName,
    tableIndexes,
  }: {
    client: DynamoDBDocument;
    tableName: string;
    tableIndexes: RequiredIndexConfig<TIndexes>;
  }) {
    this.dynamoService = new DynamoService(client, tableName);
    this.indexes = tableIndexes;
  }

  /**
   * Retrieves configuration for a specific table index
   * @param indexName - Name of the index to retrieve (must be defined in tableIndexes)
   * @returns Object containing the physical attribute names for the index keys
   * @throws Error if the requested index is not configured
   */
  getIndexConfig(indexName: TIndexes): TableIndexConfig {
    if (!(indexName in this.indexes)) {
      throw new Error(`Index ${indexName} does not exist`);
    }
    return this.indexes[indexName];
  }

  /**
   * Creates a new PutItem operation builder for inserting an item
   * @param item - Complete item to insert into the table
   * @returns PutBuilder instance for chaining conditions and executing the operation
   * @example
   * // Insert new dinosaur specimen
   * await table.put({
   *   pk: 'dino#trex123',
   *   sk: 'specimen',
   *   species: 'Tyrannosaurus Rex',
   *   weight: 8000
   * }).execute();
   */
  put<T extends DynamoRecord>(item: T): PutBuilder<T> {
    return new PutBuilder(item, this.expressionBuilder, async (operation) => {
      // TODO: Make it so the end user can specify if they want the additional DATA
      // about the query to be returned like capcity units ect
      await this.dynamoService.put(operation);

      // Return the item that was placed into the table
      return item;
      // return result.Attributes as T;
    });
  }

  /**
   * Creates an UpdateItem operation builder for modifying an existing item
   * @param key - Full primary key of the item to update (including sort key if required)
   * @returns UpdateBuilder instance for chaining update operations and conditions
   * @example
   * // Update dinosaur's diet classification
   * await table.update({ pk: 'dino#trex123', sk: 'classification' })
   *   .set('diet', 'carnivore')
   *   .execute();
   */
  update<T extends DynamoRecord>(key: PrimaryKeyWithoutExpression): UpdateBuilder<T> {
    return new UpdateBuilder<T>(key, this.expressionBuilder, async (operation) => {
      const result = await this.dynamoService.update(operation);
      return result.Attributes as T;
    });
  }

  /**
   * Creates a Query operation builder for finding items by primary key
   * @param key - Key condition to query (supports partition key and sort key conditions)
   * @returns QueryBuilder instance for adding filters, pagination, and index selection
   * @example
   * // Query for all velociraptor fossils
   * const fossils = await table.query({
   *   pk: 'dino#velociraptor',
   *   sk: { operator: 'begins_with', value: 'fossil#' }
   * }).execute();
   */
  query<T extends DynamoRecord>(key: PrimaryKey): QueryBuilder<T, TIndexes> {
    return new QueryBuilder<T, TIndexes>(key, this.indexes, this.expressionBuilder, async (operation) => {
      return await this.dynamoService.query(operation);
    });
  }

  /**
   * Direct GetItem operation for retrieving a single item by its full primary key
   * @param key - Complete primary key (including sort key if required by the table's schema)
   * @param options - Optional parameters including index specification
   * @returns The retrieved item or undefined if not found
   * @example
   * // Get triceratops habitat info
   * const habitat = await table.get({
   *   pk: 'dino#triceratops',
   *   sk: 'habitat#cretaceous'
   * });
   */
  async get(key: PrimaryKeyWithoutExpression, options?: { indexName?: TIndexes }) {
    const indexConfig = this.getIndexConfig(options?.indexName || ("primary" as TIndexes));
    const keyObject = this.buildKeyFromIndex(key, indexConfig);

    const result = await this.dynamoService.get(keyObject, options);

    return result.Item;
  }

  /**
   * Creates a DeleteItem operation builder for removing an item
   * @param key - Full primary key of the item to delete
   * @returns DeleteBuilder instance for adding conditional checks
   * @example
   * // Remove outdated fossil record
   * await table.delete({ pk: 'dino#brontosaurus', sk: 'record#old' })
   *   .where('discoveryYear', '<', 1990)
   *   .execute();
   */
  delete<T extends DynamoRecord>(key: PrimaryKeyWithoutExpression) {
    return new DeleteBuilder<T>(key, this.expressionBuilder, async (operation) => {
      await this.dynamoService.delete(operation);
    });
  }

  /**
   * Creates a Scan operation builder for full table scans (use sparingly)
   * @returns ScanBuilder instance for adding filters and pagination
   * @example
   * // Scan for all carnivorous dinosaurs
   * const predators = await table.scan()
   *   .where('diet', '=', 'carnivore')
   *   .execute();
   */
  scan<T extends DynamoRecord>(): ScanBuilder<T, TIndexes> {
    return new ScanBuilder<T, TIndexes>(this.expressionBuilder, this.indexes, (operation) =>
      this.dynamoService.scan(operation),
    );
  }

  /**
   * Batch write operation for executing multiple puts/deletes in a single request
   * @param operations - Array of write operations (max 25 per request)
   * @returns Promise resolving when all operations complete, with unprocessed items if capacity exceeded
   * @example
   * // Batch write with mixed operations
   * await table.batchWrite([
   *   { type: 'put', item: { pk: '1', sk: 'a' } },
   *   { type: 'delete', key: { pk: '2', sk: 'b' } }
   * ]);
   */
  async batchWrite(operations: BatchWriteOperation[]) {
    const batchOperation: DynamoBatchWriteItem[] = operations.map((op) => {
      if (op.type === "put") {
        return { put: op.item };
      }
      return { delete: op.key };
    });

    return this.dynamoService.batchWrite(batchOperation);
  }

  /**
   * Transactional write operation builder for atomic multiple-item updates
   * @param callback - Function that receives a TransactionBuilder to add operations
   * @returns Promise resolving when transaction completes
   * @example
   * // Fossil discovery transaction
   * await table.withTransaction(async (trx) => {
   *   table.update({ pk: 'dino#trex', sk: 'fossil#456' })
   *     .set('status', 'analyzed')
   *     .withTransaction(trx);
   *
   *   table.put({
   *     pk: 'log#discovery',
   *     sk: new Date().toISOString(),
   *     event: 'Fossil analyzed',
   *     specimenId: 'trex#456'
   *   }).withTransaction(trx);
   * });
   */
  async withTransaction<T>(callback: (trx: TransactionBuilder) => Promise<void>) {
    const transactionBuilder = new TransactionBuilder();
    await callback(transactionBuilder);
    const result = await this.dynamoService.transactWrite(transactionBuilder.getOperation());
    return result;
  }

  /**
   * Executes a pre-configured transaction
   * @param builder - TransactionBuilder containing the operations to execute
   * @returns Promise resolving when transaction completes
   * @example
   * const trx = new TransactionBuilder();
   * // ... add operations ...
   * await table.transactWrite(trx);
   */
  async transactWrite(builder: TransactionBuilder) {
    const result = await this.dynamoService.transactWrite(builder.getOperation());
    return result;
  }

  private buildKeyFromIndex(key: PrimaryKeyWithoutExpression, indexConfig: TableIndexConfig): Record<string, unknown> {
    this.validateKey(key, indexConfig);

    const keyObject = {
      [indexConfig.pkName]: key.pk,
    };

    if (indexConfig.skName && key.sk) {
      keyObject[indexConfig.skName] = key.sk;
    }

    return keyObject;
  }

  private validateKey(key: PrimaryKeyWithoutExpression, indexConfig: TableIndexConfig) {
    if (!key.pk) {
      throw new Error("Partition key is required");
    }

    if (key.sk && !indexConfig.skName) {
      throw new Error("Sort key provided but index does not support sort keys");
    }

    if (!key.sk && indexConfig.skName) {
      throw new Error("Index requires a sort key but none was provided");
    }
  }
}
