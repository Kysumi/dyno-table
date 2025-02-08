import type { ConditionExpression } from "./conditional-constraint-builder";
import type { FilterOperator, PrimaryKey, SKCondition } from "./operators";
import type { Table } from "../table";

/**
 * Unique builder for key conditions.
 *
 * @example
 * ```ts
 * const builder = new KeyConditionBuilder(table);
 * builder.partitionKey("pkValue");
 * builder.sortKey("=", "skValue");
 * builder.build();
 *
 * // With global secondary index
 * builder.useIndex("GSI1");
 * ```
 */
export class KeyConditionBuilder<TIndexes extends string> {
  private indexName: TIndexes = "primary" as TIndexes;
  private pkValue?: unknown;
  private skCondition?: SKCondition;

  private readonly table: Table<TIndexes>;

  constructor(table: Table<TIndexes>, primaryKey?: PrimaryKey) {
    this.table = table;

    if (primaryKey) {
      const indexConfig = table.getIndexConfig(this.indexName);
      this.partitionKey(primaryKey.pk);

      if (primaryKey.sk && !indexConfig.skName) {
        throw new Error("Sort key is not supported for the primary index");
      }

      if (primaryKey.sk && indexConfig.skName) {
        if (typeof primaryKey.sk === "string") {
          this.sortKey("=", primaryKey.sk);
        } else {
          const skCondition = primaryKey.sk as SKCondition;
          this.sortKey(skCondition.operator, skCondition.value);
        }
      }
    }
  }

  partitionKey(value: unknown): this {
    this.pkValue = value;
    return this;
  }

  sortKey(operator: FilterOperator, value: unknown | [unknown, unknown]): this {
    if (operator === "between" && Array.isArray(value) && value.length !== 2) {
      throw new Error("Between operator requires an array with two values");
    }

    this.skCondition = { operator, value };
    return this;
  }

  private addSortKeyConstraint(fieldName: string, skCondition: SKCondition) {
    const namePlaceholder = "#sk";
    const valuePlaceholder = ":sk";

    let skExpression = `${namePlaceholder}`;

    if (skCondition.operator === "between" && Array.isArray(skCondition.value) && skCondition.value.length === 2) {
      const lowerValuePlaceholder = ":sk_lower";
      const upperValuePlaceholder = ":sk_upper";
      skExpression += ` BETWEEN ${lowerValuePlaceholder} AND ${upperValuePlaceholder}`;

      return {
        expression: skExpression,
        names: { [namePlaceholder]: fieldName },
        values: { [lowerValuePlaceholder]: skCondition.value[0], [upperValuePlaceholder]: skCondition.value[1] },
      };
    }

    if (skCondition.operator === "begins_with" && skCondition.value !== undefined) {
      skExpression = `BEGINS_WITH(${namePlaceholder}, ${valuePlaceholder})`;
    } else if (skCondition.value !== undefined) {
      skExpression += ` ${skCondition.operator} ${valuePlaceholder}`;
    }

    return {
      expression: skExpression,
      names: { [namePlaceholder]: fieldName },
      values: { [valuePlaceholder]: skCondition.value },
    };
  }

  useIndex(indexName: TIndexes): this {
    this.indexName = indexName;
    return this;
  }

  build(): ConditionExpression {
    if (!this.pkValue) {
      throw new Error("Key condition is required");
    }

    const indexConfig = this.table.getIndexConfig(this.indexName);

    if (!indexConfig.skName && this.skCondition) {
      throw new Error(`Sort key is not supported for the index ${this.indexName}`);
    }

    let names: Record<string, string> = { "#pk": indexConfig.pkName };
    let values: Record<string, unknown> = { ":pk": this.pkValue };
    let expression = "#pk = :pk";

    if (this.skCondition && indexConfig.skName) {
      const {
        expression: skExpression,
        names: skNames,
        values: skValues,
      } = this.addSortKeyConstraint(indexConfig.skName, this.skCondition);

      expression += ` AND ${skExpression}`;

      names = { ...names, ...skNames };
      values = { ...values, ...skValues };
    }

    return {
      expression,
      names,
      values,
    };
  }
}
