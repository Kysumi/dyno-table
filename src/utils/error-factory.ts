import {
  BatchError,
  ConfigurationError,
  EntityValidationError,
  ErrorCodes,
  ExpressionError,
  IndexGenerationError,
  KeyGenerationError,
  OperationError,
  TransactionError,
  ValidationError,
} from "../errors";

/**
 * Factory functions for Expression errors
 */
export const ExpressionErrors = {
  missingAttribute: (conditionType: string, condition: unknown) =>
    new ExpressionError(
      `Attribute is required for ${conditionType} condition`,
      ErrorCodes.EXPRESSION_MISSING_ATTRIBUTE,
      {
        conditionType,
        condition,
        suggestion: "Ensure the condition includes an attribute name",
      },
    ),

  missingValue: (conditionType: string, condition: unknown) =>
    new ExpressionError(`Value is required for ${conditionType} condition`, ErrorCodes.EXPRESSION_MISSING_VALUE, {
      conditionType,
      condition,
      suggestion: "Provide a value for the condition",
    }),

  invalidCondition: (conditionType: string, condition: unknown, suggestion?: string) =>
    new ExpressionError(`Invalid condition for ${conditionType}`, ErrorCodes.EXPRESSION_INVALID_CONDITION, {
      conditionType,
      condition,
      suggestion: suggestion || "Check that the condition is properly formed",
    }),

  emptyArray: (conditionType: string, providedValue: unknown) =>
    new ExpressionError(
      `${conditionType} condition requires a non-empty array of values`,
      ErrorCodes.EXPRESSION_EMPTY_ARRAY,
      {
        conditionType,
        providedValue,
        suggestion: "Provide at least one value in the array",
      },
    ),

  unknownType: (conditionType: string, condition: unknown) =>
    new ExpressionError(`Unknown condition type: ${conditionType}`, ErrorCodes.EXPRESSION_UNKNOWN_TYPE, {
      conditionType,
      condition,
      suggestion: "Use a supported condition type from the query builder",
    }),
};

/**
 * Factory functions for Validation errors
 */
export const ValidationErrors = {
  noUpdateActions: (tableName: string, key: Record<string, unknown>) =>
    new ValidationError("No update actions specified", ErrorCodes.NO_UPDATE_ACTIONS, {
      tableName,
      key,
      suggestion: "Use set(), remove(), add(), or delete() to specify update actions",
    }),

  conditionRequired: (tableName: string, key: Record<string, unknown>) =>
    new ValidationError("Condition is required for condition check operations", ErrorCodes.CONDITION_REQUIRED, {
      tableName,
      key,
      suggestion: "Use the condition() method to specify a condition",
    }),

  queryInputValidationFailed: (
    entityName: string,
    queryName: string,
    validationIssues: unknown,
    providedInput: unknown,
  ) =>
    new ValidationError(
      `Query input validation failed for "${queryName}" on entity "${entityName}"`,
      ErrorCodes.QUERY_INPUT_VALIDATION_FAILED,
      {
        entityName,
        queryName,
        validationIssues,
        providedInput,
        suggestion: "Ensure the query input matches the expected schema",
      },
    ),

  undefinedValue: (path: string, tableName: string, key: Record<string, unknown>) =>
    new ValidationError(`Cannot set undefined value for attribute "${path}"`, ErrorCodes.UNDEFINED_VALUE, {
      path,
      tableName,
      key,
      suggestion:
        "DynamoDB does not support undefined values. Use remove() to delete an attribute, or provide a valid value (null, string, number, etc.)",
    }),
};

/**
 * Factory functions for Configuration errors
 */
