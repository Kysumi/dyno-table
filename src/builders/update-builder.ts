import type { Condition, ConditionOperator, PrimaryKeyWithoutExpression } from "../conditions";
import {
  eq,
  ne,
  lt,
  lte,
  gt,
  gte,
  between,
  beginsWith,
  contains,
  attributeExists,
  attributeNotExists,
  and,
  or,
  not,
} from "../conditions";
import type { Path, PathType } from "./types";
import type { TransactionBuilder } from "./transaction-builder";
import { buildExpression, generateAttributeName, generateValueName } from "../expression";
import { debugCommand, type DynamoCommandWithExpressions } from "../utils/debug-expression";

export interface UpdateOptions {
  condition?: Condition;
  returnValues?: "ALL_NEW" | "UPDATED_NEW" | "ALL_OLD" | "UPDATED_OLD" | "NONE";
}

export interface UpdateCommandParams extends DynamoCommandWithExpressions {
  tableName: string;
  key: PrimaryKeyWithoutExpression;
  updateExpression: string;
  conditionExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, unknown>;
  returnValues?: "ALL_NEW" | "UPDATED_NEW" | "ALL_OLD" | "UPDATED_OLD" | "NONE";
}

type UpdateExecutor<T extends Record<string, unknown>> = (params: UpdateCommandParams) => Promise<{ item?: T }>;

export type UpdateAction = {
  type: "SET" | "REMOVE" | "ADD" | "DELETE";
  path: string;
  value?: unknown;
};

// Type utility to get the element type of a set
type SetElementType<T> = T extends Set<infer U> ? U : T extends Array<infer U> ? U : never;

// Type utility to get the element type from a path that points to a set
type PathSetElementType<T, K extends Path<T>> = SetElementType<PathType<T, K>>;

export class UpdateBuilder<T extends Record<string, unknown>> {
  private updates: UpdateAction[] = [];
  private options: UpdateOptions = {
    returnValues: "ALL_NEW",
  };
  private executor: UpdateExecutor<T>;
  private tableName: string;
  private key: PrimaryKeyWithoutExpression;

  constructor(executor: UpdateExecutor<T>, tableName: string, key: PrimaryKeyWithoutExpression) {
    this.executor = executor;
    this.tableName = tableName;
    this.key = key;
  }

  /**
   * Assign all attributes in the object to the item
   */
  set(values: Partial<T>): UpdateBuilder<T>;
  /**
   * Set specific attribute to a value
   */
  set<K extends Path<T>>(path: K, value: PathType<T, K>): UpdateBuilder<T>;
  set<K extends Path<T>>(valuesOrPath: K | Partial<T>, value?: PathType<T, K>): UpdateBuilder<T> {
    if (typeof valuesOrPath === "object") {
      for (const [key, value] of Object.entries(valuesOrPath)) {
        this.updates.push({
          type: "SET",
          path: key,
          value,
        });
      }
    } else {
      this.updates.push({
        type: "SET",
        path: valuesOrPath,
        value,
      });
    }

    return this;
  }

  /**
   * Remove an attribute
   */
  remove<K extends Path<T>>(path: K): UpdateBuilder<T> {
    this.updates.push({
      type: "REMOVE",
      path,
    });
    return this;
  }

  /**
   * Add a value to a number attribute or add elements to a set
   */
  add<K extends Path<T>>(path: K, value: PathType<T, K>): UpdateBuilder<T> {
    this.updates.push({
      type: "ADD",
      path,
      value,
    });
    return this;
  }

  /**
   * Remove elements from a set
   */
  deleteElementsFromSet<K extends Path<T>>(
    path: K,
    value: PathSetElementType<T, K>[] | Set<PathSetElementType<T, K>>,
  ): UpdateBuilder<T> {
    let valuesToDelete: Set<PathSetElementType<T, K>>;

    if (Array.isArray(value)) {
      valuesToDelete = new Set(value);
    } else {
      valuesToDelete = value;
    }

    this.updates.push({
      type: "DELETE",
      path,
      value: valuesToDelete,
    });
    return this;
  }

  /**
   * Add a condition expression that must be satisfied for the update operation to succeed
   */
  condition(condition: Condition | ((op: ConditionOperator<T>) => Condition)): UpdateBuilder<T> {
    if (typeof condition === "function") {
      const conditionOperator: ConditionOperator<T> = {
        eq,
        ne,
        lt,
        lte,
        gt,
        gte,
        between,
        beginsWith,
        contains,
        attributeExists,
        attributeNotExists,
        and,
        or,
        not,
      };
      this.options.condition = condition(conditionOperator);
    } else {
      this.options.condition = condition;
    }
    return this;
  }

