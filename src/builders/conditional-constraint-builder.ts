import type { AttributeTypes, ComparisonOperator } from "./operators";

export interface ConditionExpression {
  expression: string;
  names?: Record<string, string>;
  values?: Record<string, unknown>;
}

export type TConstraintBuilder = (builder: ConstraintBuilder) => void;

interface Condition {
  expression: ConditionExpression;
  conjunction: "AND" | "OR";
}

/**
 * Builder class for creating DynamoDB condition expressions.
 * Provides a fluent interface for building complex filter conditions.
 */
export class ConstraintBuilder {
  private conditions: Condition[] = [];
  private names: Record<string, string>;
  private values: Record<string, unknown>;

  /**
   * Creates a new instance of ConstraintBuilder.
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
   * // Or with nested conditions:
   * builder.where(b => b.where("age", ">", 18).orWhere("hasParentalConsent", "=", true))
   * ```
   */
  where(builder: TConstraintBuilder): this;
  where(field: string, operator: ComparisonOperator, value: unknown): this;
  where(fieldOrBuilder: string | TConstraintBuilder, operator?: ComparisonOperator, value?: unknown): this {
    if (typeof fieldOrBuilder === "function") {
      const nestedBuilder = new ConstraintBuilder(this.names, this.values);
      fieldOrBuilder(nestedBuilder);
      const nestedExpression = nestedBuilder.getExpression();
      if (nestedExpression) {
        return this.addCondition("AND", nestedExpression);
      }
      return this;
    }

    const expression = this.createCondition(
      fieldOrBuilder,
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
   * builder.where("type", "=", "admin").orWhere("role", "=", "superuser")
   * // Or with nested conditions:
   * builder.where("type", "=", "user").orWhere(b =>
   *   b.where("role", "=", "admin").where("isActive", "=", true)
   * )
   * ```
   */
  orWhere(builder: TConstraintBuilder): this;
  orWhere(field: string, operator: ComparisonOperator, value: unknown): this;
  orWhere(fieldOrBuilder: string | TConstraintBuilder, operator?: ComparisonOperator, value?: unknown): this {
    if (typeof fieldOrBuilder === "function") {
      const nestedBuilder = new ConstraintBuilder(this.names, this.values);
      fieldOrBuilder(nestedBuilder);
      const nestedExpression = nestedBuilder.getExpression();
      if (nestedExpression) {
        return this.addCondition("OR", nestedExpression);
      }
      return this;
    }

    const expression = this.createCondition(
      fieldOrBuilder,
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
  whereExpression(builder: TConstraintBuilder): this {
    const nestedBuilder = new ConstraintBuilder(this.names, this.values);
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
  orWhereExpression(builder: TConstraintBuilder): this {
    const nestedBuilder = new ConstraintBuilder(this.names, this.values);
    builder(nestedBuilder);

    const nestedExpression = nestedBuilder.getExpression();
    if (nestedExpression) {
      return this.addCondition("OR", nestedExpression);
    }
    return this;
  }

  /**
   * Validates that the expression meets DynamoDB's constraints
   *
   * @see https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html#limits-expression-parameters
   *
   * @param expression - The expression string to validate
   * @param names - The expression attribute names
   * @param values - The expression attribute values
   * @throws Error if any constraints are violated
   */
  private validateExpressionConstraints(
    expression: string,
    names: Record<string, string>,
    values: Record<string, unknown>,
  ): void {
    // Validate expression length
    const expressionBytes = new TextEncoder().encode(expression).length;
    if (expressionBytes > 4096) {
      throw new Error(`Condition expression exceeds maximum length of 4KB (current: ${expressionBytes} bytes)`);
    }

    // Validate number of name placeholders
    if (Object.keys(names).length > 255) {
      throw new Error("Condition expression exceeds maximum of 255 attribute name placeholders");
    }

    // Validate number of value placeholders
    if (Object.keys(values).length > 255) {
      throw new Error("Condition expression exceeds maximum of 255 attribute value placeholders");
    }
  }

  /**
   * Builds and returns the final condition expression
   *
   * @returns The complete condition expression, or null if no conditions were added
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
    let lastConjunction: "AND" | "OR" | null = null;

    combinedExpression = remainingConditions.reduce((acc, condition) => {
      const { expression, conjunction } = condition;
      combinedNames = { ...combinedNames, ...(expression.names || {}) };
      combinedValues = { ...combinedValues, ...(expression.values || {}) };

      // Always wrap nested expressions (from whereExpression/orWhereExpression)
      const isNestedExpression = expression.expression.includes(" AND ") || expression.expression.includes(" OR ");
      const wrappedExpr = isNestedExpression ? `(${expression.expression})` : expression.expression;

      // Only wrap the accumulator if mixing AND/OR
      const needsParentheses = lastConjunction !== null && lastConjunction !== conjunction;
      const wrappedAcc = needsParentheses ? `(${acc})` : acc;

      lastConjunction = conjunction;
      return `${wrappedAcc} ${conjunction} ${wrappedExpr}`;
    }, combinedExpression);

    this.validateExpressionConstraints(combinedExpression, combinedNames, combinedValues);

    return {
      expression: combinedExpression,
      names: Object.keys(combinedNames).length ? combinedNames : undefined,
      values: Object.keys(combinedValues).length ? combinedValues : undefined,
    };
  }

  /**
   * Returns a human-readable version of the condition expression for debugging
   * Replaces placeholders with their actual values
   *
   * @returns A readable version of the condition expression, or null if no conditions
   *
   * Usage:
   * ```typescript
   * const builder = new ConstraintBuilder()
   *   .where("age", ">", 21)
   *   .orWhere("status", "=", "active");
   *
   * console.log(builder.getDebugExpression());
   * // "(age > 21) OR (status = 'active')"
   * ```
   */
  getDebugExpression(): string | null {
    const expression = this.getExpression();
    if (!expression) {
      return null;
    }

    let readableExpression = expression.expression;

    // Replace name placeholders
    if (expression.names) {
      for (const [placeholder, actualName] of Object.entries(expression.names)) {
        readableExpression = readableExpression.replace(new RegExp(placeholder, "g"), actualName);
      }
    }

    // Replace value placeholders
    if (expression.values) {
      for (const [placeholder, value] of Object.entries(expression.values)) {
        const formattedValue = typeof value === "string" ? `'${value}'` : value;
        readableExpression = readableExpression.replace(new RegExp(placeholder, "g"), String(formattedValue));
      }
    }

    return readableExpression;
  }

  /**
   * Creates a new condition by combining multiple conditions with AND
   *
   * @param conditions - Array of condition builders or condition builder functions
   * @returns A new ConstraintBuilder instance
   *
   * Usage:
   * ```typescript
   * const condition = ConstraintBuilder.and([
   *   (builder) => builder.where("age", ">", 18),
   *   (builder) => builder.where("status", "=", "active"),
   * ]);
   *
   * // Or with existing builders
   * const ageCheck = new ConstraintBuilder().where("age", ">", 18);
   * const statusCheck = new ConstraintBuilder().where("status", "=", "active");
   * const combined = ConstraintBuilder.and([ageCheck, statusCheck]);
   * ```
   */
  static and(conditions: (ConstraintBuilder | TConstraintBuilder)[]): ConstraintBuilder {
    const builder = new ConstraintBuilder();

    for (const condition of conditions) {
      if (condition instanceof ConstraintBuilder) {
        const expr = condition.getExpression();
        if (expr) {
          builder.addCondition("AND", expr);
        }
      } else {
        builder.whereExpression(condition);
      }
    }

    return builder;
  }

  /**
   * Creates a new condition by combining multiple conditions with OR
   *
   * @param conditions - Array of condition builders or condition builder functions
   * @returns A new ConstraintBuilder instance
   *
   * Usage:
   * ```typescript
   * const condition = ConstraintBuilder.or([
   *   (builder) => builder.where("role", "=", "admin"),
   *   (builder) => builder.where("permissions", "contains", "super_user"),
   * ]);
   *
   * // Or with existing builders
   * const adminCheck = new ConstraintBuilder().where("role", "=", "admin");
   * const permCheck = new ConstraintBuilder().where("permissions", "contains", "super_user");
   * const combined = ConstraintBuilder.or([adminCheck, permCheck]);
   * ```
   */
  static or(conditions: (ConstraintBuilder | TConstraintBuilder)[]): ConstraintBuilder {
    const builder = new ConstraintBuilder();

    for (const condition of conditions) {
      if (condition instanceof ConstraintBuilder) {
        const expr = condition.getExpression();
        if (expr) {
          builder.addCondition("OR", expr);
        }
      } else {
        builder.orWhereExpression(condition);
      }
    }

    return builder;
  }
}
