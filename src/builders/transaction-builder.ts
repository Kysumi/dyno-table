import type { TransactWriteCommandInput } from "@aws-sdk/lib-dynamodb";
import type { Condition, PrimaryKeyWithoutExpression } from "../conditions";
import { prepareExpressionParams } from "../expression";
import type { DynamoItem } from "../types";
import { debugTransaction } from "../utils/debug-transaction";
import type {
  ConditionCheckCommandParams,
  DeleteCommandParams,
  PutCommandParams,
  TransactionItem,
  UpdateCommandParams,
} from "./builder-types";

/**
 * Configuration options for DynamoDB transactions.
 */
export interface TransactionOptions {
  /** Unique identifier for the transaction request (idempotency token) */
  clientRequestToken?: string;
  /** Level of consumed capacity details to return */
  returnConsumedCapacity?: "INDEXES" | "TOTAL" | "NONE";
  /** Whether to return item collection metrics */
  returnItemCollectionMetrics?: "SIZE" | "NONE";
}

/**
 * Configuration for table indexes used in duplicate detection.
 * Defines the key structure for checking uniqueness constraints.
 */
interface IndexConfig {
  /** The partition key attribute name */
  partitionKey: string;
  /** Optional sort key attribute name */
  sortKey?: string;
}

/**
 * Function type for executing DynamoDB transaction operations.
 * @param params - The complete transaction command input
 * @returns A promise that resolves when the transaction completes
 */
export type TransactionExecutor = (params: TransactWriteCommandInput) => Promise<void>;

/**
 * Builder for creating and executing DynamoDB transactions.
 * Use this builder when you need to:
 * - Perform multiple operations atomically
 * - Ensure data consistency across operations
 * - Implement complex business logic that requires atomic updates
 * - Prevent duplicate items across tables
 *
 * The builder supports:
 * - Put operations (insert/replace items)
 * - Delete operations
 * - Update operations
 * - Condition checks
 * - Duplicate detection
 * - Transaction-wide options
 *
 * @example
 * ```typescript
 * // Create a transaction with multiple operations
 * const transaction = new TransactionBuilder(executor, {
 *   partitionKey: 'id',
 *   sortKey: 'type'
 * });
 *
 * // Add a new order
 * transaction.put('orders', {
 *   orderId: '123',
 *   status: 'PENDING'
 * });
 *
 * // Update inventory with condition
 * transaction.update(
 *   'inventory',
 *   { productId: 'ABC' },
 *   'set quantity = quantity - :amount',
 *   { ':amount': 1 },
 *   op => op.gte('quantity', 1)
 * );
 *
 * // Execute the transaction atomically
 * await transaction.execute();
 * ```
 *
 * Note: DynamoDB transactions have some limitations:
 * - Maximum 25 operations per transaction
 * - All operations must be in the same AWS region
 * - Cannot include table scans or queries
 */
export class TransactionBuilder {
  private items: TransactionItem[] = [];
  private options: TransactionOptions = {};
  private indexConfig: IndexConfig;
  private readonly executor: TransactionExecutor;

  constructor(executor: TransactionExecutor, indexConfig: IndexConfig) {
    this.executor = executor;
    this.indexConfig = indexConfig;
  }

  /**
   * Checks if an item with the same primary key already exists in the transaction
   * @private
   */
  private checkForDuplicateItem(tableName: string, newItem: DynamoItem): void {
    const pkName = this.indexConfig.partitionKey;
    const skName = this.indexConfig.sortKey ?? "";

    // Extract the primary key values from the provided key
    const pkValue = newItem[pkName];
    const skValue = skName ? newItem[skName] : undefined;

    if (!pkValue) {
      throw new Error(`Primary key value for '${pkName}' is missing`);
    }

    const duplicateItem = this.items.find((item) => {
      // Get the key from the item based on its type
      let itemKey: Record<string, unknown> | undefined;
      let itemTableName: string | undefined;

      switch (item.type) {
        case "Put":
          itemTableName = item.params.tableName;
          // For Put operations, the key is part of the item
          itemKey = item.params.item;
          break;
        case "Update":
        case "Delete":
        case "ConditionCheck":
          itemTableName = item.params.tableName;
          itemKey = item.params.key;
          break;
      }

      // Check if the table name and keys match
      if (itemTableName === tableName && itemKey) {
        const itemPkValue = itemKey[pkName];
        const itemSkValue = skName ? itemKey[skName] : undefined;

        // Match if partition keys match and either both sort keys match or both are undefined
        if (itemPkValue === pkValue) {
          if (skValue === undefined && itemSkValue === undefined) {
            return true;
          }
          if (skValue !== undefined && itemSkValue !== undefined && skValue === itemSkValue) {
            return true;
          }
        }
      }

      return false;
    });

    if (duplicateItem) {
      throw new Error(
        `Duplicate item detected in transaction: Table=${tableName}, ${pkName}=${String(pkValue)}, ${skName}=${skValue !== undefined ? String(skValue) : "undefined"}. DynamoDB transactions do not allow multiple operations on the same item.`,
      );
    }
  }

