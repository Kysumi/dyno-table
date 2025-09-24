import {
  ConfigurationError,
  EntityError,
  GSITemplateError,
  OperationError,
  PaginationError,
  ResultProcessingError,
  TemplateError,
  TransactionError,
  ValidationError,
} from "./base.js";

/**
 * Helper function to provide type conversion examples
 */
function getTypeConversionExample(expectedType: string, actualValue: unknown): string {
  const value = JSON.stringify(actualValue);

  switch (expectedType.toLowerCase()) {
    case "string":
      return `String(${value}) or ${value}.toString()`;
    case "number":
      return `Number(${value}) or parseInt(${value}) or parseFloat(${value})`;
    case "boolean":
      return `Boolean(${value}) or !!${value}`;
    case "array":
      return `Array.isArray(${value}) ? ${value} : [${value}]`;
    case "object":
      return `typeof ${value} === 'object' ? ${value} : { value: ${value} }`;
    case "date":
      return `new Date(${value})`;
    default:
      return `Convert ${value} to ${expectedType}`;
  }
}

/**
 * Factory functions for common configuration error scenarios
 */
export const ConfigurationErrors = {
  missingGSI: (gsiName: string, tableName: string, availableGSIs?: string[]) =>
    new ConfigurationError(`GSI "${gsiName}" does not exist on table "${tableName}"`, {
      gsiName,
      tableName,
      availableGSIs: availableGSIs || [],
      actionableAdvice: availableGSIs?.length
        ? `Available GSIs: [${availableGSIs.join(", ")}]. Check your indexName parameter or table configuration.`
        : `No GSIs found on table "${tableName}". Check your table configuration or create the required GSI.`,
      troubleshooting: {
        commonCauses: ["Typo in GSI name", "GSI not created in DynamoDB", "Wrong table configuration"],
        resolution: `Verify GSI exists: aws dynamodb describe-table --table-name ${tableName}`,
      },
    }),

  missingSortKey: (tableName: string, requiredFor?: string, tableSchema?: { partitionKey: string; sortKey?: string }) =>
    new ConfigurationError(`Sort key required but not provided for table "${tableName}"`, {
      tableName,
      requiredFor,
      tableSchema,
      actionableAdvice: requiredFor
        ? `Operation "${requiredFor}" requires a sort key. Provide the "sk" parameter in your operation.`
        : `This operation requires a sort key. Check your table configuration and provide the sort key value.`,
      troubleshooting: {
        commonCauses: ["Missing sk parameter", "Table doesn't have sort key defined", "Wrong operation type"],
        resolution: tableSchema?.sortKey
          ? `Provide the "${tableSchema.sortKey}" field in your operation`
          : "Check if your table actually has a sort key configured",
      },
    }),

  invalidKeyConfiguration: (
    tableName: string,
    keyType: "partition" | "sort",
    providedKey?: string,
    expectedKey?: string,
  ) =>
    new ConfigurationError(
      `Invalid ${keyType} key configuration for table "${tableName}"${providedKey ? `: got "${providedKey}"` : ""}`,
      {
        tableName,
        keyType,
        providedKey,
        expectedKey,
        actionableAdvice: expectedKey
          ? `Expected ${keyType} key "${expectedKey}", but got "${providedKey || "undefined"}". Check your table configuration.`
          : `Invalid ${keyType} key configuration. Verify your table schema and key definitions.`,
        troubleshooting: {
          commonCauses: [
            "Wrong key name in configuration",
            "Mismatch between code and DynamoDB schema",
            "Typo in key field",
          ],
          resolution: `Verify table schema: aws dynamodb describe-table --table-name ${tableName}`,
        },
      },
    ),

  resourceNotFound: (resourceType: "table" | "index", resourceName: string, parentResource?: string) =>
    new ConfigurationError(`${resourceType} '${resourceName}' not found`, {
      resourceType,
      resourceName,
      parentResource,
      awsErrorType: "ResourceNotFoundException",
      actionableAdvice:
        resourceType === "table"
          ? `Table "${resourceName}" does not exist. Create the table or check your table name.`
          : `Index "${resourceName}" not found${parentResource ? ` on table "${parentResource}"` : ""}. Create the index or check your index name.`,
      troubleshooting: {
        commonCauses: ["Resource doesn't exist", "Wrong region", "Wrong AWS account", "Typo in resource name"],
        resolution:
          resourceType === "table"
            ? `Create table: aws dynamodb create-table --table-name ${resourceName} ...`
            : `Check table indexes: aws dynamodb describe-table --table-name ${parentResource || "your-table"}`,
      },
    }),

  indexConfigurationMismatch: (
    indexName: string,
    tableName: string,
    configuredKeys: { pk?: string; sk?: string },
    actualKeys: { pk?: string; sk?: string },
  ) =>
    new ConfigurationError(`Index "${indexName}" configuration mismatch on table "${tableName}"`, {
      indexName,
      tableName,
      configuredKeys,
      actualKeys,
      keyMismatches: {
        partitionKey: configuredKeys.pk !== actualKeys.pk,
        sortKey: configuredKeys.sk !== actualKeys.sk,
      },
      actionableAdvice: `Update your table configuration to match the actual DynamoDB schema. Configured: {pk: "${configuredKeys.pk}", sk: "${configuredKeys.sk}"}, Actual: {pk: "${actualKeys.pk}", sk: "${actualKeys.sk}"}`,
      troubleshooting: {
        commonCauses: [
          "Table config out of sync with DynamoDB",
          "Index was modified after code deployment",
          "Wrong index name",
        ],
        resolution: `Update table config or recreate index with correct key names`,
      },
    }),
};

