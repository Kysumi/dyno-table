import type { ExpressionParams, PrimaryKeyWithoutExpression } from "../conditions";
import type { DynamoItem } from "../types";
import type { BatchBuilder } from "./batch-builder";
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
   * Adds this get operation to a batch with optional entity type information.
   *
   * @example Basic Usage
   * ```ts
   * const batch = table.batchBuilder();
   *
   * // Add multiple get operations to batch
   * dinosaurRepo.get({ id: 'dino-1' }).withBatch(batch);
   * dinosaurRepo.get({ id: 'dino-2' }).withBatch(batch);
   * dinosaurRepo.get({ id: 'dino-3' }).withBatch(batch);
   *
   * // Execute all gets efficiently
   * const results = await batch.execute();
   * ```
   *
   * @example Typed Usage
   * ```ts
   * const batch = table.batchBuilder<{
   *   User: UserEntity;
   *   Order: OrderEntity;
   * }>();
   *
   * // Add operations with type information
   * userRepo.get({ id: 'user-1' }).withBatch(batch, 'User');
   * orderRepo.get({ id: 'order-1' }).withBatch(batch, 'Order');
   *
   * // Execute and get typed results
   * const result = await batch.execute();
   * const users: UserEntity[] = result.reads.itemsByType.User;
   * const orders: OrderEntity[] = result.reads.itemsByType.Order;
   * ```
   *
   * @param batch - The batch builder to add this operation to
   * @param entityType - Optional entity type key for type tracking
   */
  public withBatch<
    TEntities extends Record<string, DynamoItem> = Record<string, DynamoItem>,
    K extends keyof TEntities = keyof TEntities,
  >(batch: BatchBuilder<TEntities>, entityType?: K) {
    const command = this.toDynamoCommand();
    batch.getWithCommand(command, entityType);
  }

  /**
   * Converts the builder configuration to a DynamoDB command
   */
  private toDynamoCommand(): GetCommandParams {
    const expressionParams: ExpressionParams = {
      expressionAttributeNames: {},
      expressionAttributeValues: {},
      valueCounter: { count: 0 },
    };

    const projectionExpression = Array.from(this.selectedFields)
      .map((p) => generateAttributeName(expressionParams, p))
      .join(", ");

    const { expressionAttributeNames } = expressionParams;

    return {
      ...this.params,
      projectionExpression: projectionExpression.length > 0 ? projectionExpression : undefined,
      expressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
    };
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
    const command = this.toDynamoCommand();
    return this.executor(command);
  }
}
