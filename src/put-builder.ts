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

export interface PutOptions {
  condition?: Condition;
  returnValues?: "ALL_OLD";
}

type PutExecutor<T extends Record<string, unknown>> = (item: T, options: PutOptions) => Promise<T>;

export class PutBuilder<T extends Record<string, unknown>> {
  private item: T;
  private options: PutOptions = {};
  private executor: PutExecutor<T>;

  constructor(executor: PutExecutor<T>, item: T) {
    this.executor = executor;
    this.item = item;
  }

  /**
   * Add a condition expression that must be satisfied for the put operation to succeed
   */
  condition(condition: Condition | ((op: ConditionOperator<T>) => Condition)): PutBuilder<T> {
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
   * Set the return values option for the put operation
   */
  returnValues(returnValues: "ALL_OLD"): PutBuilder<T> {
    this.options.returnValues = returnValues;
    return this;
  }

  /**
   * Execute the put operation
   */
  async execute(): Promise<T> {
    return this.executor(this.item, this.options);
  }
}