/**
 * Factory functions for validation error scenarios
 */
export const ValidationErrors = {
  invalidParameter: (
    parameterName: string,
    expectedType: string,
    actualValue: unknown,
    validValues?: unknown[],
    context?: string,
  ) =>
    new ValidationError(`Invalid parameter "${parameterName}": expected ${expectedType}, got ${typeof actualValue}`, {
      parameterName,
      expectedType,
      actualValue,
      actualType: typeof actualValue,
      validValues,
      context,
      actionableAdvice: validValues?.length
        ? `Parameter "${parameterName}" must be one of: [${validValues.join(", ")}]. You provided: ${JSON.stringify(actualValue)}`
        : `Parameter "${parameterName}" must be of type ${expectedType}. Convert your value or check the parameter type.`,
      troubleshooting: {
        commonCauses: ["Wrong data type", "Typo in parameter name", "Missing type conversion", "Invalid enum value"],
        resolution: validValues?.length
          ? `Use one of the valid values: ${validValues.join(", ")}`
          : `Convert to ${expectedType}: ${getTypeConversionExample(expectedType, actualValue)}`,
      },
    }),

  constraintViolation: (
    fieldName: string,
    constraint: string,
    value: unknown,
    allowedRange?: { min?: number; max?: number },
    examples?: string[],
  ) =>
    new ValidationError(`Constraint violation for field "${fieldName}": ${constraint}`, {
      fieldName,
      constraint,
      value,
      allowedRange,
      examples,
      actionableAdvice: allowedRange
        ? `Field "${fieldName}" must be between ${allowedRange.min || "min"} and ${allowedRange.max || "max"}. Current value: ${JSON.stringify(value)}`
        : `Field "${fieldName}" violates constraint: ${constraint}. Current value: ${JSON.stringify(value)}`,
      troubleshooting: {
        commonCauses: ["Value out of range", "Wrong format", "Missing validation", "Null/undefined value"],
        resolution: examples?.length
          ? `Try one of these valid examples: ${examples.join(", ")}`
          : `Ensure the value meets the constraint: ${constraint}`,
      },
    }),

  schemaValidationFailed: (
    entityType: string,
    validationErrors: string[],
    fieldDetails?: Record<string, { expected: string; actual: unknown; suggestion?: string }>,
  ) =>
    new ValidationError(`Schema validation failed for entity "${entityType}": ${validationErrors.join(", ")}`, {
      entityType,
      validationErrors,
      errorCount: validationErrors.length,
      fieldDetails,
      failedFields: fieldDetails ? Object.keys(fieldDetails) : [],
      actionableAdvice: fieldDetails
        ? `Fix the following fields: ${Object.entries(fieldDetails)
            .map(
              ([field, detail]) =>
                `${field}: expected ${detail.expected}, got ${JSON.stringify(detail.actual)}${detail.suggestion ? ` (${detail.suggestion})` : ""}`,
            )
            .join("; ")}`
        : `Entity "${entityType}" failed validation. Check the field types and required properties.`,
      troubleshooting: {
        commonCauses: ["Missing required fields", "Wrong field types", "Invalid field values", "Schema mismatch"],
        resolution: "Review the entity schema and ensure all required fields are provided with correct types",
      },
    }),

  awsValidationException: (operation: string, validationMessage: string, requestParams?: Record<string, unknown>) =>
    new ValidationError(`AWS validation failed for ${operation}: ${validationMessage}`, {
      operation,
      awsErrorType: "ValidationException",
      awsMessage: validationMessage,
      requestParams,
      actionableAdvice: `AWS rejected the ${operation} request. Check the request parameters and DynamoDB limits.`,
      troubleshooting: {
        commonCauses: [
          "Invalid request format",
          "Parameter out of range",
          "Missing required parameter",
          "DynamoDB limit exceeded",
        ],
        resolution: `Review AWS DynamoDB documentation for ${operation} operation and check parameter constraints`,
      },
    }),

  conditionalCheckFailed: (
    operation: string,
    condition: string,
    itemKey: Record<string, unknown>,
    expectedState?: string,
  ) =>
    new ValidationError(`Conditional check failed for ${operation}: ${condition}`, {
      operation,
      condition,
      itemKey,
      expectedState,
      actionableAdvice: expectedState
        ? `Expected item to be in state "${expectedState}" but condition "${condition}" failed. Check if the item exists and is in the expected state.`
        : `Condition "${condition}" failed. The item may not exist or may not meet the specified condition.`,
      troubleshooting: {
        commonCauses: [
          "Item doesn't exist",
          "Item in different state",
          "Wrong condition expression",
          "Concurrent modification",
        ],
        resolution: "Check if the item exists and verify the condition expression matches your requirements",
      },
    }),

  fieldTypeMismatch: (
    fieldName: string,
    expectedType: string,
    actualType: string,
    value: unknown,
    entityType?: string,
  ) =>
    new ValidationError(`Field type mismatch for "${fieldName}": expected ${expectedType}, got ${actualType}`, {
      fieldName,
      expectedType,
      actualType,
      value,
      entityType,
      actionableAdvice: `Convert field "${fieldName}" to ${expectedType}. Current value ${JSON.stringify(value)} is ${actualType}.`,
      troubleshooting: {
        commonCauses: ["Data type conversion needed", "Schema evolution", "External data source type mismatch"],
        resolution: getTypeConversionExample(expectedType, value),
      },
    }),
};