export const ConfigurationErrors = {
  sortKeyRequired: (tableName: string, partitionKey: string, sortKey?: string) =>
    new ConfigurationError("Sort key is required for this operation", ErrorCodes.SORT_KEY_REQUIRED, {
      tableName,
      partitionKey,
      sortKey,
      suggestion: "Provide a sort key value or use a table with only a partition key",
    }),

  sortKeyNotDefined: (tableName: string, partitionKey: string, indexName?: string) =>
    new ConfigurationError("Sort key is not defined for this table/index", ErrorCodes.SORT_KEY_NOT_DEFINED, {
      tableName,
      partitionKey,
      indexName,
      suggestion: "This operation requires a table/index with a sort key defined",
    }),

  gsiNotFound: (indexName: string, tableName: string, availableIndexes: string[]) =>
    new ConfigurationError(`GSI "${indexName}" not found in table configuration`, ErrorCodes.GSI_NOT_FOUND, {
      indexName,
      tableName,
      availableIndexes,
      suggestion: `Use one of the available indexes: ${availableIndexes.join(", ")}`,
    }),

  primaryKeyMissing: (tableName: string, partitionKeyName: string, providedItem: unknown) =>
    new ConfigurationError(`Primary key value for '${partitionKeyName}' is missing`, ErrorCodes.PRIMARY_KEY_MISSING, {
      tableName,
      partitionKeyName,
      providedItem,
      suggestion: `Ensure the item includes a value for '${partitionKeyName}'`,
    }),

  pkExtractionFailed: (tableName: string, indexName: string, item: unknown, cause?: Error) =>
    new ConfigurationError(
      `Failed to extract partition key from item for index "${indexName}"`,
      ErrorCodes.PK_EXTRACTION_FAILED,
      {
        tableName,
        indexName,
        item,
        suggestion: "Ensure the item has the required partition key attribute",
      },
      cause,
    ),

  conditionGenerationFailed: (condition: unknown, suggestion?: string) =>
    new ExpressionError("Failed to generate condition expression", ErrorCodes.CONDITION_GENERATION_FAILED, {
      condition,
      suggestion: suggestion || "Check that the condition is properly formed",
    }),
};

/**
 * Factory functions for Operation errors
 */
export const OperationErrors = {
  queryFailed: (tableName: string, context: Record<string, unknown>, cause?: Error) =>
    new OperationError(
      `Query operation failed on table "${tableName}"`,
      ErrorCodes.QUERY_FAILED,
      {
        tableName,
        operation: "query",
        ...context,
      },
      cause,
    ),

  scanFailed: (tableName: string, context: Record<string, unknown>, cause?: Error) =>
    new OperationError(
      `Scan operation failed on table "${tableName}"`,
      ErrorCodes.SCAN_FAILED,
      {
        tableName,
        operation: "scan",
        ...context,
      },
      cause,
    ),

  getFailed: (tableName: string, key: Record<string, unknown>, cause?: Error) =>
    new OperationError(
      `Get operation failed on table "${tableName}"`,
      ErrorCodes.GET_FAILED,
      {
        tableName,
        operation: "get",
        key,
      },
      cause,
    ),

  putFailed: (tableName: string, item: unknown, cause?: Error) =>
    new OperationError(
      `Put operation failed on table "${tableName}"`,
      ErrorCodes.PUT_FAILED,
      {
        tableName,
        operation: "put",
        item,
      },
      cause,
    ),

  updateFailed: (tableName: string, key: Record<string, unknown>, cause?: Error) =>
    new OperationError(
      `Update operation failed on table "${tableName}"`,
      ErrorCodes.UPDATE_FAILED,
      {
        tableName,
        operation: "update",
        key,
      },
      cause,
    ),

  deleteFailed: (tableName: string, key: Record<string, unknown>, cause?: Error) =>
    new OperationError(
      `Delete operation failed on table "${tableName}"`,
      ErrorCodes.DELETE_FAILED,
      {
        tableName,
        operation: "delete",
        key,
      },
      cause,
    ),

  batchGetFailed: (tableName: string, context: Record<string, unknown>, cause?: Error) =>
    new OperationError(
      `Batch get operation failed on table "${tableName}"`,
      ErrorCodes.BATCH_GET_FAILED,
      {
        tableName,
        operation: "batchGet",
        ...context,
      },
      cause,
    ),

  batchWriteFailed: (tableName: string, context: Record<string, unknown>, cause?: Error) =>
    new OperationError(
      `Batch write operation failed on table "${tableName}"`,
      ErrorCodes.BATCH_WRITE_FAILED,
      {
        tableName,
        operation: "batchWrite",
        ...context,
      },
      cause,
    ),
};

/**
 * Factory functions for Transaction errors
 */
