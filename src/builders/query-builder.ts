import type { DynamoQueryResponse } from "../dynamo/dynamo-service";
import type { DynamoQueryOptions } from "../dynamo/dynamo-types";
import type { IExpressionBuilder } from "./expression-builder";
import { OperationBuilder } from "./operation-builder";
import type { PrimaryKey, TableIndexConfig } from "./operators";
import type { DynamoRecord, QueryPaginator } from "./types";

/**
 * Builder class for constructing DynamoDB query operations.
 * Allows setting various parameters for a query operation.
 */
export class QueryBuilder<T extends DynamoRecord, TIndexes extends string> extends OperationBuilder<
  T,
  DynamoQueryOptions
> {
  private limitValue?: number;
  private indexNameValue?: TIndexes;
  private consistentReadValue = false;
  private lastEvaluatedKey?: Record<string, unknown>;
  private sortDirectionValue: "asc" | "desc" = "asc";

  constructor(
    private readonly key: PrimaryKey,
    private readonly indexConfig: TableIndexConfig,
    expressionBuilder: IExpressionBuilder,
    private readonly onBuild: (operation: DynamoQueryOptions) => Promise<DynamoQueryResponse>,
  ) {
    super(expressionBuilder);
  }

  /**
   * Sets the limit for the number of items to query.
   *
   * @param value - The maximum number of items to return.
   * @returns The current instance of QueryBuilder for method chaining.
   *
   * Usage:
   * - To limit the number of items: `queryBuilder.limit(10);`
   */
  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  /**
   * Specifies the index to use for the query operation.
   *
   * DynamoDB does not support consistent reads on global secondary indexes.
   *
   * @param indexName - The name of the index to use.
   * @returns The current instance of QueryBuilder for method chaining.
   *
   * Usage:
   * - To use a specific index: `queryBuilder.useIndex("GSI1");`
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
   * Configures pagination for the query operation.
   *
   * @param pageSize - The number of items per page.
   * @returns An object with methods to manage pagination.
   *
   * Usage:
   * - To paginate results: `const paginator = queryBuilder.paginate(10);`
   */
  paginate(pageSize: number): QueryPaginator<T> {
    this.limitValue = pageSize;

    return {
      hasNextPage: () => !!this.lastEvaluatedKey,
      getPage: async () => {
        const response = await this.execute();
        return {
          items: response,
          nextPageToken: this.lastEvaluatedKey,
        };
      },
    };
  }

  /**
   * Configures the sort direction for the query operation.
   *
   * By default the sort direction is ascending.
   *
   * @param direction - The direction to sort the results in.
   * @returns The current instance of QueryBuilder for method chaining.
   *
   * Usage:
   * - To sort results in ascending order: `queryBuilder.sort("asc");`
   */
  sort(direction: "asc" | "desc") {
    this.sortDirectionValue = direction;
    return this;
  }

  /**
   * Executes the query operation with the configured parameters.
   *
   * @returns A promise that resolves to an array of items matching the query criteria.
   *
   * Usage:
   * - To execute the query: `const results = await queryBuilder.execute();`
   */
  async execute(): Promise<T[]> {
    const response = await this.onBuild(this.build());

    this.lastEvaluatedKey = response.LastEvaluatedKey;
    const items = response.Items ?? [];
    return items as T[];
  }

  /**
   * Builds the query operation into a DynamoQueryOperation object.
   *
   * @returns A DynamoQueryOperation object representing the query operation.
   *
   * Usage:
   * - To build the operation: `const operation = queryBuilder.build();`
   */
  build(): DynamoQueryOptions {
    const filter = this.buildConditionExpression();
    const keyCondition = this.expressionBuilder.buildKeyCondition(this.key, this.indexConfig);

    return {
      keyCondition: {
        expression: keyCondition.expression,
        names: keyCondition.attributes.names,
        values: keyCondition.attributes.values,
      },
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
      sortDirection: this.sortDirectionValue,
    };
  }
}