/**
 * Factory functions for GSI template error scenarios
 */
export const GSITemplateErrors = {
  missingRequiredField: (indexName: string, fieldName: string, entityType?: string) =>
    new GSITemplateError(
      `Required field "${fieldName}" missing for GSI "${indexName}" template construction`,
      indexName,
      entityType,
      {
        requiredField: fieldName,
        missingFields: [fieldName],
        actionableAdvice: `Ensure the field "${fieldName}" is provided in your update operation or mark the index as readOnly`,
        indexName,
      },
    ),

  templateParsingFailed: (indexName: string, template: string, entityType?: string, cause?: Error) =>
    new GSITemplateError(`Failed to parse template "${template}" for GSI "${indexName}"`, indexName, entityType, {
      template,
      originalError: cause?.message,
      actionableAdvice: `Check the template syntax for GSI "${indexName}" - templates should use valid field references`,
      indexName,
    }),

  multipleFieldsMissing: (indexName: string, missingFields: string[], entityType?: string) =>
    new GSITemplateError(
      `Multiple required fields missing for GSI "${indexName}": ${missingFields.join(", ")}`,
      indexName,
      entityType,
      {
        missingFields,
        requiredFieldCount: missingFields.length,
        actionableAdvice: `Provide the missing fields [${missingFields.join(", ")}] in your operation, or mark the GSI "${indexName}" as readOnly to skip regeneration`,
        indexName,
        fieldSuggestions: missingFields.map((field) => `${field}: "your_value_here"`),
      },
    ),

  dataTypeMismatch: (
    indexName: string,
    fieldName: string,
    expectedType: string,
    actualType: string,
    entityType?: string,
  ) =>
    new GSITemplateError(
      `Data type mismatch for GSI "${indexName}" field "${fieldName}": expected ${expectedType}, got ${actualType}`,
      indexName,
      entityType,
      {
        fieldName,
        expectedType,
        actualType,
        actionableAdvice: `Convert the field "${fieldName}" to ${expectedType} before using in GSI "${indexName}"`,
        indexName,
      },
    ),

  templateSyntaxError: (indexName: string, template: string, syntaxError: string, entityType?: string) =>
    new GSITemplateError(`Template syntax error for GSI "${indexName}": ${syntaxError}`, indexName, entityType, {
      template,
      syntaxError,
      actionableAdvice: `Fix the template syntax for GSI "${indexName}". Common issues: missing field references, invalid characters, or malformed expressions`,
      indexName,
    }),

  insufficientDataForRegeneration: (
    indexName: string,
    availableFields: string[],
    requiredFields: string[],
    entityType?: string,
  ) =>
    new GSITemplateError(
      `Insufficient data to regenerate GSI "${indexName}". Available: [${availableFields.join(", ")}], Required: [${requiredFields.join(", ")}]`,
      indexName,
      entityType,
      {
        availableFields,
        requiredFields,
        missingFields: requiredFields.filter((field) => !availableFields.includes(field)),
        actionableAdvice: `Provide the missing fields [${requiredFields.filter((field) => !availableFields.includes(field)).join(", ")}] or mark GSI "${indexName}" as readOnly`,
        indexName,
        fieldSuggestions: requiredFields
          .filter((field) => !availableFields.includes(field))
          .map((field) => `${field}: "your_value_here"`),
      },
    ),
};

