import type { Condition, ConditionOperator, PrimaryKeyWithoutExpression } from "../conditions";
import {
  eq,
  ne,
  lt,
  lte,
  gt,
  gte,
  between,
  inArray,
  beginsWith,
  contains,
  attributeExists,
  attributeNotExists,
  and,
  or,
  not,
} from "../conditions";
import type { Path, PathType } from "./types";
import type { TransactionBuilder } from "./transaction-builder";
import { buildExpression, generateAttributeName, generateValueName } from "../expression";
import { debugCommand } from "../utils/debug-expression";
import type { UpdateCommandParams } from "./builder-types";
import type { DynamoItem } from "../types";

/**
 * Configuration options for DynamoDB update operations.
 */
export interface UpdateOptions {
  /** Optional condition that must be satisfied for the update to succeed */
  condition?: Condition;
  /** Determines which item attributes to include in the response */
  returnValues?: "ALL_NEW" | "UPDATED_NEW" | "ALL_OLD" | "UPDATED_OLD" | "NONE";
}

/**
 * Function type for executing DynamoDB update operations.
 * @typeParam T - The type of the item being updated
 */
type UpdateExecutor<T extends DynamoItem> = (params: UpdateCommandParams) => Promise<{ item?: T }>;

/**
 * Represents a single update action within an update operation.
 * Each action modifies the item in a specific way:
 * - SET: Modify or add attributes
 * - REMOVE: Delete attributes
 * - ADD: Update numbers and sets
 * - DELETE: Remove elements from a set
 */
export type UpdateAction = {
  /** The type of update action */
  type: "SET" | "REMOVE" | "ADD" | "DELETE";
  /** The attribute path to update */
  path: string;
  /** The value to use in the update (not used for REMOVE actions) */
  value?: unknown;
};

/**
 * Type utility to get the element type of a set.
 * Extracts the element type from either a Set or Array type.
 * @typeParam T - The set or array type
 */
type SetElementType<T> = T extends Set<infer U> ? U : T extends Array<infer U> ? U : never;

/**
 * Type utility to get the element type from a path that points to a set.
 * Combines PathType and SetElementType to get the element type at a specific path.
 * @typeParam T - The type of the item
 * @typeParam K - The path within the item
 */
type PathSetElementType<T, K extends Path<T>> = SetElementType<PathType<T, K>>;

/**
 * Builder for creating DynamoDB update operations.
 *
 * The builder supports all DynamoDB update operations:
 * - SET: Modify or add attributes
 * - REMOVE: Delete attributes
 * - ADD: Update numbers and sets
 * - DELETE: Remove elements from a set
 *
 * @example
 * ```typescript
 * // Simple update
 * const result = await new UpdateBuilder(executor, 'dinosaurs', { id: 'TREX-001' })
 *   .set('status', 'HUNTING')
 *   .set('lastFed', new Date().toISOString())
 *   .execute();
 *
 * // Complex update with multiple operations
 * const result = await new UpdateBuilder(executor, 'habitats', { id: 'PADDOCK-A' })
 *   .set({
 *     status: 'OCCUPIED',
 *     occupants: 3,
 *     'metadata.lastInspection': new Date().toISOString()
 *   })
 *   .add('securityBreaches', 1)
 *   .deleteElementsFromSet('suitableDinosaurs', ['VELOCIRAPTOR'])
 *   .condition(op => op.gt('securityLevel', 8))
 *   .returnValues('ALL_NEW')
 *   .execute();
 * ```
 *
 * @typeParam T - The type of item being updated
 */
export class UpdateBuilder<T extends DynamoItem> {
  private updates: UpdateAction[] = [];
  private options: UpdateOptions = {
    returnValues: "ALL_NEW",
  };
  private readonly executor: UpdateExecutor<T>;
  private readonly tableName: string;
  private readonly key: PrimaryKeyWithoutExpression;

  constructor(executor: UpdateExecutor<T>, tableName: string, key: PrimaryKeyWithoutExpression) {
    this.executor = executor;
    this.tableName = tableName;
    this.key = key;
  }

  /**
   * Sets multiple attributes of an item using an object.
   *
   * @example
   * ```typescript
   * // Update multiple attributes
   * builder.set({
   *   species: 'Tyrannosaurus Rex',
   *   height: 20,
   *   diet: 'CARNIVORE',
   *   'stats.threatLevel': 10
   * });
   * ```
   */
  set(values: Partial<T>): UpdateBuilder<T>;

