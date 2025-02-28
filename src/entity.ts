import type { Table } from ".";
import { and, beginsWith, eq, type Condition, type ExpressionParams } from "./conditions";
import { buildExpression, generateAttributeName, generateValueName, prepareExpressionParams } from "./expression";
import type { EntityConfig } from "./types";
import { QueryBuilder, type QueryOptions } from "./query-builder";

export class Entity<T extends Record<string, unknown>> {
  private table: Table;
  private config: EntityConfig<T>;

  constructor(table: Table, config: EntityConfig<T>) {
    this.table = table;
    this.config = config;
  }

  /**
   * Creates a key object for DynamoDB operations
   */
  private getKey(pkValue: string, skValue?: string): Record<string, unknown> {
    const key: Record<string, unknown> = {
      [this.table.partitionKey]: pkValue,
    };

    if (this.table.sortKey && skValue) {
      key[this.table.sortKey] = skValue;
    }

    return key;
  }

  /**
   * Adds metadata to an item before storing in DynamoDB
   */
  private addMetadata(item: T): T {
    const result = { ...item } as Record<string, unknown>;

    // Add entity type discriminator if configured
    if (this.config.discriminator) {
      result.__type = this.config.discriminator;
    }

    // Add timestamps if configured
    if (this.config.timestamps) {
      const now = new Date().toISOString();
      if (!result.createdAt) {
        result.createdAt = now;
      }
      result.updatedAt = now;
    }

    return result as T;
  }

  /**
   * Creates a type condition if a discriminator is configured
   */
  private getTypeCondition(): Condition | undefined {
    return this.config.discriminator ? eq("__type", this.config.discriminator) : undefined;
  }

  /**
   * Combines a user condition with the type condition if needed
   */
  private combineWithTypeCondition(userCondition?: Condition): Condition | undefined {
    const typeCondition = this.getTypeCondition();

    if (userCondition && typeCondition) {
      return and(userCondition, typeCondition);
    }

    return userCondition || typeCondition;
  }

  /**
   * Retrieves an item by its key
   */
  async get(pkValue: string, skValue?: string): Promise<T | null> {
    const key = this.getKey(pkValue, skValue);

    const item = await this.table.getItem(key);

    if (!item) return null;

    // Check if the item is of the correct type
    if (this.config.discriminator && item.__type !== this.config.discriminator) {
      return null;
    }

    return item as T;
  }

  /**
   * Creates a new item
   */
  async create(
    item: Omit<T, "createdAt" | "updatedAt">,
    options?: {
      pkValue?: string;
      skValue?: string;
      condition?: Condition;
    },
  ): Promise<T> {
    const pkValue = options?.pkValue;
    const skValue = options?.skValue;

    if (!pkValue) {
      throw new Error("pkValue is required");
    }

    const key = this.getKey(pkValue, skValue);

    const fullItem = {
      ...item,
      ...key,
    };

    const preparedItem = this.addMetadata(fullItem as T);

    // Prepare condition expression if provided
    const { expression: conditionExpression, names, values } = prepareExpressionParams(options?.condition);

    await this.table.putItem(preparedItem, conditionExpression, names, values);
    return preparedItem;
  }

  /**
   * Updates an existing item
   */
  async update(
    pkValue: string,
    skValue: string | undefined,
    updates: Partial<Omit<T, "createdAt">>,
    condition?: Condition,
  ): Promise<T> {
    const key = this.getKey(pkValue, skValue);

    let updateItem = updates;

    // Add timestamp if configured
    if (this.config.timestamps) {
      updateItem = {
        ...updates,
        updatedAt: new Date().toISOString(),
      };
    }

    // Build update expression
    const expressionParams: ExpressionParams = {
      expressionAttributeNames: {},
      expressionAttributeValues: {},
      valueCounter: { count: 0 },
    };

    const updateExpressions: string[] = [];

    // Process each field to update
    for (const [field, value] of Object.entries(updateItem)) {
      // Skip key fields
      if (field === this.table.partitionKey || field === this.table.sortKey) {
        continue;
      }

      const fieldName = generateAttributeName(expressionParams, field);
      const valueName = generateValueName(expressionParams, value);
      updateExpressions.push(`${fieldName} = ${valueName}`);
    }

    const updateExpression = `SET ${updateExpressions.join(", ")}`;

    // Combine with type condition if needed
    const combinedCondition = this.combineWithTypeCondition(condition);

    const {
      expression: conditionExpression,
      names: expressionAttributeNames,
      values: expressionAttributeValues,
    } = prepareExpressionParams(combinedCondition);

    const updatedItem = await this.table.updateItem(
      key,
      updateExpression,
      conditionExpression,
      expressionAttributeNames,
      expressionAttributeValues,
    );

    return updatedItem as T;
  }