/**
 * Factory functions for result processing error scenarios
 */
export const ResultProcessingErrors = {
  invalidFormat: (operation: string, expectedFormat: string, actualFormat: string) =>
    new ResultProcessingError(
      `Invalid data format in ${operation}: expected ${expectedFormat}, got ${actualFormat}`,
      operation,
      {
        expectedFormat,
        actualFormat,
        actionableAdvice: `The ${operation} operation returned data in ${actualFormat} format, but ${expectedFormat} was expected. Check your DynamoDB response handling and ensure proper data transformation.`,
        troubleshooting: {
          commonCauses: [
            "Incorrect DynamoDB response parsing",
            "Schema evolution affecting data format",
            "Mixed data types in the same attribute",
            "Legacy data format incompatibility",
          ],
          resolutions: [
            "Verify DynamoDB response structure matches expected format",
            "Add data format validation before processing",
            "Implement data migration for legacy formats",
            "Use type guards to validate data shape before processing",
          ],
        },
      },
    ),

  keyExtractionFailed: (operation: string, keyCondition: string) =>
    new ResultProcessingError(`Could not extract partition key value from key condition in ${operation}`, operation, {
      keyCondition,
      extractionStage: "partition_key",
      actionableAdvice: `Failed to extract partition key from condition "${keyCondition}". Ensure the key condition follows DynamoDB syntax and contains valid attribute references.`,
      troubleshooting: {
        commonCauses: [
          "Malformed key condition expression",
          "Missing or invalid attribute names",
          "Incorrect expression syntax",
          "Reserved word conflicts in key names",
        ],
        resolutions: [
          "Verify key condition syntax: 'pk = :pk'",
          "Use ExpressionAttributeNames for reserved words",
          "Check attribute names match table schema",
          "Validate expression parameters are properly substituted",
        ],
      },
    }),

  unprocessedItemsFormat: (operation: string, expectedFormat: string) =>
    new ResultProcessingError(`Invalid unprocessed items format returned from DynamoDB in ${operation}`, operation, {
      expectedFormat,
      stage: "unprocessed_items_parsing",
      actionableAdvice: `DynamoDB returned unprocessed items in an unexpected format during ${operation}. This typically indicates a batch operation that couldn't complete all items.`,
      troubleshooting: {
        commonCauses: [
          "Insufficient write capacity for batch operation",
          "Item validation failures in batch",
          "Network timeout during batch processing",
          "DynamoDB service throttling",
        ],
        resolutions: [
          "Implement exponential backoff retry for unprocessed items",
          "Reduce batch size to avoid capacity limits",
          "Check individual item validation before batching",
          "Monitor CloudWatch metrics for throttling events",
        ],
      },
    }),

  resultTransformationFailed: (operation: string, transformationStage: string, cause?: Error) =>
    new ResultProcessingError(`Result transformation failed during ${transformationStage} in ${operation}`, operation, {
      transformationStage,
      originalError: cause?.message,
      actionableAdvice: `Data transformation failed at the ${transformationStage} stage during ${operation}. ${cause ? `Original error: ${cause.message}` : "Check data format and transformation logic."}`,
      troubleshooting: {
        commonCauses: [
          "Unexpected data types in DynamoDB response",
          "Missing or null values in required fields",
          "Schema validation failures",
          "Custom transformation logic errors",
        ],
        resolutions: [
          "Add null/undefined checks before transformation",
          "Validate data types match expected schema",
          "Implement graceful error handling in transformations",
          "Use optional chaining for nested property access",
        ],
      },
    }),
};

