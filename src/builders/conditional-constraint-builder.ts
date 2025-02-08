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

/**
 * Builder class for creating DynamoDB condition expressions.
 * Provides a fluent interface for building complex filter conditions.
 */
export class ConditionalConstraintBuilder {
  private conditions: Condition[] = [];
  private names: Record<string, string>;
  private values: Record<string, unknown>;

  /**
   * Creates a new instance of ConditionalConstraintBuilder.
   *
   * @param sharedNames - Optional map of existing name placeholders to reuse
   * @param sharedValues - Optional map of existing value placeholders to reuse
   */
  constructor(sharedNames?: Record<string, string>, sharedValues?: Record<string, unknown>) {
    this.names = sharedNames ?? {};
    this.values = sharedValues ?? {};
  }

  /**
   * Converts a field path with dots to DynamoDB expression attribute name placeholders
   * e.g. "user.address.city" -> "#user.#address.#city"
   *
   * @param fieldPath - The field path to convert (e.g. "user.address.city")
   * @returns Object containing the placeholder path and name mappings
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

  /**
   * Generates a unique value placeholder and stores the value mapping
   *
   * @param value - The value to store
   * @returns The generated placeholder (e.g. ":0")
   */
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

  /**
   * Adds a condition to the builder with the specified conjunction
   *
   * @param conjunction - The conjunction to use ("AND" or "OR")
   * @param expression - The condition expression to add
   * @returns The current builder instance for chaining
   */
  private addCondition(conjunction: "AND" | "OR", expression: ConditionExpression): this {
    this.conditions.push({ expression, conjunction });
    return this;
  }

  /**
   * Creates a condition expression with the given field and expression function
   *
   * @param field - The field to create the condition for
   * @param expressionFn - Function that generates the expression string
   * @param values - Optional value(s) to include in the condition
   * @returns The created condition expression
   */
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

  /**
   * Adds a simple equality condition
   *
   * @param field - The field to compare
   * @param operator - The comparison operator to use
   * @param value - The value to compare against
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.where("age", ">", 21)
   * ```
   */
  where(field: string, operator: ComparisonOperator, value: unknown): this {
    const expression = this.createCondition(
      field,
      (path, [placeholder]) => `${path} ${operator} ${placeholder}`,
      value,
    );
    return this.addCondition("AND", expression);
  }

  /**
   * Adds a condition with OR conjunction
   *
   * @param field - The field to compare
   * @param operator - The comparison operator to use
   * @param value - The value to compare against
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.where("type", "=", "admin").orWhereWhere("role", "=", "superuser")
   * ```
   */
  orWhere(field: string, operator: ComparisonOperator, value: unknown): this {
    const expression = this.createCondition(
      field,
      (path, [placeholder]) => `${path} ${operator} ${placeholder}`,
      value,
    );
    return this.addCondition("OR", expression);
  }

  /**
   * Adds a size comparison condition
   *
   * @param field - The field whose size to compare
   * @param operator - The comparison operator to use
   * @param value - The size value to compare against
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.whereSize("items", ">", 5)
   * ```
   */
  whereSize(field: string, operator: ComparisonOperator, value: number): this {
    const expression = this.createCondition(
      field,
      (path, [placeholder]) => `size(${path}) ${operator} ${placeholder}`,
      value,
    );
    return this.addCondition("AND", expression);
  }

  /**
   * Adds a size comparison condition with OR conjunction
   *
   * @param field - The field whose size to compare
   * @param operator - The comparison operator to use
   * @param value - The size value to compare against
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.where("type", "=", "list").orWhereSize("items", ">", 10)
   * ```
   */
  orWhereSize(field: string, operator: ComparisonOperator, value: number): this {
    const expression = this.createCondition(
      field,
      (path, [placeholder]) => `size(${path}) ${operator} ${placeholder}`,
      value,
    );
    return this.addCondition("OR", expression);
  }

  /**
   * Adds a BETWEEN condition
   *
   * @param field - The field to check
   * @param lower - The lower bound value
   * @param upper - The upper bound value
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.whereBetween("age", 18, 65)
   * ```
   */
  whereBetween(field: string, lower: unknown, upper: unknown): this {
    const expression = this.createCondition(
      field,
      (path, [lowerPlaceholder, upperPlaceholder]) => `${path} BETWEEN ${lowerPlaceholder} AND ${upperPlaceholder}`,
      [lower, upper],
    );
    return this.addCondition("AND", expression);
  }

