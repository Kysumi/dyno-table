import { type ConditionExpression, type TConstraintBuilder, ConstraintBuilder } from "./constraint-builder";
import type { Table } from "../table";
import type { DynamoRecord } from "./types";
import type { DynamoQueryOptions } from "../dynamo/dynamo-types";
import type { PrimaryKey } from "./operators";

export class NewQueryBuilder<T extends DynamoRecord, TIndexes extends string> {
  // private keyCondition: ConditionExpression | null = null;
  private filterCondition: ConditionExpression | null = null;

  private expressionAttributeNames: Record<string, string> = {};
  private expressionAttributeValues: Record<string, unknown> = {};

  private nextPlaceholder = 0;

  private indexName: TIndexes;
  private consistentRead = false;
  private limit?: number;
  private exclusiveStartKey?: Record<string, unknown>;
  private sortDirection: "asc" | "desc" = "asc";

  constructor(
    private table: Table<TIndexes>,
    indexName: TIndexes,
    private readonly keyCondition: ConditionExpression,
  ) {
    this.indexName = indexName;
  }

  private generateNamePlaceholder(): string {
    return `#${this.nextPlaceholder++}`;
  }

  private generateValuePlaceholder(): string {
    return `:${this.nextPlaceholder++}`;
  }

  /**
   * Adds a name to the query operation and returns the placeholder/alias
   *
   * @param name - The name to add.
   * @returns The placeholder/alias for the name.
   *
   * Usage:
   * - To add a name: `queryBuilder.addName("name");`
   */
  private addName(name: string): string {
    const placeholder = this.generateNamePlaceholder();
    this.expressionAttributeNames[placeholder] = name;
    return placeholder;
  }

  /**
   * Adds a value to the query operation and returns the placeholder/alias
   *
   * @param value - The value to add.
   * @returns The placeholder/alias for the value.
   *
   * Usage:
   * - To add a value: `queryBuilder.addValue(123);`
   */
  private addValue(value: unknown): string {
    const placeholder = this.generateValuePlaceholder();
    this.expressionAttributeValues[placeholder] = value;
    return placeholder;
  }

  /**
   * Adds an AND filter condition to the query operation.
   *
   * The constraints applied to the provided builder will be wrapped in parentheses.
   *
   * @param constraints - The constraints to add.
   * @returns The current instance of QueryBuilder for method chaining.
   *
   * Usage:
   * - To add an AND filter condition: `queryBuilder.and(builder => builder.field("name").equals("John"));`
   *
   * For example.
   * ```typescript
   * queryBuilder.and(builder => builder.field("name").equals("John").or(builder => builder.field("age").greaterThan(30)));
   * ```
   *
   * Will be transformed into:
   * ```typescript
   * AND ((name = :name1) OR (age > :age1))
   * ```
   */
  and(constraints: TConstraintBuilder): this;
  and(field: string, operator: string, value: unknown): this;
  and(fieldOrBuilder: string | TConstraintBuilder, arg2?: string, arg3?: unknown): this {
    if (typeof fieldOrBuilder === "function") {
      return this.addCompositeFilterCondition(fieldOrBuilder, "AND");
    }

    if (typeof fieldOrBuilder === "string") {
      return this.addSimpleFilterCondition(fieldOrBuilder, arg2 as string, arg3 as string, "AND");
    }

    throw new Error("Invalid arguments for 'and' method.");
  }