/**
 * Factory functions for pagination error scenarios
 */
export const PaginationErrors = {
  memoryOverflow: (operation: "toArray" | "getAllPages", itemCount: number, estimatedMemory: string) =>
    new PaginationError(
      `Memory overflow risk during ${operation}: ${itemCount} items (~${estimatedMemory})`,
      "array_conversion",
      {
        itemCount,
        estimatedMemory,
        recommendation: "Use streaming iteration instead",
        actionableAdvice: `Loading ${itemCount} items (~${estimatedMemory}) into memory using ${operation} may cause memory issues. Consider using streaming iteration with for-await-of loop instead.`,
        troubleshooting: {
          commonCauses: [
            "Large result sets being loaded entirely into memory",
            "Insufficient available heap memory",
            "Memory leaks from previous operations",
            "Concurrent memory-intensive operations",
          ],
          resolutions: [
            "Use 'for await (const item of iterator)' for streaming",
            "Process items in smaller batches using pagination",
            "Implement early termination with .take(n) or .filter()",
            "Monitor memory usage and set appropriate limits",
          ],
          streamingExample: "for await (const item of queryIterator) { /* process item */ }",
        },
      },
      true, // memoryWarning = true
    ),

  stateCorruption: (operation: string, currentPage: number) =>
    new PaginationError(`Pagination state corrupted during ${operation}`, "pagination", {
      currentPage,
      recommendation: "Reinitialize paginator",
      actionableAdvice: `Pagination state became corrupted at page ${currentPage} during ${operation}. This typically happens due to concurrent access or improper state management.`,
      troubleshooting: {
        commonCauses: [
          "Concurrent access to the same paginator instance",
          "Manual modification of pagination tokens",
          "Network interruption during pagination",
          "Iterator state mutation from external code",
        ],
        resolutions: [
          "Create a new iterator/paginator instance",
          "Avoid sharing paginator instances across concurrent operations",
          "Don't manually modify LastEvaluatedKey tokens",
          "Implement proper error handling for network failures",
        ],
      },
    }),

  iteratorExhausted: (operation: string) =>
    new PaginationError(`Iterator already exhausted in ${operation}`, "iteration", {
      recommendation: "Create new iterator for additional results",
      actionableAdvice: `The iterator has been fully consumed and cannot provide more results for ${operation}. Create a new iterator if you need to restart iteration.`,
      troubleshooting: {
        commonCauses: [
          "Attempting to reuse a consumed iterator",
          "Multiple for-await loops on the same iterator",
          "Calling .toArray() then trying to iterate again",
          "Iterator already reached the end of results",
        ],
        resolutions: [
          "Create a new query/scan iterator for fresh results",
          "Use .clone() method if available for iterator reuse",
          "Store results from first iteration if reuse is needed",
          "Check hasNext() before attempting to get next items",
        ],
      },
    }),

  concurrentAccess: (operation: string, conflictingOperation: string) =>
    new PaginationError(
      `Concurrent access detected during ${operation}: conflicting with ${conflictingOperation}`,
      "pagination",
      {
        conflictingOperation,
        recommendation: "Use separate iterator instances",
        actionableAdvice: `Detected concurrent access between ${operation} and ${conflictingOperation}. Iterator instances are not thread-safe and should not be shared.`,
        troubleshooting: {
          commonCauses: [
            "Same iterator instance used in multiple async operations",
            "Sharing iterator between different execution contexts",
            "Race conditions in paginated processing",
            "Insufficient iterator isolation in concurrent code",
          ],
          resolutions: [
            "Create separate iterator instances for each operation",
            "Use proper async/await sequencing instead of parallel access",
            "Implement iterator pooling for high-concurrency scenarios",
            "Consider using batch operations instead of individual iterations",
          ],
        },
      },
    ),
};

/**
 * Factory functions for transaction error scenarios
 */
