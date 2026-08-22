import type { SearchVectorsCommandInput } from "@aws-sdk/lib-dynamodb";
import { and, type Condition, eq } from "../conditions.js";
import type { DynamoItem, TableConfig, VectorIndexConfig, VectorIndexFor, VectorIndexNames } from "../types.js";
import { debugCommand } from "../utils/debug-expression.js";
import { ValidationErrors } from "../utils/error-factory.js";
import { projectedVectorAttributes, validateVectorValue } from "../vector.js";
import type { BuilderContext } from "./builder-types.js";
import type { Path } from "./types.js";

export interface VectorCapacity {
  VectorSearchRequestBytes?: number;
  VectorWriteRequestBytes?: number;
}

export interface VectorSearchMatch<T> {
  item: T;
  score: number;
}

export interface VectorSearchResult<T> {
  matches: VectorSearchMatch<T>[];
  consumedCapacity?: VectorCapacity;
}

type ConfiguredVectorIndex<TConfig extends TableConfig, TIndexName extends VectorIndexNames<TConfig>> =
  VectorIndexFor<TConfig, TIndexName> extends VectorIndexConfig
    ? VectorIndexFor<TConfig, TIndexName>
    : VectorIndexConfig;

type VectorPartitionInput<TIndex extends VectorIndexConfig> = TIndex extends { readonly partitionKey: string }
  ? { partition: unknown }
  : VectorIndexConfig extends TIndex
    ? { partition?: unknown }
    : { partition?: never };

export type VectorSearchInput<TConfig extends TableConfig, TIndexName extends VectorIndexNames<TConfig>> = {
  vector: readonly number[];
  topK: number;
} & VectorPartitionInput<ConfiguredVectorIndex<TConfig, TIndexName>>;

type ConfiguredInlineFilter<TIndex extends VectorIndexConfig> = TIndex extends {
  readonly inlineFilters: readonly (infer TAttribute extends string)[];
}
  ? TAttribute
  : VectorIndexConfig extends TIndex
    ? string
    : never;

export interface VectorConditionOperator<T, TAllowedAttribute extends string> {
  eq<K extends Extract<TAllowedAttribute, keyof T>>(attribute: K, value: T[K]): Condition;
  and(...conditions: Condition[]): Condition;
}

export interface VectorSearchOptions {
  vector: number[];
  topK: number;
  partition?: unknown;
  filter?: Condition;
  projection?: string[];
  returnConsumedCapacity?: "NONE" | "TOTAL" | "INDEXES";
}

export type VectorSearchExecutor<T> = (options: VectorSearchOptions) => Promise<VectorSearchResult<T>>;
export type VectorSearchCommandBuilder = (options: VectorSearchOptions) => SearchVectorsCommandInput;

export class VectorSearchBuilder<
  T extends DynamoItem,
  TConfig extends TableConfig = TableConfig,
  TIndexName extends VectorIndexNames<TConfig> = VectorIndexNames<TConfig>,