  /**
   * Adds a BETWEEN condition with OR conjunction
   *
   * @param field - The field to check
   * @param lower - The lower bound value
   * @param upper - The upper bound value
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.where("status", "=", "active").orWhereBetween("age", 18, 65)
   * ```
   */
  orWhereBetween(field: string, lower: unknown, upper: unknown): this {
    const expression = this.createCondition(
      field,
      (path, [lowerPlaceholder, upperPlaceholder]) => `${path} BETWEEN ${lowerPlaceholder} AND ${upperPlaceholder}`,
      [lower, upper],
    );
    return this.addCondition("OR", expression);
  }

  /**
   * Adds an IN condition
   *
   * @param field - The field to check
   * @param values - Array of values to match against
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.whereIn("status", ["active", "pending"])
   * ```
   */
  whereIn(field: string, values: unknown[]): this {
    const expression = this.createCondition(
      field,
      (path, placeholders) => `${path} IN (${placeholders.join(", ")})`,
      values,
    );
    return this.addCondition("AND", expression);
  }

  /**
   * Adds an IN condition with OR conjunction
   *
   * @param field - The field to check
   * @param values - Array of values to match against
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.where("type", "=", "user").orWhereIn("role", ["admin", "moderator"])
   * ```
   */
  orWhereIn(field: string, values: unknown[]): this {
    const expression = this.createCondition(
      field,
      (path, placeholders) => `${path} IN (${placeholders.join(", ")})`,
      values,
    );
    return this.addCondition("OR", expression);
  }

  /**
   * Checks if an attribute exists
   *
   * @param field - The field to check for existence
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.whereAttributeExists("optionalField")
   * ```
   */
  whereAttributeExists(field: string): this {
    const expression = this.createCondition(field, (path) => `attribute_exists(${path})`);
    return this.addCondition("AND", expression);
  }

  /**
   * Checks if an attribute exists with OR conjunction
   *
   * @param field - The field to check for existence
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.where("type", "=", "user").orWhereAttributeExists("profile")
   * ```
   */
  orWhereAttributeExists(field: string): this {
    const expression = this.createCondition(field, (path) => `attribute_exists(${path})`);
    return this.addCondition("OR", expression);
  }

  /**
   * Checks if an attribute does not exist
   *
   * @param field - The field to check for non-existence
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.whereAttributeNotExists("deletedAt")
   * ```
   */
  whereAttributeNotExists(field: string): this {
    const expression = this.createCondition(field, (path) => `attribute_not_exists(${path})`);
    return this.addCondition("AND", expression);
  }

  /**
   * Checks if an attribute does not exist with OR conjunction
   *
   * @param field - The field to check for non-existence
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.where("status", "=", "active").orWhereAttributeNotExists("deletedAt")
   * ```
   */
  orWhereAttributeNotExists(field: string): this {
    const expression = this.createCondition(field, (path) => `attribute_not_exists(${path})`);
    return this.addCondition("OR", expression);
  }

  /**
   * Checks the type of an attribute
   *
   * @param field - The field to check
   * @param type - The expected DynamoDB type
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.whereAttributeType("count", "N")
   * ```
   */
  whereAttributeType(field: string, type: AttributeTypes): this {
    const expression = this.createCondition(field, (path) => `attribute_type(${path}, ${type})`);
    return this.addCondition("AND", expression);
  }

  /**
   * Checks the type of an attribute with OR conjunction
   *
   * @param field - The field to check
   * @param type - The expected DynamoDB type
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.where("active", "=", true).orWhereAttributeType("count", "N")
   * ```
   */
  orWhereAttributeType(field: string, type: AttributeTypes): this {
    const expression = this.createCondition(field, (path) => `attribute_type(${path}, ${type})`);
    return this.addCondition("OR", expression);
  }

  /**
   * Checks if a field contains a value
   *
   * @param field - The field to check
   * @param value - The value to search for
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.whereContains("description", "important")
   * ```
   */
  whereContains(field: string, value: unknown): this {
    const expression = this.createCondition(field, (path, [placeholder]) => `contains(${path}, ${placeholder})`, value);
    return this.addCondition("AND", expression);
  }

  /**
   * Checks if a field contains a value with OR conjunction
   *
   * @param field - The field to check
   * @param value - The value to search for
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.where("type", "=", "note").orWhereContains("tags", "urgent")
   * ```
   */
  orWhereContains(field: string, value: unknown): this {
    const expression = this.createCondition(field, (path, [placeholder]) => `contains(${path}, ${placeholder})`, value);
    return this.addCondition("OR", expression);
  }

  /**
   * Checks if a field begins with a value
   *
   * @param field - The field to check
   * @param value - The prefix to match
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.whereBeginsWith("id", "user_")
   * ```
   */
  whereBeginsWith(field: string, value: unknown): this {
    const expression = this.createCondition(
      field,
      (path, [placeholder]) => `begins_with(${path}, ${placeholder})`,
      value,
    );
    return this.addCondition("AND", expression);
  }