export const TransactionErrors = {
  itemLimitExceeded: (itemCount: number, limit: number, transactionType: "read" | "write") =>
    new TransactionError(
      `Transaction ${transactionType} limit exceeded: ${itemCount} items > ${limit} limit`,
      transactionType,
      {
        itemCount,
        limit,
        exceeded: itemCount - limit,
        actionableAdvice: `Transaction contains ${itemCount} items but DynamoDB ${transactionType} transactions are limited to ${limit} items. Split your transaction into smaller batches.`,
        troubleshooting: {
          commonCauses: [
            "Attempting to process too many items in a single transaction",
            "Misunderstanding DynamoDB transaction limits",
            "Lack of batching logic for large operations",
            "Trying to use transactions for bulk operations",
          ],
          resolutions: [
            `Split into batches of ${limit} items or fewer`,
            "Use batch operations for non-transactional bulk writes",
            "Implement chunking logic to process items in groups",
            "Consider using individual operations if ACID properties aren't required",
          ],
          limits: {
            read: "100 items per TransactGetItems",
            write: "100 items per TransactWriteItems",
            maxItemSize: "400KB per item",
          },
        },
      },
    ),

  unsupportedItemType: (itemType: string, transactionType: "read" | "write") =>
    new TransactionError(`Unsupported transaction item type: ${itemType}`, transactionType, {
      unsupportedType: itemType,
      actionableAdvice: `Item type "${itemType}" is not supported in ${transactionType} transactions. Use only supported operation types for DynamoDB transactions.`,
      troubleshooting: {
        commonCauses: [
          "Using invalid operation types in transaction items",
          "Incorrect transaction item structure",
          "Mixing incompatible operation types",
          "Using operations not supported by DynamoDB transactions",
        ],
        resolutions: [
          "Use only supported transaction operations: Get, Put, Update, Delete, ConditionCheck",
          "Verify transaction item structure matches DynamoDB API requirements",
          "Check DynamoDB documentation for supported transaction operations",
          "Replace unsupported operations with equivalent supported ones",
        ],
        supportedTypes: {
          read: ["Get"],
          write: ["Put", "Update", "Delete", "ConditionCheck"],
        },
      },
    }),

  mixedOperationsNotAllowed: (operationTypes: string[], transactionType: "read" | "write") =>
    new TransactionError(
      `Mixed operations not allowed in ${transactionType} transaction: ${operationTypes.join(", ")}`,
      transactionType,
      {
        operationTypes,
        mixedOperationsDetected: true,
        actionableAdvice: `DynamoDB ${transactionType} transactions cannot mix different operation types. Found: ${operationTypes.join(", ")}. Use separate transactions for different operation types.`,
        troubleshooting: {
          commonCauses: [
            "Combining read and write operations in single transaction",
            "Mixing different write operation types inappropriately",
            "Incorrect transaction type selection",
            "Misunderstanding DynamoDB transaction operation grouping",
          ],
          resolutions: [
            "Use TransactGetItems only for Get operations",
            "Use TransactWriteItems for Put, Update, Delete, ConditionCheck",
            "Split mixed operations into separate transactions",
            "Group operations by type before creating transactions",
          ],
        },
      },
    ),

  primaryKeyValidationFailed: (tableName: string, itemIndex: number) =>
    new TransactionError(
      `Primary key validation failed for transaction item ${itemIndex} in table "${tableName}"`,
      "write",
      {
        tableName,
        itemIndex,
        validationStage: "primary_key",
        actionableAdvice: `Transaction item ${itemIndex} for table "${tableName}" has invalid or missing primary key attributes. Ensure all required key attributes are present and correctly formatted.`,
        troubleshooting: {
          commonCauses: [
            "Missing partition key (pk) attribute",
            "Missing sort key (sk) attribute when required",
            "Null or undefined key attribute values",
            "Incorrect key attribute data types",
          ],
          resolutions: [
            "Verify all required key attributes are present",
            "Check that key values are not null or undefined",
            "Ensure key attribute types match table schema",
            "Validate key values before adding to transaction",
          ],
        },
      },
    ),
};

/**
 * Factory functions for template error scenarios
 */
