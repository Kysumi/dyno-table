import type { DynamoQueryResponse } from "../dynamo/dynamo-service";
import { OperationBuilder } from "./operation-builder";
import type { IExpressionBuilder } from "./expression-builder";
import type { DynamoScanOperation } from "../dynamo/dynamo-types";
import type { DynamoRecord } from "./types";

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

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  useIndex(indexName: string) {
    this.indexNameValue = indexName;
    return this;
  }

  startKey(key: Record<string, unknown>) {
    this.pageKeyValue = key;
    return this;
  }

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

  async execute() {
    return this.onBuild(this.build());
  }
}