  /**
   * Deletes an item
   */
  async delete(pkValue: string, skValue: string | undefined, condition?: Condition): Promise<void> {
    const key = this.getKey(pkValue, skValue);

    // Combine with type condition if needed
    const combinedCondition = this.combineWithTypeCondition(condition);

    const {
      expression: conditionExpression,
      names: expressionAttributeNames,
      values: expressionAttributeValues,
    } = prepareExpressionParams(combinedCondition);

    await this.table.deleteItem(key, conditionExpression, expressionAttributeNames, expressionAttributeValues);
  }

  /**
   * Creates or updates an item
   */
  async upsert(
    item: Omit<T, "createdAt" | "updatedAt">,
    options?: {
      pkValue?: string;
      skValue?: string;
      condition?: Condition;
    },
  ): Promise<T> {
    const pkValue = options?.pkValue;
    const skValue = options?.skValue;

    if (!pkValue) {
      throw new Error("pkValue is required");
    }

    try {
      const existingItem = await this.get(pkValue, skValue);

      if (existingItem) {
        return this.update(pkValue, skValue, item, options?.condition);
      }

      return this.create(item, {
        pkValue,
        skValue,
        condition: options?.condition,
      });
    } catch (error) {
      console.error("Error upserting item:", error);
      throw error;
    }
  }

  /**
   * Queries items by partition key with optional conditions
   */
  query(
    pkValue: string,
    options?: {
      sortKeyCondition?: Condition;
    },
  ): QueryBuilder<T>;
  query(
    pkValue: string,
    options?: {
      sortKeyCondition?: Condition;
      filter?: Condition;
      limit?: number;
      indexName?: string;
      consistentRead?: boolean;
      scanIndexForward?: boolean;
    },
  ): Promise<T[]>;
  async query(pkValue: string, options: QueryOptions = {}): Promise<T[] | QueryBuilder<T>> {
    if (typeof options === "undefined") {
      return new QueryBuilder<T>(this, pkValue);
    }

    const expressionParams: ExpressionParams = {
      expressionAttributeNames: {},
      expressionAttributeValues: {},
      valueCounter: { count: 0 },
    };

    // Apply partition key prefix if configured
    const pkPrefix = this.config.partitionKeyPrefix || "";
    const pkCondition = eq(this.table.partitionKey, `${pkPrefix}${pkValue}`);
    let keyConditionExpression = buildExpression(pkCondition, expressionParams);

    // Process sort key condition if provided
    if (options?.sortKeyCondition && this.table.sortKey) {
      // Check if we're using an index with a different sort key
      const isIndexSort =
        options.indexName &&
        this.table.gsis.some(
          (gsi) =>
            gsi.name === options.indexName &&
            gsi.keySchema.some((key) => key.type === "RANGE" && key.name !== this.table.sortKey),
        );

      // Apply sort key prefix if configured and not using an index
      let sortKeyCondition = options.sortKeyCondition;
      if (!isIndexSort && this.config.sortKeyPrefix && sortKeyCondition.attr === this.table.sortKey) {
        // Handle different condition types
        if (sortKeyCondition.type === "beginsWith") {
          sortKeyCondition = beginsWith(sortKeyCondition.attr, `${this.config.sortKeyPrefix}${sortKeyCondition.value}`);
        } else if (["eq", "lt", "lte", "gt", "gte"].includes(sortKeyCondition.type)) {
          sortKeyCondition = {
            ...sortKeyCondition,
            value: `${this.config.sortKeyPrefix}${sortKeyCondition.value}`,
          };
        }
      }

      const sortKeyExpr = buildExpression(sortKeyCondition, expressionParams);
      keyConditionExpression = `${keyConditionExpression} AND ${sortKeyExpr}`;
    }

    // Add type discriminator to filter if configured
    const filterWithType = this.combineWithTypeCondition(options?.filter);

    let filterExpression: string | undefined;
    if (filterWithType) {
      filterExpression = buildExpression(filterWithType, expressionParams);
    }

    const items = await this.table.queryItems(
      keyConditionExpression,
      filterExpression,
      expressionParams.expressionAttributeNames,
      expressionParams.expressionAttributeValues,
      options?.indexName,
      options?.limit,
      options?.consistentRead,
      options?.scanIndexForward,
    );

    return items as T[];
  }
}
