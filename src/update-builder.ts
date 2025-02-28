import type { Condition, ConditionOperator } from "./conditions";
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
} from "./conditions";
import type { Path, PathType } from "./builders/types";

export interface UpdateOptions {
  condition?: Condition;
  returnValues?: "ALL_NEW" | "UPDATED_NEW" | "ALL_OLD" | "UPDATED_OLD" | "NONE";
}

type UpdateExecutor<T extends Record<string, unknown>> = (
  updates: UpdateAction[],
  options: UpdateOptions,
) => Promise<{ item?: T }>;

export type UpdateAction = {
  type: "SET" | "REMOVE" | "ADD" | "DELETE";
  path: string;
  value?: unknown;
};

export class UpdateBuilder<T extends Record<string, unknown>> {
  private updates: UpdateAction[] = [];
  private options: UpdateOptions = {};
  private executor: UpdateExecutor<T>;

  constructor(executor: UpdateExecutor<T>) {
    this.executor = executor;
  }

  /**
   * Set an attribute to a value
   */
  set<K extends Path<T>>(path: K, value: PathType<T, K>): UpdateBuilder<T> {
    this.updates.push({
      type: "SET",
      path,
      value,
    });
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
  delete<K extends Path<T>>(path: K, value: PathType<T, K>): UpdateBuilder<T> {
    this.updates.push({
      type: "DELETE",
      path,
      value,
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
   * Execute the update operation
   */
  async execute(): Promise<{ item?: T }> {
    return this.executor(this.updates, this.options);
  }
}