  /**
   * Sets a single attribute to a specific value.
   *
   * @example
   * ```typescript
   * // Set simple attributes
   * builder
   *   .set('status', 'SLEEPING')
   *   .set('lastFeeding', new Date().toISOString());
   *
   * // Set nested attributes
   * builder
   *   .set('location.zone', 'RESTRICTED')
   *   .set('stats.health', 100);
   * ```
   */
  set<K extends Path<T>>(path: K, value: PathType<T, K>): UpdateBuilder<T>;
  set<K extends Path<T>>(valuesOrPath: K | Partial<T>, value?: PathType<T, K>): this {
    if (typeof valuesOrPath === "object") {
      for (const [key, value] of Object.entries(valuesOrPath)) {
        this.updates.push({
          type: "SET",
          path: key,
          value,
        });
      }
    } else {
      this.updates.push({
        type: "SET",
        path: valuesOrPath,
        value,
      });
    }

    return this;
  }

  /**
   * Removes an attribute from the item.
   *
   * @example
   * ```typescript
   * // Remove simple attributes
   * builder
   *   .remove('temporaryTag')
   *   .remove('previousLocation');
   *
   * // Remove nested attributes
   * builder
   *   .remove('metadata.testData')
   *   .remove('stats.experimentalMetrics');
   * ```
   *
   * @param path - The path to the attribute to remove
   * @returns The builder instance for method chaining
   */
  remove<K extends Path<T>>(path: K): this {
    this.updates.push({
      type: "REMOVE",
      path,
    });
    return this;
  }

  /**
   * Adds a value to a number attribute or adds elements to a set.
   *
   * @example
   * ```typescript
   * // Increment counters
   * builder
   *   .add('escapeAttempts', 1)
   *   .add('feedingCount', 1);
   *
   * // Add to sets
   * builder
   *   .add('knownBehaviors', new Set(['PACK_HUNTING', 'AMBUSH_TACTICS']))
   *   .add('visitedZones', new Set(['ZONE_A', 'ZONE_B']));
   * ```
   *
   * @param path - The path to the attribute to update
   * @param value - The value to add (number or set)
   * @returns The builder instance for method chaining
   */
  add<K extends Path<T>>(path: K, value: PathType<T, K>): this {
    this.updates.push({
      type: "ADD",
      path,
      value,
    });
    return this;
  }

  /**
   * Removes elements from a set attribute.
   *
   * @example
   * ```typescript
   * // Remove from sets using arrays
   * builder.deleteElementsFromSet(
   *   'allowedHabitats',
   *   ['JUNGLE', 'COASTAL']
   * );
   *
   * // Remove from sets using Set DynamoItems
   * builder.deleteElementsFromSet(
   *   'knownBehaviors',
   *   new Set(['NOCTURNAL', 'TERRITORIAL'])
   * );
   *
   * // Remove from nested sets
   * builder.deleteElementsFromSet(
   *   'stats.compatibleSpecies',
   *   ['VELOCIRAPTOR', 'DILOPHOSAURUS']
   * );
   * ```
   *
   * @param path - The path to the set attribute
   * @param value - Elements to remove (array or Set)
   * @returns The builder instance for method chaining
   */
  deleteElementsFromSet<K extends Path<T>>(
    path: K,
    value: PathSetElementType<T, K>[] | Set<PathSetElementType<T, K>>,
  ): this {
    let valuesToDelete: Set<PathSetElementType<T, K>>;

    if (Array.isArray(value)) {
      valuesToDelete = new Set(value);
    } else {
      valuesToDelete = value;
    }

    this.updates.push({
      type: "DELETE",
      path,
      value: valuesToDelete,
    });
    return this;
  }