export const TransactionErrors = {
  transactionFailed: (itemCount: number, context: Record<string, unknown>, cause?: Error) =>
    new TransactionError(
      `Transaction failed with ${itemCount} item(s)`,
      ErrorCodes.TRANSACTION_FAILED,
      {
        itemCount,
        ...context,
      },
      cause,
    ),

  duplicateItem: (
    tableName: string,
    partitionKey: { name: string; value: unknown },
    sortKey?: { name: string; value: unknown },
  ) =>
    new TransactionError("Duplicate item detected in transaction", ErrorCodes.TRANSACTION_DUPLICATE_ITEM, {
      tableName,
      partitionKey,
      sortKey,
      suggestion: "Each item in a transaction must be unique. Check for duplicate keys in your transaction items.",
    }),

  transactionEmpty: () =>
    new TransactionError("No transaction items specified", ErrorCodes.TRANSACTION_EMPTY, {
      suggestion: "Add at least one operation using put(), delete(), update(), or conditionCheck()",
    }),

  unsupportedType: (item: unknown) =>
    new TransactionError("Unsupported transaction item type", ErrorCodes.TRANSACTION_UNSUPPORTED_TYPE, {
      item,
      suggestion: "Transaction items must be created using put(), delete(), update(), or conditionCheck()",
    }),
};

/**
 * Factory functions for Batch errors
 */
export const BatchErrors = {
  batchEmpty: (operation: "write" | "read") =>
    new BatchError(`No items specified for batch ${operation} operation`, ErrorCodes.BATCH_EMPTY, operation, [], {
      suggestion:
        operation === "write"
          ? "Use put() or delete() to add items to the batch"
          : "Use get() to add keys to the batch",
    }),

  unsupportedType: (operation: "write" | "read", item: unknown) =>
    new BatchError(`Unsupported batch ${operation} item type`, ErrorCodes.BATCH_UNSUPPORTED_TYPE, operation, [], {
      item,
      suggestion:
        operation === "write" ? "Batch items must be put or delete operations" : "Batch items must be get operations",
    }),

  batchWriteFailed: (unprocessedItems: unknown[], context: Record<string, unknown>, cause?: Error) =>
    new BatchError(
      `Batch write failed with ${unprocessedItems.length} unprocessed item(s)`,
      ErrorCodes.BATCH_WRITE_FAILED,
      "write",
      unprocessedItems,
      context,
      cause,
    ),

  batchGetFailed: (unprocessedItems: unknown[], context: Record<string, unknown>, cause?: Error) =>
    new BatchError(
      `Batch get failed with ${unprocessedItems.length} unprocessed item(s)`,
      ErrorCodes.BATCH_GET_FAILED,
      "read",
      unprocessedItems,
      context,
      cause,
    ),
};

/**
 * Factory functions for Entity errors
 */
export const EntityErrors = {
  validationFailed: (entityName: string, operation: string, validationIssues: unknown, providedData: unknown) =>
    new EntityValidationError(
      `Validation failed for entity "${entityName}" during ${operation} operation`,
      ErrorCodes.ENTITY_VALIDATION_FAILED,
      {
        entityName,
        operation,
        validationIssues,
        providedData,
        suggestion: "Check that all required fields are provided and match the schema",
      },
    ),

  queryInputValidationFailed: (
    entityName: string,
    queryName: string,
    validationIssues: unknown,
    providedInput: unknown,
  ) =>
    new EntityValidationError(
      `Query input validation failed for "${queryName}" on entity "${entityName}"`,
      ErrorCodes.QUERY_INPUT_VALIDATION_FAILED,
      {
        entityName,
        queryName,
        validationIssues,
        providedInput,
        suggestion: "Ensure the query input matches the expected schema",
      },
    ),

  asyncValidationNotSupported: (entityName: string, operation: string) =>
    new EntityValidationError(
      `Entity "${entityName}" uses async validation which is not supported in transactions/batches`,
      ErrorCodes.ASYNC_VALIDATION_NOT_SUPPORTED,
      {
        entityName,
        operation,
        suggestion: "Use .execute() for async validation or switch to synchronous schema validation",
      },
    ),

  keyGenerationFailed: (
    entityName: string,
    operation: string,
    providedData: unknown,
    requiredAttributes?: string[],
    cause?: Error,
  ) =>
    new KeyGenerationError(
      `Failed to generate primary key for entity "${entityName}"`,
      ErrorCodes.KEY_GENERATION_FAILED,
      {
        entityName,
        operation,
        providedData,
        requiredAttributes,
        suggestion: requiredAttributes
          ? `Ensure these attributes are provided: ${requiredAttributes.join(", ")}`
          : "Check that all required attributes for key generation are provided",
      },
      cause,
    ),

  keyInvalidFormat: (entityName: string, operation: string, providedData: unknown, generatedKey: unknown) =>
    new KeyGenerationError(
      `Primary key generation for entity "${entityName}" produced undefined/null partition key`,
      ErrorCodes.KEY_INVALID_FORMAT,
      {
        entityName,
        operation,
        providedData,
        generatedKey,
        suggestion: "Ensure the key generation function returns valid pk (and sk if applicable) values",
      },
    ),

  keyMissingAttributes: (entityName: string, operation: string, missingAttributes: string[], providedData: unknown) =>
    new KeyGenerationError(
      `Missing required attributes for key generation in entity "${entityName}": ${missingAttributes.join(", ")}`,
      ErrorCodes.KEY_MISSING_ATTRIBUTES,
      {
        entityName,
        operation,
        missingAttributes,
        providedData,
        suggestion: `Provide the following attributes: ${missingAttributes.join(", ")}`,
      },
    ),
};