  or(constraints: TConstraintBuilder): this;
  or(field: string, operator: string, value: unknown): this;
  or(fieldOrBuilder: string | TConstraintBuilder, arg2?: string, arg3?: unknown): this {
    if (typeof fieldOrBuilder === "function") {
      return this.addCompositeFilterCondition(fieldOrBuilder, "OR");
    }

    if (typeof fieldOrBuilder === "string") {
      return this.addSimpleFilterCondition(fieldOrBuilder, arg2 as string, arg3 as string, "OR");
    }

    throw new Error("Invalid arguments for 'or' method.");
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
  useIndex(indexName: TIndexes): this {
    if (this.consistentRead) {
      throw new Error("Cannot use an index when consistent read is enabled.");
    }

    if (!(indexName in this.table.getIndexConfig(indexName))) {
      throw new Error(`Index "${indexName}" is not configured for this table.`);
    }

    this.indexName = indexName;
    return this;
  }

  /**
   * Enables consistent read for the query operation.
   * Can only be used when querying the primary index.
   *
   * @returns The current instance of QueryBuilder for method chaining.
   *
   * Usage:
   * - To enable consistent read: `queryBuilder.useConsistentRead();`
   */
  useConsistentRead(): this {
    if (this.indexName) {
      throw new Error("Consistent read can only be used with the primary index.");
    }

    this.consistentRead = true;

    return this;
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
  sort(direction: "asc" | "desc"): this {
    this.sortDirection = direction;
    return this;
  }

  /**
   * Sets the starting key for the query operation.
   *
   * @param key - The key to start the query from.
   * @returns The current instance of QueryBuilder for method chaining.
   *
   * Usage:
   * - To start the query from a specific key: `queryBuilder.startKey({ pk: "USER#123" });`
   */
  startKey(key: Record<string, unknown>) {
    this.exclusiveStartKey = key;
    return this;
  }

  private addSimpleFilterCondition(field: string, operator: string, value: unknown, conjunction: "AND" | "OR"): this {
    const namePlaceholder = this.addName(field);
    const valuePlaceholder = this.addValue(value);
    const newCondition = `${namePlaceholder} ${operator} ${valuePlaceholder}`;

    if (this.filterCondition) {
      this.filterCondition = {
        expression: `(${this.filterCondition.expression}) ${conjunction} (${newCondition})`,
        names: { ...this.filterCondition.names, ...this.expressionAttributeNames },
        values: { ...this.filterCondition.values, ...this.expressionAttributeValues },
      };
    } else {
      this.filterCondition = {
        expression: newCondition,
        names: { ...this.expressionAttributeNames },
        values: { ...this.expressionAttributeValues },
      };
    }
    return this;
  }

  /**
   * Adds a composite filter condition to the query operation.
   *
   * @param constraints - The constraints to add.
   * @param conjunction - The conjunction to use.
   *
   * @returns The current instance of QueryBuilder for method chaining.
   *
   * Usage:
   * - To add a composite filter condition: `queryBuilder.and(builder => builder.field("name").equals("John"));`
   */
  private addCompositeFilterCondition(constraints: TConstraintBuilder, conjunction: "AND" | "OR"): this {
    const builder = new ConstraintBuilder(conjunction);
    constraints(builder);
    const condition = builder.getExpression();

    if (condition) {
      if (this.filterCondition) {
        this.filterCondition = {
          expression: `(${this.filterCondition.expression}) ${conjunction} (${condition.expression})`,
          names: { ...this.filterCondition.names, ...condition.names, ...this.expressionAttributeNames },
          values: { ...this.filterCondition.values, ...condition.values, ...this.expressionAttributeValues },
        };
      } else {
        this.filterCondition = condition;
      }
    }

    return this;
  }

  build(): DynamoQueryOptions {
    const params: DynamoQueryOptions = {};

    if (this.keyCondition) {
      params.keyCondition = this.keyCondition;
    } else {
      throw new Error("Key condition is required");
    }

    if (this.filterCondition) {
      params.filter = this.filterCondition;
    }

    params.limit = this.limit;
    params.exclusiveStartKey = this.exclusiveStartKey;
    params.sortDirection = this.sortDirection;
    params.consistentRead = this.consistentRead;
    params.indexName = this.indexName;

    return params;
  }

  async execute(): Promise<T[]> {
    const params = this.build();
    const data = await this.table.getService().query(params);

    if (data.Items) {
      return data.Items as T[];
    }

    return [];
  }
}