  /**
   * Adds a condition that must be satisfied for the update to succeed.
   *
   * @example
   * ```typescript
   * // Simple condition
   * builder.condition(op =>
   *   op.eq('status', 'ACTIVE')
   * );
   *
   * // Health check condition
   * builder.condition(op =>
   *   op.and([
   *     op.gt('health', 50),
   *     op.eq('status', 'HUNTING')
   *   ])
   * );
   *
   * // Complex security condition
   * builder.condition(op =>
   *   op.and([
   *     op.attributeExists('securitySystem'),
   *     op.eq('containmentStatus', 'SECURE'),
   *     op.lt('aggressionLevel', 8)
   *   ])
   * );
   *
   * // Version check (optimistic locking)
   * builder.condition(op =>
   *   op.eq('version', currentVersion)
   * );
   * ```
   *
   * @param condition - Either a Condition DynamoItem or a callback function that builds the condition
   * @returns The builder instance for method chaining
   */
  condition(condition: Condition | ((op: ConditionOperator<T>) => Condition)): this {
    if (typeof condition === "function") {
      const conditionOperator: ConditionOperator<T> = {
        eq,
        ne,
        lt,
        lte,
        gt,
        gte,
        between,
        inArray,
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
   * Sets which item attributes to include in the response.
   *
   * Available options:
   * - ALL_NEW: All attributes after the update
   * - UPDATED_NEW: Only updated attributes, new values
   * - ALL_OLD: All attributes before the update
   * - UPDATED_OLD: Only updated attributes, old values
   * - NONE: No attributes returned (default)
   *
   * @example
   * ```typescript
   * // Get complete updated dinosaur
   * const result = await builder
   *   .set('status', 'SLEEPING')
   *   .returnValues('ALL_NEW')
   *   .execute();
   *
   * // Track specific attribute changes
   * const result = await builder
   *   .set({
   *     'stats.health': 100,
   *     'stats.energy': 95
   *   })
   *   .returnValues('UPDATED_OLD')
   *   .execute();
   *
   * if (result.item) {
   *   console.log('Previous health:', result.item.stats?.health);
   * }
   * ```
   *
   * @param returnValues - Which attributes to return in the response
   * @returns The builder instance for method chaining
   */
  returnValues(returnValues: "ALL_NEW" | "UPDATED_NEW" | "ALL_OLD" | "UPDATED_OLD" | "NONE"): this {
    this.options.returnValues = returnValues;
    return this;
  }

  /**
   * Generate the DynamoDB command parameters
   */
  toDynamoCommand(): UpdateCommandParams {
    if (this.updates.length === 0) {
      throw new Error("No update actions specified");
    }

    const expressionParams: {
      expressionAttributeNames: Record<string, string>;
      expressionAttributeValues: DynamoItem;
      valueCounter: { count: number };
    } = {
      expressionAttributeNames: {},
      expressionAttributeValues: {},
      valueCounter: { count: 0 },
    };

    // Build the update expression
    let updateExpression = "";

    // Group updates by type
    const setUpdates: UpdateAction[] = [];
    const removeUpdates: UpdateAction[] = [];
    const addUpdates: UpdateAction[] = [];
    const deleteUpdates: UpdateAction[] = [];

    for (const update of this.updates) {
      switch (update.type) {
        case "SET":
          setUpdates.push(update);
          break;
        case "REMOVE":
          removeUpdates.push(update);
          break;
        case "ADD":
          addUpdates.push(update);
          break;
        case "DELETE":
          deleteUpdates.push(update);
          break;
      }
    }

    // Build SET clause
    if (setUpdates.length > 0) {
      updateExpression += "SET ";
      updateExpression += setUpdates
        .map((update) => {
          const attrName = generateAttributeName(expressionParams, update.path);
          const valueName = generateValueName(expressionParams, update.value);
          expressionParams.expressionAttributeValues[valueName] = update.value;
          return `${attrName} = ${valueName}`;
        })
        .join(", ");
    }

    // Build REMOVE clause
    if (removeUpdates.length > 0) {
      if (updateExpression) {
        updateExpression += " ";
      }
      updateExpression += "REMOVE ";
      updateExpression += removeUpdates
        .map((update) => {
          return generateAttributeName(expressionParams, update.path);
        })
        .join(", ");
    }

    // Build ADD clause
    if (addUpdates.length > 0) {
      if (updateExpression) {
        updateExpression += " ";
      }
      updateExpression += "ADD ";
      updateExpression += addUpdates
        .map((update) => {
          const attrName = generateAttributeName(expressionParams, update.path);
          const valueName = generateValueName(expressionParams, update.value);

          return `${attrName} ${valueName}`;
        })
        .join(", ");
    }

    // Build DELETE clause
    if (deleteUpdates.length > 0) {
      if (updateExpression) {
        updateExpression += " ";
      }

      updateExpression += "DELETE ";
      updateExpression += deleteUpdates
        .map((update) => {
          const attrName = generateAttributeName(expressionParams, update.path);
          const valueName = generateValueName(expressionParams, update.value);

          return `${attrName} ${valueName}`;
        })
        .join(", ");
    }

    // Build condition expression if provided
    let conditionExpression: string | undefined;
    if (this.options.condition) {
      conditionExpression = buildExpression(this.options.condition, expressionParams);
    }

    const { expressionAttributeNames, expressionAttributeValues } = expressionParams;

    return {
      tableName: this.tableName,
      key: this.key,
      updateExpression,
      conditionExpression,
      expressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      expressionAttributeValues:
        Object.keys(expressionAttributeValues).length > 0 ? expressionAttributeValues : undefined,
      returnValues: this.options.returnValues,
    };
  }

  /**
   * Adds this update operation to a transaction.
   *
   * @example
   * ```typescript
   * const transaction = new TransactionBuilder(executor);
   *
   * // Update dinosaur status and habitat occupancy atomically
   * new UpdateBuilder(executor, 'dinosaurs', { id: 'TREX-001' })
   *   .set('location', 'PADDOCK_A')
   *   .set('status', 'CONTAINED')
   *   .withTransaction(transaction);
   *
   * new UpdateBuilder(executor, 'habitats', { id: 'PADDOCK-A' })
   *   .add('occupants', 1)
   *   .set('lastOccupied', new Date().toISOString())
   *   .withTransaction(transaction);
   *
   * // Execute all operations atomically
   * await transaction.execute();
   * ```
   *
   * @param transaction - The transaction builder to add this operation to
   * @returns The builder instance for method chaining
   */
  withTransaction(transaction: TransactionBuilder) {
    const command = this.toDynamoCommand();
    transaction.updateWithCommand(command);
  }

  /**
   * Gets a human-readable representation of the update command.
   *
   * @example
   * ```typescript
   * // Create complex update
   * const builder = new UpdateBuilder(executor, 'dinosaurs', { id: 'RAPTOR-001' })
   *   .set({
   *     status: 'HUNTING',
   *     'stats.health': 95,
   *     'behavior.lastObserved': new Date().toISOString()
   *   })
   *   .add('huntingSuccesses', 1)
   *   .condition(op => op.gt('health', 50));
   *
   * // Debug the update
   * const debugInfo = builder.debug();
   * console.log('Update operation:', debugInfo);
   * ```
   *
   * @returns A readable representation of the update command with resolved expressions
   */
  debug(): DynamoItem {
    const command = this.toDynamoCommand();
    return debugCommand(command);
  }

  /**
   * Executes the update operation against DynamoDB.
   *
   * @example
   * ```typescript
   * try {
   *   // Update dinosaur status with conditions
   *   const result = await new UpdateBuilder(executor, 'dinosaurs', { id: 'TREX-001' })
   *     .set({
   *       status: 'FEEDING',
   *       lastMeal: new Date().toISOString(),
   *       'stats.hunger': 0
   *     })
   *     .add('feedingCount', 1)
   *     .condition(op =>
   *       op.and([
   *         op.gt('stats.hunger', 80),
   *         op.eq('status', 'HUNTING')
   *       ])
   *     )
   *     .returnValues('ALL_NEW')
   *     .execute();
   *
   *   if (result.item) {
   *     console.log('Updated dinosaur:', result.item);
   *   }
   * } catch (error) {
   *   // Handle condition check failure
   *   console.error('Failed to update dinosaur:', error);
   *   // Check if dinosaur wasn't hungry enough
   *   if (error.name === 'ConditionalCheckFailedException') {
   *     console.log('Dinosaur not ready for feeding');
   *   }
   * }
   * ```
   *
   * @returns A promise that resolves to an DynamoItem containing the updated item (if returnValues is set)
   * @throws {ConditionalCheckFailedException} If the condition check fails
   * @throws {Error} If the update operation fails for other reasons
   */
  async execute(): Promise<{ item?: T }> {
    const params = this.toDynamoCommand();
    return this.executor(params);
  }
}