/**
 * Factory functions for Index errors
 */
export const IndexErrors = {
  generationFailed: (
    indexName: string,
    operation: string,
    providedItem: unknown,
    partitionKeyAttribute?: string,
    sortKeyAttribute?: string,
    cause?: Error,
  ) =>
    new IndexGenerationError(
      `Failed to generate key for index "${indexName}"`,
      ErrorCodes.INDEX_GENERATION_FAILED,
      {
        indexName,
        operation,
        providedItem,
        partitionKeyAttribute,
        sortKeyAttribute,
        suggestion: "Ensure all attributes required by the index are present in the item",
      },
      cause,
    ),

  missingAttributes: (
    indexName: string,
    operation: string,
    missingAttributes: string[],
    providedData: unknown,
    isReadOnly: boolean,
  ) =>
    new IndexGenerationError(
      `Cannot regenerate readonly index "${indexName}" - missing required attributes: ${missingAttributes.join(", ")}`,
      ErrorCodes.INDEX_MISSING_ATTRIBUTES,
      {
        indexName,
        operation,
        missingAttributes,
        providedData,
        isReadOnly,
        suggestion: isReadOnly
          ? "For readonly indexes, provide all attributes or use forceIndexRebuild() with complete data"
          : `Provide the following attributes: ${missingAttributes.join(", ")}`,
      },
    ),

  undefinedValues: (indexName: string, operation: string, generatedKey: unknown, providedItem: unknown) =>
    new IndexGenerationError(`Index "${indexName}" generated undefined values`, ErrorCodes.INDEX_UNDEFINED_VALUES, {
      indexName,
      operation,
      generatedKey,
      providedItem,
      suggestion: "Ensure all attributes required by the index are present in the item",
    }),

  notFound: (requestedIndexes: string[], availableIndexes: string[], entityName?: string, tableName?: string) =>
    new IndexGenerationError(
      `Requested indexes not found: ${requestedIndexes.join(", ")}`,
      ErrorCodes.INDEX_NOT_FOUND,
      {
        requestedIndexes,
        availableIndexes,
        entityName,
        tableName,
        suggestion: `Available indexes are: ${availableIndexes.join(", ")}`,
      },
    ),

  readonlyUpdateFailed: (indexName: string, operation: string, providedData: unknown) =>
    new IndexGenerationError(
      `Cannot update readonly index "${indexName}" without forcing rebuild`,
      ErrorCodes.INDEX_READONLY_UPDATE_FAILED,
      {
        indexName,
        operation,
        providedData,
        isReadOnly: true,
        suggestion: "Use forceIndexRebuild() to update readonly indexes, or provide all required attributes",
      },
    ),
};

/**
 * Combined error factory - provides access to all error factories
 */
export const ErrorFactory = {
  expression: ExpressionErrors,
  validation: ValidationErrors,
  configuration: ConfigurationErrors,
  operation: OperationErrors,
  transaction: TransactionErrors,
  batch: BatchErrors,
  entity: EntityErrors,
  index: IndexErrors,
};