> {
  protected options: VectorSearchOptions;
  private readonly selectedFields = new Set<string>();
  private includeIndexAttributes = false;
  private readonly availableAttributes: Set<string> | undefined;

  constructor(
    private readonly executor: VectorSearchExecutor<T>,
    private readonly commandBuilder: VectorSearchCommandBuilder,
    input: VectorSearchInput<TConfig, TIndexName>,
    readonly indexName: TIndexName,
    readonly index: ConfiguredVectorIndex<TConfig, TIndexName>,
    private readonly tablePartitionKey: string,
    private readonly tableSortKey?: string,
    private readonly indexAttributeNames: readonly string[] = [],
    protected readonly context: BuilderContext = {},
  ) {
    validateVectorValue(input.vector, String(indexName), index);
    if (!Number.isInteger(input.topK) || input.topK < 1 || input.topK > 100) {
      throw ValidationErrors.vectorTopKInvalid(input.topK);
    }
    if (index.partitionKey && (!("partition" in input) || input.partition === undefined)) {
      throw ValidationErrors.vectorPartitionInvalid(String(indexName), "required");
    }
    if (!index.partitionKey && "partition" in input) {
      throw ValidationErrors.vectorPartitionInvalid(String(indexName), "absent");
    }

    this.options = {
      vector: [...input.vector],
      topK: input.topK,
      ...(index.partitionKey ? { partition: input.partition } : {}),
    };
    this.availableAttributes = projectedVectorAttributes(index, tablePartitionKey, tableSortKey);
  }

  filter(
    callback: (
      operator: VectorConditionOperator<T, ConfiguredInlineFilter<ConfiguredVectorIndex<TConfig, TIndexName>>>,
    ) => Condition,
  ): this {
    const condition = callback({
      eq: (attribute, value) => eq(String(attribute), value),
      and,
    });
    this.validateFilter(condition);
    this.options.filter = this.options.filter ? and(this.options.filter, condition) : condition;
    return this;
  }

  select<K extends Path<T>>(fields: K | readonly K[]): this {
    for (const field of typeof fields === "string" ? [fields] : fields) {
      const topLevel = String(field).split(/[.[]/, 1)[0] as string;
      if (this.availableAttributes && !this.availableAttributes.has(topLevel)) {
        throw ValidationErrors.vectorProjectionInvalid(String(this.indexName), String(field));
      }
      this.selectedFields.add(String(field));
    }
    this.options.projection = [...this.selectedFields];
    return this;
  }

  includeIndexes(): this {
    this.includeIndexAttributes = true;
    if (this.selectedFields.size > 0) {
      for (const attribute of this.indexAttributeNames) {
        if (!this.availableAttributes || this.availableAttributes.has(attribute)) this.selectedFields.add(attribute);
      }
      this.options.projection = [...this.selectedFields];
    }
    return this;
  }

  returnConsumedCapacity(value: "NONE" | "TOTAL" | "INDEXES"): this {
    this.options.returnConsumedCapacity = value;
    return this;
  }

  clone(): VectorSearchBuilder<T, TConfig, TIndexName> {
    const clone = new VectorSearchBuilder<T, TConfig, TIndexName>(
      this.executor,
      this.commandBuilder,
      {
        vector: [...this.options.vector],
        topK: this.options.topK,
        ...(this.index.partitionKey ? { partition: this.options.partition } : {}),
      } as unknown as VectorSearchInput<TConfig, TIndexName>,
      this.indexName,
      this.index,
      this.tablePartitionKey,
      this.tableSortKey,
      this.indexAttributeNames,
      this.context,
    );
    clone.options = {
      ...this.options,
      vector: [...this.options.vector],
      filter: deepCloneCondition(this.options.filter),
      projection: this.options.projection ? [...this.options.projection] : undefined,
    };
    for (const field of this.selectedFields) clone.selectedFields.add(field);
    clone.includeIndexAttributes = this.includeIndexAttributes;
    return clone;
  }

  async findOne(): Promise<VectorSearchMatch<T> | undefined> {
    const clone = this.clone();
    clone.options.topK = 1;
    return (await clone.execute()).matches[0];
  }

  debug() {
    return debugCommand(this.commandBuilder(this.options));
  }

  async execute(): Promise<VectorSearchResult<T>> {
    await this.context.beforeExecute?.();
    const result = await this.executor(this.options);
    const vectorSelected = [...this.selectedFields].some(
      (field) => field === this.index.vectorAttribute || field.startsWith(`${this.index.vectorAttribute}.`),
    );

    return {
      ...result,
      matches: result.matches.map(({ item, score }) => ({ item: this.cleanItem(item, vectorSelected), score })),
    };
  }

  private validateFilter(condition: Condition): void {
    if (condition.type === "and") {
      if (!condition.conditions?.length) {
        throw ValidationErrors.vectorConditionInvalid(String(this.indexName), "AND requires at least one condition");
      }
      for (const child of condition.conditions) this.validateFilter(child);
      return;
    }
    if (
      condition.type !== "eq" ||
      !condition.attr ||
      condition.attr.includes(".") ||
      !(this.index.inlineFilters ?? []).includes(condition.attr)
    ) {
      throw ValidationErrors.vectorConditionInvalid(
        String(this.indexName),
        "Only equality on configured top-level inline filters is supported",
        condition.attr,
      );
    }
  }

  private cleanItem(item: T, vectorSelected: boolean): T {
    const remove = new Set<string>();
    if (!vectorSelected) remove.add(this.index.vectorAttribute);
    if (!this.includeIndexAttributes) {
      for (const attribute of this.indexAttributeNames) remove.add(attribute);
    }
    if (![...remove].some((attribute) => attribute in item)) return item;
    const cleaned = { ...item };
    for (const attribute of remove) delete cleaned[attribute];
    return cleaned;
  }
}

function deepCloneCondition(condition: Condition | undefined): Condition | undefined {
  if (!condition) return undefined;
  return {
    ...condition,
    conditions: condition.conditions?.map((child) => deepCloneCondition(child) as Condition),
    condition: deepCloneCondition(condition.condition),
  };
}