  /**
   * Set the return values option for the update operation
   */
  returnValues(returnValues: "ALL_NEW" | "UPDATED_NEW" | "ALL_OLD" | "UPDATED_OLD" | "NONE"): UpdateBuilder<T> {
    this.options.returnValues = returnValues;
    return this;
  }

  /**
   * Generate the DynamoDB command parameters
   */
  toDynamoCommand(): UpdateCommandParams {
    if (this.updates.length === 0) {
      throw new Error("No update actions specified");
    }

    const expressionParams: {
      expressionAttributeNames: Record<string, string>;
      expressionAttributeValues: Record<string, unknown>;
      valueCounter: { count: number };
    } = {
      expressionAttributeNames: {},
      expressionAttributeValues: {},
      valueCounter: { count: 0 },
    };

    // Build the update expression
    let updateExpression = "";

    // Group updates by type
    const setUpdates: UpdateAction[] = [];
    const removeUpdates: UpdateAction[] = [];
    const addUpdates: UpdateAction[] = [];
    const deleteUpdates: UpdateAction[] = [];

    for (const update of this.updates) {
      switch (update.type) {
        case "SET":
          setUpdates.push(update);
          break;
        case "REMOVE":
          removeUpdates.push(update);
          break;
        case "ADD":
          addUpdates.push(update);
          break;
        case "DELETE":
          deleteUpdates.push(update);
          break;
      }
    }

    // Build SET clause
    if (setUpdates.length > 0) {
      updateExpression += "SET ";
      updateExpression += setUpdates
        .map((update) => {
          const attrName = generateAttributeName(expressionParams, update.path);
          const valueName = generateValueName(expressionParams, update.value);
          expressionParams.expressionAttributeValues[valueName] = update.value;
          return `${attrName} = ${valueName}`;
        })
        .join(", ");
    }

    // Build REMOVE clause
    if (removeUpdates.length > 0) {
      if (updateExpression) {
        updateExpression += " ";
      }
      updateExpression += "REMOVE ";
      updateExpression += removeUpdates
        .map((update) => {
          return generateAttributeName(expressionParams, update.path);
        })
        .join(", ");
    }

    // Build ADD clause
    if (addUpdates.length > 0) {
      if (updateExpression) {
        updateExpression += " ";
      }
      updateExpression += "ADD ";
      updateExpression += addUpdates
        .map((update) => {
          const attrName = generateAttributeName(expressionParams, update.path);
          const valueName = generateValueName(expressionParams, update.value);

          return `${attrName} ${valueName}`;
        })
        .join(", ");
    }

    // Build DELETE clause
    if (deleteUpdates.length > 0) {
      if (updateExpression) {
        updateExpression += " ";
      }

      updateExpression += "DELETE ";
      updateExpression += deleteUpdates
        .map((update) => {
          const attrName = generateAttributeName(expressionParams, update.path);
          const valueName = generateValueName(expressionParams, update.value);

          return `${attrName} ${valueName}`;
        })
        .join(", ");
    }

    // Build condition expression if provided
    let conditionExpression: string | undefined;
    if (this.options.condition) {
      conditionExpression = buildExpression(this.options.condition, expressionParams);
    }

    const { expressionAttributeNames, expressionAttributeValues } = expressionParams;

    return {
      tableName: this.tableName,
      key: this.key,
      updateExpression,
      conditionExpression,
      expressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      expressionAttributeValues:
        Object.keys(expressionAttributeValues).length > 0 ? expressionAttributeValues : undefined,
      returnValues: this.options.returnValues,
    };
  }

  /**
   * Add this operation to a transaction
   */
  withTransaction(transaction: TransactionBuilder) {
    const command = this.toDynamoCommand();
    transaction.updateWithCommand(command);
  }

  /**
   * Get a human-readable representation of the update command
   * with all expression placeholders replaced by their actual values.
   * This is useful for debugging complex update operations.
   *
   * @returns A readable representation of the update command
   */
  debug(): Record<string, unknown> {
    const command = this.toDynamoCommand();
    return debugCommand(command);
  }

  /**
   * Execute the update operation
   */
  async execute(): Promise<{ item?: T }> {
    const params = this.toDynamoCommand();
    return this.executor(params);
  }
}
