import type { DynamoQueryResponse } from "../dynamo/dynamo-service";
import { OperationBuilder } from "./operation-builder";
import type { IExpressionBuilder } from "./expression-builder";
import type { DynamoScanOperation } from "../dynamo/dynamo-types";
import type { DynamoRecord } from "./types";

/**
 * Builder class for constructing DynamoDB scan operations.
 * Allows setting various parameters for a scan operation.
 */
export class ScanBuilder<T extends DynamoRecord> extends OperationBuilder<T, DynamoScanOperation> {
  private limitValue?: number;
  private indexNameValue?: string;
  private pageKeyValue?: Record<string, unknown>;

  constructor(
    expressionBuilder: IExpressionBuilder,
    private readonly onBuild: (operation: DynamoScanOperation) => Promise<DynamoQueryResponse>,
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
  useIndex(indexName: string) {
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
    this.pageKeyValue = key;
    return this;
  }

  /**
   * Builds the scan operation into a DynamoScanOperation object.
   *
   * @returns A DynamoScanOperation object representing the scan operation.
   *
   * Usage:
   * - To build the operation: `const operation = scanBuilder.build();`
   */
  build() {
    const filter = this.buildConditionExpression();

    return {
      type: "scan" as const,
      filter: filter.expression
        ? {
            expression: filter.expression,
            names: filter.attributes.names,
            values: filter.attributes.values,
          }
        : undefined,
      limit: this.limitValue,
      pageKey: this.pageKeyValue,
      indexName: this.indexNameValue,
    };
  }

  /**
   * Executes the scan operation.
   *
   * @returns A promise that resolves to the scan results.
   *
   * Usage:
   * - To execute the operation: `await scanBuilder.execute();`
   */
  async execute() {
    return this.onBuild(this.build());
  }
}
