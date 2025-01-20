import type { DynamoQueryResponse } from "../dynamo/dynamo-service";
import type { DynamoQueryOperation } from "../dynamo/dynamo-types";
import type { IExpressionBuilder } from "./expression-builder";
import { OperationBuilder } from "./operation-builder";
import type { PrimaryKey, TableIndexConfig } from "./operators";
import type { DynamoRecord } from "./types";

/**
 * Builder class for constructing DynamoDB query operations.
 * Allows setting various parameters for a query operation.
 */
export class QueryBuilder<T extends DynamoRecord> extends OperationBuilder<T, DynamoQueryOperation> {
  private limitValue?: number;
  private indexNameValue?: string;

  constructor(
    private readonly key: PrimaryKey,
    private readonly indexConfig: TableIndexConfig,
    expressionBuilder: IExpressionBuilder,
    private readonly onBuild: (operation: DynamoQueryOperation) => Promise<DynamoQueryResponse>,
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
   * @param indexName - The name of the index to use.
   * @returns The current instance of QueryBuilder for method chaining.
   *
   * Usage:
   * - To use a specific index: `queryBuilder.useIndex("GSI1");`
   */
  useIndex(indexName: string) {
    this.indexNameValue = indexName;
    return this;
  }

  /**
   * Builds the query operation into a DynamoQueryOperation object.
   *
   * @returns A DynamoQueryOperation object representing the query operation.
   *
   * Usage:
   * - To build the operation: `const operation = queryBuilder.build();`
   */
  build(): DynamoQueryOperation {
    const filter = this.buildConditionExpression();
    const keyCondition = this.expressionBuilder.buildKeyCondition(this.key, this.indexConfig);

    return {
      type: "query",
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
    };
  }

  /**
   * Executes the query operation.
   *
   * @returns A promise that resolves to the query results.
   *
   * Usage:
   * - To execute the operation: `await queryBuilder.execute();`
   */
  async execute() {
    return this.onBuild(this.build());
  }
}