export const TemplateErrors = {
  partitionKeyTemplateFailed: (template: string, missingFields: string[]) =>
    new TemplateError(
      `Partition key template construction failed: missing fields ${missingFields.join(", ")}`,
      "partition_key",
      template,
      {
        missingFields,
        requiredFieldCount: missingFields.length,
        actionableAdvice: `Template "${template}" requires fields [${missingFields.join(", ")}] but they are missing from the entity data. Provide values for all required fields.`,
        troubleshooting: {
          commonCauses: [
            "Entity data missing required fields for key construction",
            "Undefined or null values in key template fields",
            "Field names in template don't match entity properties",
            "Dynamic field resolution failing at runtime",
          ],
          resolutions: [
            `Ensure entity has values for: ${missingFields.join(", ")}`,
            "Check field names match exactly (case-sensitive)",
            "Validate entity data before key template construction",
            "Use default values or computed fields for missing data",
          ],
          templateExample: `Template: "${template}" needs: ${missingFields.map((f) => `${f}: "value"`).join(", ")}`,
        },
      },
    ),

  sortKeyTemplateFailed: (template: string, validationError: string) =>
    new TemplateError(`Sort key template validation failed: ${validationError}`, "sort_key", template, {
      validationError,
      actionableAdvice: `Sort key template "${template}" failed validation: ${validationError}. Ensure the template syntax is correct and all referenced fields exist.`,
      troubleshooting: {
        commonCauses: [
          "Invalid template syntax or placeholders",
          "Referenced fields don't exist in entity",
          "Field values incompatible with template format",
          "Template contains reserved characters or keywords",
        ],
        resolutions: [
          "Verify template syntax matches expected format",
          "Check that all referenced fields exist in entity data",
          "Ensure field values are compatible with string concatenation",
          "Avoid DynamoDB reserved words in templates",
        ],
      },
    }),

  templateSyntaxError: (
    templateType: "partition_key" | "sort_key" | "gsi_key",
    template: string,
    syntaxError: string,
  ) =>
    new TemplateError(`Template syntax error in ${templateType}: ${syntaxError}`, templateType, template, {
      syntaxError,
      actionableAdvice: `The ${templateType} template "${template}" has a syntax error: ${syntaxError}. Fix the template format to match expected patterns.`,
      troubleshooting: {
        commonCauses: [
          // biome-ignore lint/suspicious/noTemplateCurlyInString: This is documentation showing template syntax
          "Invalid placeholder syntax (should be ${fieldName})",
          "Unmatched braces or brackets in template",
          "Reserved characters used incorrectly",
          "Malformed template expressions",
        ],
        resolutions: [
          // biome-ignore lint/suspicious/noTemplateCurlyInString: This is documentation showing template syntax
          "Use correct placeholder syntax: ${fieldName})",
          "Ensure all braces are properly matched",
          "Escape reserved characters if needed",
          "Validate template format before use",
        ],
        // biome-ignore lint/suspicious/noTemplateCurlyInString: These are example template strings, not actual templates
        validExamples: ["USER#${userId}", "${entityType}#${id}#${timestamp}", "DATA#${category}#${subcategory}"],
      },
    }),

  circularDependency: (
    templateType: "partition_key" | "sort_key" | "gsi_key",
    template: string,
    dependencyChain: string[],
  ) =>
    new TemplateError(
      `Circular dependency detected in ${templateType} template: ${dependencyChain.join(" -> ")}`,
      templateType,
      template,
      {
        dependencyChain,
        circularDependencyDetected: true,
        actionableAdvice: `Template "${template}" has a circular dependency: ${dependencyChain.join(" -> ")}. Remove the circular reference by restructuring your template dependencies.`,
        troubleshooting: {
          commonCauses: [
            "Template fields reference each other in a loop",
            "Computed fields create circular dependencies",
            "Complex template logic with mutual dependencies",
            "Incorrect template field resolution order",
          ],
          resolutions: [
            "Break the circular dependency by removing one reference",
            "Use direct field values instead of computed dependencies",
            "Restructure templates to have clear dependency hierarchy",
            "Consider using separate fields instead of interdependent templates",
          ],
          dependencyPath: dependencyChain.join(" -> "),
        },
      },
    ),
};

/**
 * Factory functions for AWS SDK error wrapping
 */
