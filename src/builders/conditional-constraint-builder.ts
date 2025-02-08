import type { AttributeTypes, ComparisonOperator } from "./operators";

export interface ConditionExpression {
  expression: string;
  names?: Record<string, string>;
  values?: Record<string, unknown>;
}

export type ConstraintBuilder = (builder: ConditionalConstraintBuilder) => void;

interface Condition {
  expression: ConditionExpression;
  conjunction: "AND" | "OR";
}

export class ConditionalConstraintBuilder {
  private conditions: Condition[] = [];
  private names: Record<string, string>;
  private values: Record<string, unknown>;

  constructor(sharedNames?: Record<string, string>, sharedValues?: Record<string, unknown>) {
    this.names = sharedNames ?? {};
    this.values = sharedValues ?? {};
  }

  /**
   * Converts a field path with dots to DynamoDB expression attribute name placeholders
   * e.g. "user.address.city" -> "#user.#address.#city"
   */
  private getNamePlaceholdersForPath(fieldPath: string): {
    placeholderPath: string;
    names: Record<string, string>;
  } {
    const parts = fieldPath.split(".");

    const placeholders = parts.map((part) => {
      // Check if we already have a placeholder for this name
      const existingPlaceholder = Object.entries(this.names).find(([_, v]) => v === part)?.[0];
      if (existingPlaceholder) {
        return existingPlaceholder;
      }

      // Create new placeholder
      const newPlaceholder = `#${Object.keys(this.names).length}`;
      this.names[newPlaceholder] = part;
      return newPlaceholder;
    });

    return {
      placeholderPath: placeholders.join("."),
      names: this.names,
    };
  }

  private generateValuePlaceholder(value: unknown): string {
    // Check if we already have this value
    const existingPlaceholder = Object.entries(this.values).find(([_, v]) => v === value)?.[0];
    if (existingPlaceholder) {
      return existingPlaceholder;
    }

    const placeholder = `:${Object.keys(this.values).length}`;
    this.values[placeholder] = value;
    return placeholder;
  }

  private addCondition(conjunction: "AND" | "OR", expression: ConditionExpression): this {
    this.conditions.push({ expression, conjunction });
    return this;
  }

  private createCondition(
    field: string,
    expressionFn: (placeholderPath: string, valuePlaceholders: string[]) => string,
    values?: unknown | unknown[],
  ): ConditionExpression {
    const { placeholderPath, names } = this.getNamePlaceholdersForPath(field);
    const valueMap: Record<string, unknown> = {};

    let expression: string;
    if (values !== undefined) {
      const valueArray = Array.isArray(values) ? values : [values];
      const valuePlaceholders = valueArray.map((value) => {
        const placeholder = this.generateValuePlaceholder(value);
        valueMap[placeholder] = value;
        return placeholder;
      });
      expression = expressionFn(placeholderPath, valuePlaceholders);
    } else {
      expression = expressionFn(placeholderPath, []);
    }

    return {
      expression,
      names,
      values: Object.keys(valueMap).length ? valueMap : undefined,
    };
  }

  where(field: string, operator: ComparisonOperator, value: unknown): this {
    const expression = this.createCondition(
      field,
      (path, [placeholder]) => `${path} ${operator} ${placeholder}`,
      value,
    );
    return this.addCondition("AND", expression);
  }

  orWhere(field: string, operator: ComparisonOperator, value: unknown): this {
    const expression = this.createCondition(
      field,
      (path, [placeholder]) => `${path} ${operator} ${placeholder}`,
      value,
    );
    return this.addCondition("OR", expression);
  }

  whereSize(field: string, operator: ComparisonOperator, value: number): this {
    const expression = this.createCondition(
      field,
      (path, [placeholder]) => `size(${path}) ${operator} ${placeholder}`,
      value,
    );
    return this.addCondition("AND", expression);
  }

  orWhereSize(field: string, operator: ComparisonOperator, value: number): this {
    const expression = this.createCondition(
      field,
      (path, [placeholder]) => `size(${path}) ${operator} ${placeholder}`,
      value,
    );
    return this.addCondition("OR", expression);
  }

  whereBetween(field: string, lower: unknown, upper: unknown): this {
    const expression = this.createCondition(
      field,
      (path, [lowerPlaceholder, upperPlaceholder]) => `${path} BETWEEN ${lowerPlaceholder} AND ${upperPlaceholder}`,
      [lower, upper],
    );
    return this.addCondition("AND", expression);
  }

  orWhereBetween(field: string, lower: unknown, upper: unknown): this {
    const expression = this.createCondition(
      field,
      (path, [lowerPlaceholder, upperPlaceholder]) => `${path} BETWEEN ${lowerPlaceholder} AND ${upperPlaceholder}`,
      [lower, upper],
    );
    return this.addCondition("OR", expression);
  }

  whereIn(field: string, values: unknown[]): this {
    const expression = this.createCondition(
      field,
      (path, placeholders) => `${path} IN (${placeholders.join(", ")})`,
      values,
    );
    return this.addCondition("AND", expression);
  }

