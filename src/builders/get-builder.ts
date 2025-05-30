import type { ExpressionParams, PrimaryKeyWithoutExpression } from "../conditions";
import type { DynamoItem } from "../types";
import { generateAttributeName } from "../expression";

/**
 * Configuration options for DynamoDB get operations.
 */
export interface GetOptions {
  /** List of attributes to return in the result */
  projection?: string[];
  /** Whether to use strongly consistent reads */
  consistentRead?: boolean;
}

/**
 * Parameters for the DynamoDB get command.
 */
export interface GetCommandParams {
  /** The name of the DynamoDB table */
  tableName: string;
  /** The primary key of the item to get */
  key: PrimaryKeyWithoutExpression;
  /** Comma-separated list of attributes to return */
  projectionExpression?: string;
  /** Map of expression attribute name placeholders to actual names */
  expressionAttributeNames?: Record<string, string>;
  /** Whether to use strongly consistent reads */
  consistentRead?: boolean;
}

/**
 * Function type for executing DynamoDB get operations.
 * @typeParam T - The type of item being retrieved
 */
type GetExecutor<T extends DynamoItem> = (params: GetCommandParams) => Promise<{ item: T | undefined }>;

/**
 * Builder for creating DynamoDB get operations.
 * Use this builder when you need to:
 * - Retrieve a single dinosaur by its primary key
 * - Project specific dinosaur attributes
 * - Use consistent reads for critical dinosaur data
 *
 * @example
 * ```typescript
 * // Simple get
 * const result = await new GetBuilder(executor, { pk: 'dinosaur#123', sk: 'profile' })
 *   .execute();
 *
 * // Get with projection and consistent read
 * const result = await new GetBuilder(executor, { pk: 'dinosaur#123', sk: 'profile' })
 *   .select(['species', 'name', 'diet'])
 *   .consistentRead()
 *   .execute();
 * ```
 *
 * @typeParam T - The type of item being retrieved
 */
export class GetBuilder<T extends DynamoItem> {
  private readonly params: GetCommandParams;
  private options: GetOptions = {};
  private selectedFields: Set<string> = new Set();

  /**
   * Creates a new GetBuilder instance.
   *
   * @param executor - Function that executes the get operation
   * @param key - Primary key of the item to retrieve
   * @param tableName - Name of the DynamoDB table
   */
  constructor(
    private readonly executor: GetExecutor<T>,
    key: PrimaryKeyWithoutExpression,
    tableName: string,
  ) {
    this.params = {
      tableName,
      key,
    };
  }

  /**
   * Specifies which attributes to return in the get results.
   * Use this method when you need to:
   * - Reduce data transfer by selecting specific dinosaur attributes
   * - Optimize response size for dinosaur records
   * - Focus on relevant dinosaur characteristics only
   *
   * @example
   * ```typescript
   * // Select single attribute
   * builder.select('species')
   *
   * // Select multiple attributes
   * builder.select(['id', 'species', 'diet'])
   *
   * // Chain multiple select calls
   * builder
   *   .select('id')
   *   .select(['species', 'diet'])
   * ```
   *
   * @param fields - A single field name or an array of field names to return
   * @returns The builder instance for method chaining
   */
  select(fields: string | string[]): GetBuilder<T> {
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

  /**
   * Sets whether to use strongly consistent reads for the get operation.
   * Use this method when you need:
   * - The most up-to-date dinosaur data
   * - To ensure you're reading the latest dinosaur status
   * - Critical safety information about dangerous species
   *
   * Note: Consistent reads consume twice the throughput
   *
   * @example
   * ```typescript
   * // Get the latest T-Rex data
   * const result = await new GetBuilder(executor, { pk: 'dinosaur#123', sk: 'profile' })
   *   .consistentRead()
   *   .execute();
   * ```
   *
   * @param consistentRead - Whether to use consistent reads (defaults to true)
   * @returns The builder instance for method chaining
   */
  consistentRead(consistentRead = true): GetBuilder<T> {
    this.params.consistentRead = consistentRead;
    return this;
  }

  /**
   * Executes the get operation against DynamoDB.
   *
   * @example
   * ```typescript
   * try {
   *   const result = await new GetBuilder(executor, { pk: 'dinosaur#123', sk: 'profile' })
   *     .select(['species', 'name', 'diet'])
   *     .consistentRead()
   *     .execute();
   *
   *   if (result.item) {
   *     console.log('Dinosaur found:', result.item);
   *   } else {
   *     console.log('Dinosaur not found');
   *   }
   * } catch (error) {
   *   console.error('Error getting dinosaur:', error);
   * }
   * ```
   *
   * @returns A promise that resolves to an object containing:
   *          - item: The retrieved dinosaur or undefined if not found
   */
  async execute(): Promise<{ item: T | undefined }> {
    const expressionParams: ExpressionParams = {
      expressionAttributeNames: {},
      expressionAttributeValues: {},
      valueCounter: { count: 0 },
    };

    const projectionExpression = Array.from(this.selectedFields)
      .map((p) => generateAttributeName(expressionParams, p))
      .join(", ");

    const { expressionAttributeNames } = expressionParams;

    return this.executor({
      ...this.params,
      projectionExpression: projectionExpression.length > 0 ? projectionExpression : undefined,
      expressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
    });
  }
}