  createKeyForPrimaryIndex(key: PrimaryKeyWithoutExpression) {
    // Turn the pk/sk into the key object
    const keyCondition = {
      [this.indexConfig.partitionKey]: key.pk,
    };

    if (this.indexConfig.sortKey) {
      if (key.sk === undefined) {
        throw new Error("Sort key is required for delete operation");
      }
      keyCondition[this.indexConfig.sortKey] = key.sk;
    }

    return keyCondition;
  }

  /**
   * Adds a put operation to the transaction.
   *
   * The method automatically checks for duplicate items within the transaction
   * to prevent multiple operations on the same item.
   *
   * @example
   * ```typescript
   * // Simple put operation
   * transaction.put('orders', {
   *   orderId: '123',
   *   status: 'PENDING',
   *   amount: 100
   * });
   *
   * // Conditional put operation
   * transaction.put(
   *   'inventory',
   *   { productId: 'ABC', quantity: 50 },
   *   op => op.attributeNotExists('productId')
   * );
   *
   * // Put with complex condition
   * transaction.put(
   *   'users',
   *   { userId: '123', status: 'ACTIVE' },
   *   op => op.and([
   *     op.attributeNotExists('userId'),
   *     op.beginsWith('status', 'ACTIVE')
   *   ])
   * );
   * ```
   *
   * @param tableName - The name of the DynamoDB table
   * @param item - The item to put into the table
   * @param condition - Optional condition that must be satisfied
   * @returns The transaction builder for method chaining
   * @throws {Error} If a duplicate item is detected in the transaction
   */
  put<T extends DynamoItem>(tableName: string, item: T, condition?: Condition): this {
    // Check for duplicate item
    this.checkForDuplicateItem(tableName, item);

    const transactionItem: TransactionItem = {
      type: "Put",
      params: {
        tableName,
        item,
      },
    };

    if (condition) {
      const { expression, names, values } = prepareExpressionParams(condition);
      transactionItem.params.conditionExpression = expression;
      transactionItem.params.expressionAttributeNames = names;
      transactionItem.params.expressionAttributeValues = values;
    }

    this.items.push(transactionItem);
    return this;
  }

  /**
   * Adds a pre-configured put operation to the transaction.
   *
   * This method is particularly useful when working with PutBuilder
   * to maintain consistency in put operations across your application.
   *
   * @example
   * ```typescript
   * // Create a put command with PutBuilder
   * const putCommand = new PutBuilder(executor, newItem, 'users')
   *   .condition(op => op.attributeNotExists('userId'))
   *   .toDynamoCommand();
   *
   * // Add the command to the transaction
   * transaction.putWithCommand(putCommand);
   * ```
   *
   * @param command - The complete put command configuration
   * @returns The transaction builder for method chaining
   * @throws {Error} If a duplicate item is detected in the transaction
   * @see PutBuilder for creating put commands
   */
  putWithCommand(command: PutCommandParams): TransactionBuilder {
    // Check for duplicate item
    this.checkForDuplicateItem(command.tableName, command.item);

    const transactionItem: TransactionItem = {
      type: "Put",
      params: command,
    };

    this.items.push(transactionItem);
    return this;
  }

