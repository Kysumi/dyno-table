import {
  BatchError,
  ConfigurationError,
  EntityError,
  EntityValidationError,
  ErrorCodes,
  ExpressionError,
  IndexGenerationError,
  KeyGenerationError,
  OperationError,
  TransactionError,
  ValidationError,
} from "../errors.js";

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
  indexSchemaValidationFailed: (validationIssues: unknown, keyType: "partition" | "sort" | "both") => {
    const keyLabel = keyType === "partition" ? "partition key" : keyType === "sort" ? "sort key" : "partition/sort key";
    return new ValidationError(
      `Index validation failed while generating ${keyLabel}: missing required attribute(s) or invalid values.`,
      ErrorCodes.SCHEMA_VALIDATION_FAILED,
      {
        keyType,
        validationIssues,
        suggestion: `Provide the required attributes to construct the index ${keyLabel}`,
      },
    );
  },

  asyncIndexValidationNotSupported: () =>
    new ValidationError(
      "Async schema validation is not supported during index key generation",
      ErrorCodes.ASYNC_VALIDATION_NOT_SUPPORTED,
      {
        operation: "index key generation",
        suggestion: "Use a synchronous schema for index definitions",
      },
    ),

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

  vectorValueInvalid: (indexName: string, vectorAttribute: string, expectedDimensions: number, reason: string) =>
    new ValidationError(`Invalid vector value for attribute "${vectorAttribute}"`, ErrorCodes.VECTOR_VALUE_INVALID, {
      indexName,
      vectorAttribute,
      expectedDimensions,
      reason,
    }),

  vectorTopKInvalid: (topK: unknown) =>
    new ValidationError("TopK must be an integer between 1 and 100", ErrorCodes.VECTOR_TOP_K_INVALID, { topK }),

  vectorPartitionInvalid: (indexName: string, expected: "required" | "absent") =>
    new ValidationError(
      expected === "required"
        ? `Vector index "${indexName}" requires a partition value`
        : `Vector index "${indexName}" does not accept a partition value`,
      ErrorCodes.VECTOR_PARTITION_INVALID,
      { indexName, expected },
    ),

  vectorConditionInvalid: (indexName: string, reason: string, attribute?: string) =>
    new ValidationError("Invalid vector search condition", ErrorCodes.VECTOR_CONDITION_INVALID, {
      indexName,
      attribute,
      reason,
    }),

  vectorProjectionInvalid: (indexName: string, attribute: string) =>
    new ValidationError(
      `Attribute "${attribute}" is not projected into vector index "${indexName}"`,
      ErrorCodes.VECTOR_PROJECTION_INVALID,
      { indexName, attribute },
    ),

  vectorResponseInvalid: (indexName: string, resultIndex: number) =>
    new ValidationError("DynamoDB returned a malformed vector search result", ErrorCodes.VECTOR_RESPONSE_INVALID, {
      indexName,
      resultIndex,
    }),
};

/**
 * Factory functions for Configuration errors
 */
export const ConfigurationErrors = {
  invalidChunkSize: (size: number) =>
    new ConfigurationError("Chunk size must be greater than 0", ErrorCodes.INVALID_CHUNK_SIZE, {
      size,
      suggestion: "Provide a chunk size greater than 0",
    }),

  invalidMaxAttempts: (maxAttempts: number) =>
    new ConfigurationError("Maximum batch attempts must be a positive integer", ErrorCodes.INVALID_MAX_ATTEMPTS, {
      maxAttempts,
      suggestion: "Provide a positive integer for maxAttempts",
    }),

  invalidBaseDelayMs: (baseDelayMs: number) =>
    new ConfigurationError("Batch retry base delay must be finite and non-negative", ErrorCodes.INVALID_BASE_DELAY_MS, {
      baseDelayMs,
      suggestion: "Provide a finite, non-negative number for baseDelayMs",
    }),

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

  vectorIndexInvalid: (indexName: string, reason: string) =>
    new ConfigurationError(`Invalid vector index configuration for "${indexName}"`, ErrorCodes.VECTOR_INDEX_INVALID, {
      indexName,
      reason,
    }),

  vectorIndexNotFound: (indexName: string, tableName: string, availableIndexes: string[]) =>
    new ConfigurationError(
      `Vector index "${indexName}" not found in table configuration`,
      ErrorCodes.VECTOR_INDEX_NOT_FOUND,
      { indexName, tableName, availableIndexes },
    ),

  vectorEntityScopeInvalid: (entityName: string, attribute: string, indexName: string) =>
    new ConfigurationError(
      `Vector index "${indexName}" cannot safely scope entity "${entityName}"`,
      ErrorCodes.VECTOR_ENTITY_SCOPE_INVALID,
      { entityName, attribute, indexName },
    ),

  collectionEntityTypeMismatch: (attribute: string, conflicts: string[]) =>
    new ConfigurationError(
      "Collection entity discriminator configuration does not match",
      ErrorCodes.VECTOR_COLLECTION_CONFIG_MISMATCH,
      {
        attribute,
        conflicts,
      },
    ),
};

/**
 * Factory functions for Operation errors
 */
export const OperationErrors = {
  searchVectorsFailed: (tableName: string, indexName: string, cause?: Error) =>
    new OperationError(
      `Vector search operation failed on table "${tableName}"`,
      ErrorCodes.SEARCH_VECTORS_FAILED,
      { tableName, indexName, operation: "searchVectors" },
      cause,
    ),

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
  invalidQueryBuilder: (entityName: string, queryName: string) =>
    new EntityError(
      "Entity query handlers must return a builder created from the scoped entity",
      ErrorCodes.INVALID_ENTITY_QUERY_BUILDER,
      {
        entityName,
        queryName,
        suggestion: "Return a builder created from the entity argument passed to the query handler",
      },
    ),

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
      `Primary key generation for entity "${entityName}" produced an undefined/null key`,
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