  /**
   * Checks if a field begins with a value with OR conjunction
   *
   * @param field - The field to check
   * @param value - The prefix to match
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.where("type", "=", "org").orWhereBeginsWith("id", "user_")
   * ```
   */
  orWhereBeginsWith(field: string, value: unknown): this {
    const expression = this.createCondition(
      field,
      (path, [placeholder]) => `begins_with(${path}, ${placeholder})`,
      value,
    );
    return this.addCondition("OR", expression);
  }

  /**
   * Negates a condition
   *
   * @param field - The field to compare
   * @param operator - The comparison operator to use
   * @param value - The value to compare against
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.whereNot("status", "=", "deleted")
   * ```
   */
  whereNot(field: string, operator: string, value: unknown): this {
    const expression = this.createCondition(
      field,
      (path, [placeholder]) => `NOT (${path} ${operator} ${placeholder})`,
      value,
    );
    return this.addCondition("AND", expression);
  }

  /**
   * Negates a condition with OR conjunction
   *
   * @param field - The field to compare
   * @param operator - The comparison operator to use
   * @param value - The value to compare against
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.where("type", "=", "user").orWhereNot("role", "=", "guest")
   * ```
   */
  orWhereNot(field: string, operator: string, value: unknown): this {
    const expression = this.createCondition(
      field,
      (path, [placeholder]) => `NOT (${path} ${operator} ${placeholder})`,
      value,
    );
    return this.addCondition("OR", expression);
  }

  /**
   * Checks if a field is NULL
   *
   * @param field - The field to check
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.whereIsNull("deletedAt")
   * ```
   */
  whereIsNull(field: string): this {
    const expression = this.createCondition(field, (path) => `attribute_type(${path}, NULL)`);
    return this.addCondition("AND", expression);
  }

  /**
   * Checks if a field is NULL with OR conjunction
   *
   * @param field - The field to check
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.where("status", "=", "active").orWhereIsNull("expiresAt")
   * ```
   */
  orWhereIsNull(field: string): this {
    const expression = this.createCondition(field, (path) => `attribute_type(${path}, NULL)`);
    return this.addCondition("OR", expression);
  }

  /**
   * Checks if a field is not NULL
   *
   * @param field - The field to check
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.whereIsNotNull("email")
   * ```
   */
  whereIsNotNull(field: string): this {
    const expression = this.createCondition(field, (path) => `NOT attribute_type(${path}, NULL)`);
    return this.addCondition("AND", expression);
  }

  /**
   * Checks if a field is not NULL with OR conjunction
   *
   * @param field - The field to check
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.where("type", "=", "user").orWhereIsNotNull("email")
   * ```
   */
  orWhereIsNotNull(field: string): this {
    const expression = this.createCondition(field, (path) => `NOT attribute_type(${path}, NULL)`);
    return this.addCondition("OR", expression);
  }

  /**
   * Adds a nested expression using a builder callback
   *
   * @param builder - Callback function to build the nested expression
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.whereExpression(nested =>
   *   nested.where("age", ">", 18).orWhere("hasParentalConsent", "=", true)
   * )
   * ```
   */
  whereExpression(builder: ConstraintBuilder): this {
    const nestedBuilder = new ConditionalConstraintBuilder(this.names, this.values);
    builder(nestedBuilder);

    const nestedExpression = nestedBuilder.getExpression();
    if (nestedExpression) {
      return this.addCondition("AND", nestedExpression);
    }
    return this;
  }

  /**
   * Adds a nested expression using a builder callback with OR conjunction
   *
   * @param builder - Callback function to build the nested expression
   * @returns The current builder instance for chaining
   *
   * Usage:
   * ```typescript
   * builder.where("type", "=", "user").orWhereExpression(nested =>
   *   nested.where("role", "=", "admin").where("isActive", "=", true)
   * )
   * ```
   */
  orWhereExpression(builder: ConstraintBuilder): this {
    const nestedBuilder = new ConditionalConstraintBuilder(this.names, this.values);
    builder(nestedBuilder);

    const nestedExpression = nestedBuilder.getExpression();
    if (nestedExpression) {
      return this.addCondition("OR", nestedExpression);
    }
    return this;
  }

  /**
   * Builds and returns the final condition expression
   *
   * @returns The complete condition expression, or null if no conditions were added
   *
   * Usage:
   * ```typescript
   * const expression = builder.getExpression();
   * // { expression: "#0 > :0", names: { "#0": "age" }, values: { ":0": 21 } }
   * ```
   */
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