  orWhereIn(field: string, values: unknown[]): this {
    const expression = this.createCondition(
      field,
      (path, placeholders) => `${path} IN (${placeholders.join(", ")})`,
      values,
    );
    return this.addCondition("OR", expression);
  }

  whereAttributeExists(field: string): this {
    const expression = this.createCondition(field, (path) => `attribute_exists(${path})`);
    return this.addCondition("AND", expression);
  }

  orWhereAttributeExists(field: string): this {
    const expression = this.createCondition(field, (path) => `attribute_exists(${path})`);
    return this.addCondition("OR", expression);
  }

  whereAttributeNotExists(field: string): this {
    const expression = this.createCondition(field, (path) => `attribute_not_exists(${path})`);
    return this.addCondition("AND", expression);
  }

  orWhereAttributeNotExists(field: string): this {
    const expression = this.createCondition(field, (path) => `attribute_not_exists(${path})`);
    return this.addCondition("OR", expression);
  }

  whereAttributeType(field: string, type: AttributeTypes): this {
    const expression = this.createCondition(field, (path) => `attribute_type(${path}, ${type})`);
    return this.addCondition("AND", expression);
  }

  orWhereAttributeType(field: string, type: AttributeTypes): this {
    const expression = this.createCondition(field, (path) => `attribute_type(${path}, ${type})`);
    return this.addCondition("OR", expression);
  }

  whereContains(field: string, value: unknown): this {
    const expression = this.createCondition(field, (path, [placeholder]) => `contains(${path}, ${placeholder})`, value);
    return this.addCondition("AND", expression);
  }

  orWhereContains(field: string, value: unknown): this {
    const expression = this.createCondition(field, (path, [placeholder]) => `contains(${path}, ${placeholder})`, value);
    return this.addCondition("OR", expression);
  }

  whereBeginsWith(field: string, value: unknown): this {
    const expression = this.createCondition(
      field,
      (path, [placeholder]) => `begins_with(${path}, ${placeholder})`,
      value,
    );
    return this.addCondition("AND", expression);
  }

  orWhereBeginsWith(field: string, value: unknown): this {
    const expression = this.createCondition(
      field,
      (path, [placeholder]) => `begins_with(${path}, ${placeholder})`,
      value,
    );
    return this.addCondition("OR", expression);
  }

  whereNot(field: string, operator: string, value: unknown): this {
    const expression = this.createCondition(
      field,
      (path, [placeholder]) => `NOT (${path} ${operator} ${placeholder})`,
      value,
    );
    return this.addCondition("AND", expression);
  }

  orWhereNot(field: string, operator: string, value: unknown): this {
    const expression = this.createCondition(
      field,
      (path, [placeholder]) => `NOT (${path} ${operator} ${placeholder})`,
      value,
    );
    return this.addCondition("OR", expression);
  }

  whereIsNull(field: string): this {
    const expression = this.createCondition(field, (path) => `attribute_type(${path}, NULL)`);
    return this.addCondition("AND", expression);
  }

  orWhereIsNull(field: string): this {
    const expression = this.createCondition(field, (path) => `attribute_type(${path}, NULL)`);
    return this.addCondition("OR", expression);
  }

  whereIsNotNull(field: string): this {
    const expression = this.createCondition(field, (path) => `NOT attribute_type(${path}, NULL)`);
    return this.addCondition("AND", expression);
  }

  orWhereIsNotNull(field: string): this {
    const expression = this.createCondition(field, (path) => `NOT attribute_type(${path}, NULL)`);
    return this.addCondition("OR", expression);
  }

  whereExpression(builder: ConstraintBuilder): this {
    const nestedBuilder = new ConditionalConstraintBuilder(this.names, this.values);
    builder(nestedBuilder);

    const nestedExpression = nestedBuilder.getExpression();
    if (nestedExpression) {
      return this.addCondition("AND", nestedExpression);
    }
    return this;
  }

  orWhereExpression(builder: ConstraintBuilder): this {
    const nestedBuilder = new ConditionalConstraintBuilder(this.names, this.values);
    builder(nestedBuilder);

    const nestedExpression = nestedBuilder.getExpression();
    if (nestedExpression) {
      return this.addCondition("OR", nestedExpression);
    }
    return this;
  }

  getExpression(): ConditionExpression | null {
    if (!this.conditions.length) {
      return null;
    }

    const firstCondition = this.conditions[0];

    if (!firstCondition) {
      return null;
    }

    let combinedExpression = firstCondition.expression.expression;
    let combinedNames = { ...(firstCondition.expression.names || {}) };
    let combinedValues = { ...(firstCondition.expression.values || {}) };

    const remainingConditions = this.conditions.slice(1);
    combinedExpression = remainingConditions.reduce((acc, condition) => {
      const { expression, conjunction } = condition;
      combinedNames = { ...combinedNames, ...(expression.names || {}) };
      combinedValues = { ...combinedValues, ...(expression.values || {}) };
      return `(${acc}) ${conjunction} (${expression.expression})`;
    }, combinedExpression);

    return {
      expression: combinedExpression,
      names: Object.keys(combinedNames).length ? combinedNames : undefined,
      values: Object.keys(combinedValues).length ? combinedValues : undefined,
    };
  }
}