  /**
   * Adds a delete operation to the transaction.
   *
   * The method automatically checks for duplicate items within the transaction
   * to prevent multiple operations on the same item.
   *
   * @example
   * ```typescript
   * // Simple delete operation
   * transaction.delete('orders', {
   *   pk: 'ORDER#123',
   *   sk: 'METADATA'
   * });
   *
   * // Conditional delete operation
   * transaction.delete(
   *   'users',
   *   { pk: 'USER#123' },
   *   op => op.eq('status', 'INACTIVE')
   * );
   *
   * // Delete with complex condition
   * transaction.delete(
   *   'products',
   *   { pk: 'PROD#ABC' },
   *   op => op.and([
   *     op.eq('status', 'DRAFT'),
   *     op.lt('version', 5)
   *   ])
   * );
   * ```
   *
   * @param tableName - The name of the DynamoDB table
   * @param key - The primary key of the item to delete
   * @param condition - Optional condition that must be satisfied
   * @returns The transaction builder for method chaining
   * @throws {Error} If a duplicate item is detected in the transaction
   */
  delete(tableName: string, key: PrimaryKeyWithoutExpression, condition?: Condition): TransactionBuilder {
    const keyCondition = this.createKeyForPrimaryIndex(key);

    // Check for duplicate item
    this.checkForDuplicateItem(tableName, keyCondition);

    const transactionItem: TransactionItem = {
      type: "Delete",
      params: {
        tableName,
        key: keyCondition,
      },
    };

    if (condition) {
      const { expression, names, values } = prepareExpressionParams(condition);
      transactionItem.params.conditionExpression = expression;
      transactionItem.params.expressionAttributeNames = names;
      transactionItem.params.expressionAttributeValues = values;
    }

    this.items.push(transactionItem);
    return this;
  }

  /**
   * Adds a pre-configured delete operation to the transaction.
   *
   * This method is particularly useful when working with DeleteBuilder
   * to maintain consistency in delete operations across your application.
   *
   * @example
   * ```typescript
   * // Create a delete command with DeleteBuilder
   * const deleteCommand = new DeleteBuilder(executor, 'users', { pk: 'USER#123' })
   *   .condition(op => op.and([
   *     op.attributeExists('pk'),
   *     op.eq('status', 'INACTIVE')
   *   ]))
   *   .toDynamoCommand();
   *
   * // Add the command to the transaction
   * transaction.deleteWithCommand(deleteCommand);
   * ```
   *
   * @param command - The complete delete command configuration
   * @returns The transaction builder for method chaining
   * @throws {Error} If a duplicate item is detected in the transaction
   * @see DeleteBuilder for creating delete commands
   */
  deleteWithCommand(command: DeleteCommandParams): this {
    // The command.key from DeleteBuilder.toDynamoCommand() is in PrimaryKeyWithoutExpression format
    // but DeleteCommandParams expects it to be in the table's actual key format
    // We need to check if it's already converted or needs conversion
    let keyForDuplicateCheck: Record<string, unknown>;
    let keyForTransaction: Record<string, unknown>;

    // Check if the key is in PrimaryKeyWithoutExpression format (has pk/sk properties)
    if (typeof command.key === "object" && command.key !== null && "pk" in command.key) {
      // Convert from PrimaryKeyWithoutExpression to table key format
      keyForTransaction = this.createKeyForPrimaryIndex(command.key as PrimaryKeyWithoutExpression);
      keyForDuplicateCheck = keyForTransaction;
    } else {
      // Key is already in table format
      keyForTransaction = command.key;
      keyForDuplicateCheck = command.key;
    }

    // Check for duplicate item
    this.checkForDuplicateItem(command.tableName, keyForDuplicateCheck);

    const transactionItem: TransactionItem = {
      type: "Delete",
      params: {
        ...command,
        key: keyForTransaction,
      },
    };
    this.items.push(transactionItem);
    return this;
  }

