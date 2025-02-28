import type { Path, PathType } from "./types";
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
  type Condition,
  type ConditionOperator,
} from "../conditions";
import { Paginator } from "./paginator";

export interface QueryOptions {
  sortKeyCondition?: Condition;
  filter?: Condition;
  limit?: number;
  indexName?: string;
  consistentRead?: boolean;
  scanIndexForward?: boolean;
  projection?: string[];
  paginationSize?: number;
  lastEvaluatedKey?: Record<string, unknown>;
}

type QueryExecutor<T extends Record<string, unknown>> = (
  keyCondition: Condition,
  options: QueryOptions,
) => Promise<{ items: T[]; lastEvaluatedKey?: Record<string, unknown> }>;

export class QueryBuilder<T extends Record<string, unknown>> {
  private keyCondition: Condition;
  private options: QueryOptions = {};
  private selectedFields: Set<string> = new Set();

  private executor: QueryExecutor<T>;

  constructor(executor: QueryExecutor<T>, keyCondition: Condition) {
    this.executor = executor;
    this.keyCondition = keyCondition;
  }

  limit(limit: number): QueryBuilder<T> {
    this.options.limit = limit;
    return this;
  }

  /**
   * Get the current limit set on the query
   * @returns The current limit or undefined if no limit is set
   */
  getLimit(): number | undefined {
    return this.options.limit;
  }

  useIndex(indexName: string): QueryBuilder<T> {
    this.options.indexName = indexName;
    return this;
  }

  consistentRead(consistentRead = true): QueryBuilder<T> {
    this.options.consistentRead = consistentRead;
    return this;
  }

  filter(condition: Condition | ((op: ConditionOperator<T>) => Condition)): QueryBuilder<T> {
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
      this.options.filter = condition(conditionOperator);
    } else {
      this.options.filter = condition;
    }
    return this;
  }

  select(fields: string | string[]): QueryBuilder<T> {
    if (typeof fields === "string") {
      this.selectedFields.add(fields);
    } else if (Array.isArray(fields)) {
      for (const field of fields) {
        this.selectedFields.add(field);
      }
    }

    this.options.projection = Array.from(this.selectedFields);
    return this;
  }

  sortAscending(): QueryBuilder<T> {
    this.options.scanIndexForward = true;
    return this;
  }

  sortDescending(): QueryBuilder<T> {
    this.options.scanIndexForward = false;
    return this;
  }

  /**
   * Creates a paginator that will handle pagination for you
   * @param pageSize The number of items to return per page
   * @returns A Paginator instance
   */
  paginate(pageSize: number): Paginator<T> {
    return new Paginator<T>(this, pageSize);
  }

  startFrom(lastEvaluatedKey: Record<string, unknown>): QueryBuilder<T> {
    this.options.lastEvaluatedKey = lastEvaluatedKey;
    return this;
  }

  /**
   * Creates a clone of this QueryBuilder
   * @returns A new QueryBuilder with the same options
   */
  clone(): QueryBuilder<T> {
    const clone = new QueryBuilder<T>(this.executor, this.keyCondition);
    clone.options = { ...this.options };
    clone.selectedFields = new Set(this.selectedFields);
    return clone;
  }

  async execute(): Promise<{ items: T[]; lastEvaluatedKey?: Record<string, unknown> }> {
    return this.executor(this.keyCondition, this.options);
  }
}
