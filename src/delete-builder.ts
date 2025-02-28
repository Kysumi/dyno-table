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

export interface DeleteOptions {
  condition?: Condition;
  returnValues?: "ALL_OLD";
}

type DeleteExecutor = (options: DeleteOptions) => Promise<{ item?: Record<string, unknown> }>;

export class DeleteBuilder {
  private options: DeleteOptions = {
    returnValues: "ALL_OLD",
  };
  private executor: DeleteExecutor;

  constructor(executor: DeleteExecutor) {
    this.executor = executor;
  }

  /**
   * Add a condition expression that must be satisfied for the delete operation to succeed
   */
  condition<T extends Record<string, unknown>>(
    condition: Condition | ((op: ConditionOperator<T>) => Condition),
  ): DeleteBuilder {
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
   * Execute the delete operation
   */
  async execute(): Promise<{ item?: Record<string, unknown> }> {
    return this.executor(this.options);
  }
}