  /**
   * Adds an update operation to the transaction.
   *
   * The method supports all DynamoDB update expressions:
   * - SET: Modify or add attributes
   * - REMOVE: Delete attributes
   * - ADD: Update numbers and sets
   * - DELETE: Remove elements from a set
   *
   * @example
   * ```typescript
   * // Simple update
   * transaction.update(
   *   'orders',
   *   { pk: 'ORDER#123' },
   *   'SET #status = :status',
   *   { '#status': 'status' },
   *   { ':status': 'PROCESSING' }
   * );
   *
   * // Complex update with multiple operations
   * transaction.update(
   *   'products',
   *   { pk: 'PROD#ABC' },
   *   'SET #qty = #qty - :amount, #status = :status REMOVE #oldAttr',
   *   { '#qty': 'quantity', '#status': 'status', '#oldAttr': 'deprecated_field' },
   *   { ':amount': 1, ':status': 'LOW_STOCK' }
   * );
   *
   * // Conditional update
   * transaction.update(
   *   'users',
   *   { pk: 'USER#123' },
   *   'SET #lastLogin = :now',
   *   { '#lastLogin': 'lastLoginDate' },
   *   { ':now': new Date().toISOString() },
   *   op => op.attributeExists('pk')
   * );
   * ```
   *
   * @param tableName - The name of the DynamoDB table
   * @param key - The primary key of the item to update
   * @param updateExpression - The update expression (SET, REMOVE, ADD, DELETE)
   * @param expressionAttributeNames - Map of attribute name placeholders to actual names
   * @param expressionAttributeValues - Map of value placeholders to actual values
   * @param condition - Optional condition that must be satisfied
   * @returns The transaction builder for method chaining
   * @throws {Error} If a duplicate item is detected in the transaction
   */
  update<T extends DynamoItem>(
    tableName: string,
    key: PrimaryKeyWithoutExpression,
    updateExpression: string,
    expressionAttributeNames?: Record<string, string>,
    expressionAttributeValues?: Record<string, unknown>,
    condition?: Condition,
  ): this {
    const keyCondition = this.createKeyForPrimaryIndex(key);

    // Check for duplicate item
    this.checkForDuplicateItem(tableName, keyCondition);

    const transactionItem: TransactionItem = {
      type: "Update",
      params: {
        tableName,
        key: keyCondition,
        updateExpression,
        expressionAttributeNames,
        expressionAttributeValues,
      },
    };

    if (condition) {
      const { expression, names, values } = prepareExpressionParams(condition);
      transactionItem.params.conditionExpression = expression;

      // Merge the condition expression attribute names and values with the update ones
      transactionItem.params.expressionAttributeNames = {
        ...transactionItem.params.expressionAttributeNames,
        ...names,
      };

      transactionItem.params.expressionAttributeValues = {
        ...transactionItem.params.expressionAttributeValues,
        ...values,
      };
    }

    this.items.push(transactionItem);
    return this;
  }

  /**
   * Adds a pre-configured update operation to the transaction.
   *
   * This method is particularly useful when working with UpdateBuilder
   * to maintain consistency in update operations across your application.
   *
   * @example
   * ```typescript
   * // Create an update command with UpdateBuilder
   * const updateCommand = new UpdateBuilder(executor, 'inventory', { pk: 'PROD#ABC' })
   *   .set('quantity', ':qty')
   *   .set('lastUpdated', ':now')
   *   .values({
   *     ':qty': 100,
   *     ':now': new Date().toISOString()
   *   })
   *   .condition(op => op.gt('quantity', 0))
   *   .toDynamoCommand();
   *
   * // Add the command to the transaction
   * transaction.updateWithCommand(updateCommand);
   * ```
   *
   * @param command - The complete update command configuration
   * @returns The transaction builder for method chaining
   * @throws {Error} If a duplicate item is detected in the transaction
   * @see UpdateBuilder for creating update commands
   */
  updateWithCommand(command: UpdateCommandParams): TransactionBuilder {
    // The command.key from UpdateBuilder.toDynamoCommand() is in PrimaryKeyWithoutExpression format
    // but UpdateCommandParams expects it to be in the table's actual key format
    // We need to check if it's already converted or needs conversion
    let keyForDuplicateCheck: Record<string, unknown>;
    let keyForTransaction: Record<string, unknown>;

    // Check if the key is in PrimaryKeyWithoutExpression format (has pk/sk properties)
    if (typeof command.key === "object" && command.key !== null && "pk" in command.key) {
      // Convert from PrimaryKeyWithoutExpression to table key format
      keyForTransaction = this.createKeyForPrimaryIndex(command.key as PrimaryKeyWithoutExpression);
      keyForDuplicateCheck = keyForTransaction;
    } else {
      // Key is already in table format
      keyForTransaction = command.key;
      keyForDuplicateCheck = command.key;
    }

    // Check for duplicate item
    this.checkForDuplicateItem(command.tableName, keyForDuplicateCheck);

    const transactionItem: TransactionItem = {
      type: "Update",
      params: {
        ...command,
        key: keyForTransaction,
      },
    };

    this.items.push(transactionItem);
    return this;
  }

