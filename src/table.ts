import type { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { ExpressionBuilder } from "./builders/expression-builder";
import { PutBuilder } from "./builders/put-builder";
import { QueryBuilder } from "./builders/query-builder";
import { UpdateBuilder } from "./builders/update-builder";
import { DynamoService } from "./dynamo/dynamo-service";
import type { PrimaryKey, TableIndexConfig } from "./builders/operators";
import type { PrimaryKeyWithoutExpression, BatchWriteOperation, DynamoBatchWriteItem } from "./dynamo/dynamo-types";
import { ScanBuilder } from "./builders/scan-builder";
import type { DynamoRecord } from "./builders/types";
import { TransactionBuilder } from "./builders/transaction-builder";
import { DeleteBuilder } from "./builders/delete-builder";

type IndexConfig = Record<string, TableIndexConfig> & {
  primary: TableIndexConfig;
};

export class Table {
  private readonly dynamoService: DynamoService;
  private readonly expressionBuilder: ExpressionBuilder;
  private readonly indexes: IndexConfig;

  constructor({
    client,
    tableName,
    tableIndexes,
    expressionBuilder,
  }: {
    client: DynamoDBDocument;
    tableName: string;
    tableIndexes: IndexConfig;
    expressionBuilder?: ExpressionBuilder;
  }) {
    this.dynamoService = new DynamoService(client, tableName);
    this.expressionBuilder = expressionBuilder ?? new ExpressionBuilder();
    this.indexes = tableIndexes;
  }

  getIndexConfig(indexName?: string): TableIndexConfig {
    if (!indexName) {
      return this.indexes.primary;
    }

    if (this.indexes[indexName]) {
      return this.indexes[indexName];
    }

    throw new Error(`Index ${indexName} does not exist`);
  }

  put<T extends DynamoRecord>(item: T): PutBuilder<T> {
    return new PutBuilder(item, this.expressionBuilder, async (operation) => {
      // TODO: Make it so the end user can specify if they want the additional DATA
      // about the query to be returned like capcity units ect
      const result = await this.dynamoService.put(operation);

      // Return the item that was placed into the table
      return item;
      // return result.Attributes as T;
    });
  }

  update<T extends DynamoRecord>(key: PrimaryKeyWithoutExpression): UpdateBuilder<T> {
    return new UpdateBuilder<T>(key, this.expressionBuilder, async (operation) => {
      const result = await this.dynamoService.update(operation);
      return result.Attributes as T;
    });
  }

  query<T extends DynamoRecord>(key: PrimaryKey): QueryBuilder<T> {
    return new QueryBuilder<T>(key, this.getIndexConfig(), this.expressionBuilder, async (operation) => {
      const result = await this.dynamoService.query(operation);
      return result.Items as T[];
    });
  }

  async get(key: PrimaryKeyWithoutExpression, options?: { indexName?: string }) {
    const indexConfig = this.getIndexConfig(options?.indexName);
    const keyObject = this.buildKeyFromIndex(key, indexConfig);

    const result = await this.dynamoService.get(keyObject, options);

    return result.Item;
  }

  delete(key: PrimaryKeyWithoutExpression) {
    return new DeleteBuilder(key, this.expressionBuilder, async (operation) => {
      await this.dynamoService.delete(operation);
    });
  }

  scan<T extends DynamoRecord>(): ScanBuilder<T> {
    return new ScanBuilder(this.expressionBuilder, (operation) => this.dynamoService.scan(operation));
  }

  async batchWrite(operations: BatchWriteOperation[]) {
    const batchOperation: DynamoBatchWriteItem[] = operations.map((op) => {
      if (op.type === "put") {
        return { put: op.item };
      }
      return { delete: op.key };
    });

    return this.dynamoService.batchWrite(batchOperation);
  }

  async withTransaction<T>(callback: (trx: TransactionBuilder) => Promise<void>) {
    const transactionBuilder = new TransactionBuilder();
    await callback(transactionBuilder);
    const result = await this.dynamoService.transactWrite(transactionBuilder.getOperation());
    return result;
  }

  /**
   * Execute a transaction with multiple operations.
   * @param builder
   * @returns
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
