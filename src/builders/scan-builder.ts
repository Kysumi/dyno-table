import type { DynamoQueryResponse } from "../dynamo/dynamo-service";
import { OperationBuilder } from "./operation-builder";
import type { IExpressionBuilder } from "./expression-builder";
import type { DynamoRecord, QueryPaginator } from "./types";
import type { DynamoScanOptions } from "../dynamo/dynamo-types";
import type { RequiredIndexConfig } from "./operators";

/**
 * Builder class for constructing DynamoDB scan operations.
 * Allows setting various parameters for a scan operation.
 */
export class ScanBuilder<T extends DynamoRecord, TIndexes extends string = string> extends OperationBuilder<
  T,
  DynamoScanOptions
> {
  private limitValue?: number;
  private indexNameValue?: TIndexes;
  private consistentReadValue = false;
  private lastEvaluatedKey?: Record<string, unknown>;

  constructor(
    expressionBuilder: IExpressionBuilder,
    private readonly indexConfig: RequiredIndexConfig<TIndexes>,
    private readonly onBuild: (operation: DynamoScanOptions) => Promise<DynamoQueryResponse>,
  ) {
    super(expressionBuilder);
  }

  /**
   * Sets the limit for the number of items to scan.
   *
   * @param value - The maximum number of items to return.
   * @returns The current instance of ScanBuilder for method chaining.
   *
   * Usage:
   * - To limit the number of items: `scanBuilder.limit(10);`
   */
  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  /**
   * Specifies the index to use for the scan operation.
   *
   * @param indexName - The name of the index to use.
   * @returns The current instance of ScanBuilder for method chaining.
   *
   * Usage:
   * - To use a specific index: `scanBuilder.useIndex("GSI1");`
   */
  useIndex(indexName: TIndexes) {
    if (this.consistentReadValue) {
      throw new Error("Cannot use an index when consistent read is enabled.");
    }

    if (!(indexName in this.indexConfig)) {
      throw new Error(`Index "${indexName}" is not configured for this table.`);
    }

    this.indexNameValue = indexName;
    return this;
  }

  /**
   * Sets the starting key for the scan operation.
   *
   * @param key - The key to start the scan from.
   * @returns The current instance of ScanBuilder for method chaining.
   *
   * Usage:
   * - To start the scan from a specific key: `scanBuilder.startKey({ pk: "USER#123" });`
   */
  startKey(key: Record<string, unknown>) {
    this.lastEvaluatedKey = key;
    return this;
  }

  /**
   * Enables consistent read for the query operation.
   * Can only be used when querying the primary index.
   *
   * @returns The current instance of QueryBuilder for method chaining.
   *
   * Usage:
   * - To enable consistent read: `queryBuilder.consistentRead();`
   */
  consistentRead() {
    if (this.indexNameValue) {
      throw new Error("Consistent read can only be used with the primary index.");
    }
    this.consistentReadValue = true;
    return this;
  }

  /**
   * Executes the scan operation with the configured parameters.
   *
   * @returns A promise that resolves to the scan results.
   *
   * Usage:
   * - To execute the scan: `const results = await scanBuilder.execute();`
   */
  async execute(): Promise<{ Items: T[] }> {
    const response = await this.onBuild(this.build());
    this.lastEvaluatedKey = response.LastEvaluatedKey;
    return {
      Items: response.Items as T[],
    };
  }

  /**
   * Configures pagination for the query operation.
   *
   * @returns An object with methods to manage pagination.
   *
   * Usage:
   * - To paginate results: `const paginator = queryBuilder.paginate();`
   */
  paginate(): QueryPaginator<T> {
    return {
      hasNextPage: () => !!this.lastEvaluatedKey,
      getPage: async () => {
        const response = await this.execute();
        return {
          items: response.Items,
          nextPageToken: this.lastEvaluatedKey,
        };
      },
    };
  }

  /**
   * Builds the scan operation into a DynamoScanOperation object.
   *
   * @returns A DynamoScanOperation object representing the scan operation.
   *
   * Usage:
   * - To build the operation: `const operation = scanBuilder.build();`
   */
  build(): DynamoScanOptions {
    const filter = this.buildConditionExpression();

    return {
      filter: filter.expression
        ? {
            expression: filter.expression,
            names: filter.attributes.names,
            values: filter.attributes.values,
          }
        : undefined,
      limit: this.limitValue,
      indexName: this.indexNameValue,
      exclusiveStartKey: this.lastEvaluatedKey,
      consistentRead: this.consistentReadValue,
    };
  }
}