  /**
   * Adds a condition check operation to the transaction.
   *
   * Condition checks are particularly useful for:
   * - Implementing optimistic locking
   * - Ensuring referential integrity
   * - Validating business rules atomically
   *
   * @example
   * ```typescript
   * // Check if order is in correct state
   * transaction.conditionCheck(
   *   'orders',
   *   { pk: 'ORDER#123' },
   *   op => op.eq('status', 'PENDING')
   * );
   *
   * // Complex condition check
   * transaction.conditionCheck(
   *   'inventory',
   *   { pk: 'PROD#ABC' },
   *   op => op.and([
   *     op.gt('quantity', 0),
   *     op.eq('status', 'ACTIVE'),
   *     op.attributeExists('lastRestockDate')
   *   ])
   * );
   *
   * // Check with multiple attributes
   * transaction.conditionCheck(
   *   'users',
   *   { pk: 'USER#123' },
   *   op => op.or([
   *     op.eq('status', 'PREMIUM'),
   *     op.gte('credits', 100)
   *   ])
   * );
   * ```
   *
   * @param tableName - The name of the DynamoDB table
   * @param key - The primary key of the item to check
   * @param condition - The condition that must be satisfied
   * @returns The transaction builder for method chaining
   * @throws {Error} If a duplicate item is detected in the transaction
   * @throws {Error} If condition expression generation fails
   */
  conditionCheck(tableName: string, key: PrimaryKeyWithoutExpression, condition: Condition): TransactionBuilder {
    const keyCondition = this.createKeyForPrimaryIndex(key);

    // Check for duplicate item
    this.checkForDuplicateItem(tableName, keyCondition);

    const { expression, names, values } = prepareExpressionParams(condition);

    if (!expression) {
      throw new Error("Failed to generate condition expression");
    }

    const transactionItem: TransactionItem = {
      type: "ConditionCheck",
      params: {
        tableName,
        key: keyCondition,
        conditionExpression: expression,
        expressionAttributeNames: names,
        expressionAttributeValues: values,
      },
    };

    this.items.push(transactionItem);
    return this;
  }

  /**
   * Adds a pre-configured condition check operation to the transaction.
   *
   * This method is particularly useful when working with ConditionCheckBuilder
   * to maintain consistency in condition checks across your application.
   *
   * @example
   * ```typescript
   * // Create a condition check with ConditionCheckBuilder
   * const checkCommand = new ConditionCheckBuilder('inventory', { pk: 'PROD#ABC' })
   *   .condition(op => op.and([
   *     op.between('quantity', 10, 100),
   *     op.beginsWith('category', 'ELECTRONICS'),
   *     op.attributeExists('lastAuditDate')
   *   ]))
   *   .toDynamoCommand();
   *
   * // Add the command to the transaction
   * transaction.conditionCheckWithCommand(checkCommand);
   * ```
   *
   * @param command - The complete condition check command configuration
   * @returns The transaction builder for method chaining
   * @throws {Error} If a duplicate item is detected in the transaction
   * @see ConditionCheckBuilder for creating condition check commands
   */
  conditionCheckWithCommand(command: ConditionCheckCommandParams): TransactionBuilder {
    // The command.key from ConditionCheckBuilder.toDynamoCommand() is in PrimaryKeyWithoutExpression format
    // but ConditionCheckCommandParams expects it to be in the table's actual key format
    // We need to check if it's already converted or needs conversion
    let keyForDuplicateCheck: Record<string, unknown>;
    let keyForTransaction: Record<string, unknown>;

    // Check if the key is in PrimaryKeyWithoutExpression format (has pk/sk properties)
    if (typeof command.key === "object" && command.key !== null && "pk" in command.key) {
      // Convert from PrimaryKeyWithoutExpression to table key format
      keyForTransaction = this.createKeyForPrimaryIndex(command.key as PrimaryKeyWithoutExpression);
      keyForDuplicateCheck = keyForTransaction;
    } else {
      // Key is already in table format
      keyForTransaction = command.key;
      keyForDuplicateCheck = command.key;
    }

    // Check for duplicate item
    this.checkForDuplicateItem(command.tableName, keyForDuplicateCheck);

    const transactionItem: TransactionItem = {
      type: "ConditionCheck",
      params: {
        ...command,
        key: keyForTransaction,
      },
    };
    this.items.push(transactionItem);
    return this;
  }