export const AwsErrorFactories = {
  conditionalCheckFailed: (operation: string, key: Record<string, unknown>) =>
    new OperationError(
      `Conditional check failed for ${operation}`,
      operation,
      { key, awsErrorType: "ConditionalCheckFailedException" },
      false, // Non-retryable
    ),

  provisionedThroughputExceeded: (operation: string, tableName: string) =>
    new OperationError(
      `Provisioned throughput exceeded for ${operation} on ${tableName}`,
      operation,
      { tableName, awsErrorType: "ProvisionedThroughputExceededException" },
      true, // Retryable
    ),

  throttlingException: (operation: string, tableName: string) =>
    new OperationError(
      `Request throttled for ${operation} on ${tableName}`,
      operation,
      { tableName, awsErrorType: "ThrottlingException" },
      true, // Retryable
    ),

  itemCollectionSizeLimitExceeded: (operation: string, tableName: string) =>
    new OperationError(
      `Item collection size limit exceeded for ${operation} on ${tableName}`,
      operation,
      { tableName, awsErrorType: "ItemCollectionSizeLimitExceededException" },
      false, // Non-retryable
    ),

  requestLimitExceeded: (operation: string) =>
    new OperationError(
      `Request limit exceeded for ${operation}`,
      operation,
      { awsErrorType: "RequestLimitExceeded" },
      true, // Retryable
    ),

  transactionCanceledException: (operation: string, cancellationReasons: string[]) =>
    new OperationError(
      `Transaction cancelled for ${operation}: ${cancellationReasons.join(", ")}`,
      operation,
      { awsErrorType: "TransactionCanceledException", cancellationReasons },
      false, // Non-retryable
    ),

  internalServerError: (operation: string) =>
    new OperationError(
      `Internal server error during ${operation}`,
      operation,
      { awsErrorType: "InternalServerError" },
      true, // Retryable
    ),
};

/**
 * Factory functions for entity error scenarios
 */
export const EntityErrors = {
  definitionError: (entityType: string, error: string) =>
    new EntityError(`Entity definition error for "${entityType}": ${error}`, entityType, {
      definitionError: error,
      actionableAdvice: `Entity "${entityType}" has a configuration error: ${error}. Review the entity definition and fix the specified issue.`,
      troubleshooting: {
        commonCauses: [
          "Missing required configuration properties",
          "Invalid schema validation setup",
          "Incorrect key template definitions",
          "Missing or invalid GSI configurations",
        ],
        resolutions: [
          "Verify all required entity configuration fields are present",
          "Check schema validator is properly configured",
          "Validate key template syntax and field references",
          "Ensure GSI configurations match table schema",
        ],
      },
    }),

  keyGenerationFailed: (entityType: string, keyType: "partition" | "sort", missingFields: string[]) =>
    new EntityError(
      `Key generation failed for ${keyType} key in entity "${entityType}": missing fields ${missingFields.join(", ")}`,
      entityType,
      {
        keyType,
        missingFields,
        keyGenerationStage: "template_resolution",
        actionableAdvice: `Cannot generate ${keyType} key for entity "${entityType}" because fields [${missingFields.join(", ")}] are missing. Ensure all required fields are present in the entity data.`,
        troubleshooting: {
          commonCauses: [
            "Entity data missing required fields for key construction",
            "Null or undefined values in key template fields",
            "Incorrect field names in key templates",
            "Data not properly populated before key generation",
          ],
          resolutions: [
            `Provide values for required fields: ${missingFields.join(", ")}`,
            "Check that field names in templates match entity properties exactly",
            "Validate entity data completeness before save operations",
            "Use computed fields or default values for missing data",
          ],
          requiredFields: missingFields,
        },
      },
    ),

  indexingError: (entityType: string, indexName: string, error: string) =>
    new EntityError(`Indexing error for entity "${entityType}" on index "${indexName}": ${error}`, entityType, {
      indexName,
      indexingError: error,
      actionableAdvice: `Failed to process index "${indexName}" for entity "${entityType}": ${error}. Check the index configuration and entity data compatibility.`,
      troubleshooting: {
        commonCauses: [
          "Index key template construction failure",
          "Missing fields required for index keys",
          "Index configuration doesn't match table GSI setup",
          "Data type incompatibility with index requirements",
        ],
        resolutions: [
          "Verify index configuration matches DynamoDB table GSI",
          "Ensure all required fields for index keys are present",
          "Check data types match index key requirements",
          "Validate index templates reference correct entity fields",
        ],
      },
    }),

  repositoryConfigurationError: (entityType: string, configurationError: string) =>
    new EntityError(`Repository configuration error for entity "${entityType}": ${configurationError}`, entityType, {
      configurationError,
      repositoryStage: "initialization",
      actionableAdvice: `Repository setup failed for entity "${entityType}": ${configurationError}. Fix the repository configuration before using the entity.`,
      troubleshooting: {
        commonCauses: [
          "Invalid table configuration passed to repository",
          "Missing or incorrect entity definition",
          "Table and entity schema mismatch",
          "Incorrect repository initialization parameters",
        ],
        resolutions: [
          "Verify table configuration is valid and complete",
          "Check entity definition matches expected format",
          "Ensure table schema supports entity requirements",
          "Review repository initialization code for correct parameters",
        ],
      },
    }),
};