  /**
   * Sets options for the transaction execution.
   *
   * @example
   * ```typescript
   * // Enable idempotency and capacity tracking
   * transaction.withOptions({
   *   clientRequestToken: 'unique-request-id-123',
   *   returnConsumedCapacity: 'TOTAL'
   * });
   *
   * // Track item collection metrics
   * transaction.withOptions({
   *   returnItemCollectionMetrics: 'SIZE'
   * });
   * ```
   *
   * Note: ClientRequestToken can be used to make transactions idempotent,
   * ensuring the same transaction is not executed multiple times.
   *
   * @param options - Configuration options for the transaction
   * @returns The transaction builder for method chaining
   */
  withOptions(options: TransactionOptions): TransactionBuilder {
    this.options = { ...this.options, ...options };
    return this;
  }

  /**
   * Gets a human-readable representation of the transaction items.
   *
   * The method resolves all expression placeholders with their actual values,
   * making it easier to understand the transaction's operations.
   *
   * @example
   * ```typescript
   * // Add multiple operations
   * transaction
   *   .put('orders', { orderId: '123', status: 'PENDING' })
   *   .update('inventory',
   *     { productId: 'ABC' },
   *     'SET quantity = quantity - :amount',
   *     undefined,
   *     { ':amount': 1 }
   *   );
   *
   * // Debug the transaction
   * const debugInfo = transaction.debug();
   * console.log('Transaction operations:', debugInfo);
   * ```
   *
   * @returns An array of readable representations of the transaction items
   */
  debug() {
    return debugTransaction(this.items);
  }

  /**
   * Executes all operations in the transaction atomically.
   *
   * The transaction will only succeed if all operations succeed.
   * If any operation fails, the entire transaction is rolled back.
   *
   * @example
   * ```typescript
   * try {
   *   // Build and execute transaction
   *   await transaction
   *     .put('orders', newOrder)
   *     .update('inventory',
   *       { productId: 'ABC' },
   *       'SET quantity = quantity - :qty',
   *       undefined,
   *       { ':qty': 1 }
   *     )
   *     .conditionCheck('products',
   *       { productId: 'ABC' },
   *       op => op.eq('status', 'ACTIVE')
   *     )
   *     .execute();
   *
   *   console.log('Transaction completed successfully');
   * } catch (error) {
   *   // Handle transaction failure
   *   console.error('Transaction failed:', error);
   * }
   * ```
   *
   * @throws {Error} If no transaction items are specified
   * @throws {Error} If any operation in the transaction fails
   * @returns A promise that resolves when the transaction completes
   */
  async execute(): Promise<void> {
    if (this.items.length === 0) {
      throw new Error("No transaction items specified");
    }

    const transactItems = this.items.map((item) => {
      switch (item.type) {
        case "Put":
          return {
            Put: {
              TableName: item.params.tableName,
              Item: item.params.item,
              ConditionExpression: item.params.conditionExpression,
              ExpressionAttributeNames: item.params.expressionAttributeNames,
              ExpressionAttributeValues: item.params.expressionAttributeValues,
            },
          };
        case "Delete":
          return {
            Delete: {
              TableName: item.params.tableName,
              Key: item.params.key,
              ConditionExpression: item.params.conditionExpression,
              ExpressionAttributeNames: item.params.expressionAttributeNames,
              ExpressionAttributeValues: item.params.expressionAttributeValues,
            },
          };
        case "Update":
          return {
            Update: {
              TableName: item.params.tableName,
              Key: item.params.key,
              UpdateExpression: item.params.updateExpression,
              ConditionExpression: item.params.conditionExpression,
              ExpressionAttributeNames: item.params.expressionAttributeNames,
              ExpressionAttributeValues: item.params.expressionAttributeValues,
            },
          };
        case "ConditionCheck":
          return {
            ConditionCheck: {
              TableName: item.params.tableName,
              Key: item.params.key,
              ConditionExpression: item.params.conditionExpression,
              ExpressionAttributeNames: item.params.expressionAttributeNames,
              ExpressionAttributeValues: item.params.expressionAttributeValues,
            },
          };
        default: {
          // This should never happen as we've covered all cases in the union type
          const exhaustiveCheck: never = item;
          throw new Error(`Unsupported transaction item type: ${String(exhaustiveCheck)}`);
        }
      }
    });

    const params: TransactWriteCommandInput = {
      TransactItems: transactItems,
      ClientRequestToken: this.options.clientRequestToken,
      ReturnConsumedCapacity: this.options.returnConsumedCapacity,
      ReturnItemCollectionMetrics: this.options.returnItemCollectionMetrics,
    };

    try {
      await this.executor(params);
    } catch (error) {
      console.log(this.debug());
      console.error("Error executing transaction:", error);
      throw error;
    }
  }
}
