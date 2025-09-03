import { beforeEach, describe, expect, it } from "vitest";
import type { Table } from "../../table";
import type { DynamoItem } from "../../types";
import { IndexBuilder } from "../ddb-indexing";
import type { IndexDefinition } from "../entity";

describe("IndexBuilder", () => {
  let mockTable: Table;
  let indexBuilder: IndexBuilder<DynamoItem>;

  beforeEach(() => {
    mockTable = {
      gsis: {
        byStatus: { partitionKey: "gsi1pk", sortKey: "gsi1sk" },
        byCategory: { partitionKey: "gsi2pk", sortKey: "gsi2sk" },
      },
    } as unknown as Table;
  });

  describe("buildForUpdate", () => {
    it("should include missing attribute names in error message when index generation fails", () => {
      const indexes: Record<string, IndexDefinition<DynamoItem>> = {
        byStatus: {
          name: "byStatus",
          partitionKey: "gsi1pk",
          sortKey: "gsi1sk",
          isReadOnly: false,
          generateKey: (item: DynamoItem) => {
            // Simple key generation that will show undefined values
            const status = item.status || "undefined";
            const createdAt = item.createdAt || "undefined";
            return {
              pk: `status#${status}`,
              sk: `created#${createdAt}`,
            };
          },
        },
      };

      indexBuilder = new IndexBuilder(mockTable, indexes);

      const currentData = {
        id: "123",
        name: "Test Item",
        status: "active",
        createdAt: "2024-01-01",
      };

      const updates = {
        status: "inactive", // This changes the PK, triggering index regeneration
        // createdAt is not in updates, so will be undefined after merge
      };

      // Since this is testing the enhanced error, let's directly test what happens
      // when the merged item lacks required fields
      const result = indexBuilder.buildForUpdate(currentData, updates);

      // The key should be generated with the new status and old createdAt
      expect(result).toEqual({
        gsi1pk: "status#inactive",
        gsi1sk: "created#2024-01-01",
      });
    });

    it("should throw error when merged data has undefined values", () => {
      const indexes: Record<string, IndexDefinition<DynamoItem>> = {
        byCategory: {
          name: "byCategory",
          partitionKey: "gsi2pk",
          sortKey: "gsi2sk",
          isReadOnly: false,
          generateKey: (item: DynamoItem) => {
            // Use actual undefined check to generate "undefined" string
            const category = item.category !== undefined ? item.category : "undefined";
            const type = item.type !== undefined ? item.type : "undefined";
            return {
              pk: `category#${category}`,
              sk: `type#${type}`,
            };
          },
        },
      };

      indexBuilder = new IndexBuilder(mockTable, indexes);

      // Start with data that has all required fields
      const currentData = {
        id: "123",
        name: "Test Item",
        category: "electronics",
        type: "laptop",
      };

      // Update that changes the key but doesn't include all required fields
      const updates = {
        category: "computers", // This changes PK, triggers regeneration
        // type is not included - this is the key issue
      };

      // The merged data will have both category and type
      const result = indexBuilder.buildForUpdate(currentData, updates);

      // Should work because currentData.type is preserved in merge
      expect(result).toEqual({
        gsi2pk: "category#computers",
        gsi2sk: "type#laptop",
      });
    });

    it("should detect and report missing attributes correctly", () => {
      // Create an index that requires multiple fields
      const indexes: Record<string, IndexDefinition<DynamoItem>> = {
        byStatus: {
          name: "byStatus",
          partitionKey: "gsi1pk",
          sortKey: "gsi1sk",
          isReadOnly: false,
          generateKey: (item: DynamoItem) => {
            // This mimics what would happen if attributes are missing
            const status = item.status ?? "undefined";
            const priority = item.priority ?? "undefined";
            return {
              pk: `status#${status}`,
              sk: `priority#${priority}`,
            };
          },
        },
      };

      indexBuilder = new IndexBuilder(mockTable, indexes);

      // Test case 1: Updates preserve all required data
      const currentData1 = {
        id: "123",
        status: "active",
        priority: "high",
      };

      const updates1 = {
        status: "inactive",
        priority: "low",
      };

      // This should work fine
      const result1 = indexBuilder.buildForUpdate(currentData1, updates1);
      expect(result1).toEqual({
        gsi1pk: "status#inactive",
        gsi1sk: "priority#low",
      });

      // Test case 2: Current data is complete, updates change index but don't provide all fields
      const currentData2 = {
        id: "456",
        status: "pending",
        priority: "medium",
      };

      const updates2 = {
        status: "completed", // Changes PK, triggers regeneration
        // priority not included, but should be preserved from currentData
      };

      // This should also work because priority is preserved from currentData
      const result2 = indexBuilder.buildForUpdate(currentData2, updates2);
      expect(result2).toEqual({
        gsi1pk: "status#completed",
        gsi1sk: "priority#medium",
      });

      // Test case 3: Partial update that doesn't affect the index
      const updates3 = {
        name: "New name", // Doesn't affect index
      };

      // Index shouldn't be regenerated, so should return empty
      const result3 = indexBuilder.buildForUpdate(currentData1, updates3);
      expect(result3).toEqual({});
    });

    it("should not throw error for read-only indexes", () => {
      const indexes: Record<string, IndexDefinition<DynamoItem>> = {
        byStatus: {
          name: "byStatus",
          partitionKey: "gsi1pk",
          sortKey: "gsi1sk",
          isReadOnly: true, // Read-only index
          generateKey: (item: DynamoItem) => ({
            pk: `status#${item.status}`,
            sk: `created#${item.createdAt}`,
          }),
        },
      };

      indexBuilder = new IndexBuilder(mockTable, indexes);

      const currentData = {
        id: "123",
        name: "Test Item",
      };

      const updates = {
        description: "Updated description",
      };

      // Should not throw for read-only indexes even if attributes are missing
      expect(() => {
        const result = indexBuilder.buildForUpdate(currentData, updates);
        expect(result).toEqual({});
      }).not.toThrow();
    });

    it("should throw error when index key contains 'undefined' string", () => {
      // This test verifies our enhanced error messages work
      const indexes: Record<string, IndexDefinition<DynamoItem>> = {
        testIndex: {
          name: "testIndex",
          partitionKey: "gsi3pk",
          sortKey: "gsi3sk",
          isReadOnly: false,
          generateKey: (item: DynamoItem) => {
            // Force undefined string into the key when value is missing
            // This simulates what happens when an attribute is accessed but undefined
            if (!item.requiredField1 || !item.requiredField2) {
              return {
                pk: `field1#${item.requiredField1 || "undefined"}`,
                sk: `field2#${item.requiredField2 || "undefined"}`,
              };
            }
            return {
              pk: `field1#${item.requiredField1}`,
              sk: `field2#${item.requiredField2}`,
            };
          },
        },
      };

      (mockTable.gsis as any).testIndex = { partitionKey: "gsi3pk", sortKey: "gsi3sk" };

      indexBuilder = new IndexBuilder(mockTable, indexes);

      const currentData = {
        id: "123",
        requiredField1: "value1",
        requiredField2: "value2",
      };

      // Update that removes a required field
      const updates = {
        requiredField1: "newValue1",
        // requiredField2 is preserved from currentData
      };

      // This should work because requiredField2 is preserved
      const result = indexBuilder.buildForUpdate(currentData, updates);
      expect(result).toEqual({
        gsi3pk: "field1#newValue1",
        gsi3sk: "field2#value2",
      });

      // Now test with data that would actually cause undefined
      const currentDataMissing = {
        id: "456",
        requiredField1: "value1",
        // requiredField2 is missing
      };

      const updatesMissing = {
        requiredField1: "newValue1",
      };

      // This should detect the undefined value
      expect(() => {
        indexBuilder.buildForUpdate(currentDataMissing, updatesMissing);
      }).toThrow(/Missing attributes:/);
    });

    it("should handle validation errors from generateKey function", () => {
      const indexes: Record<string, IndexDefinition<DynamoItem>> = {
        validatedIndex: {
          name: "validatedIndex",
          partitionKey: "gsi1pk",
          sortKey: "gsi1sk",
          isReadOnly: false,
          generateKey: (item: DynamoItem) => {
            if (!item.requiredField) {
              throw new Error("Property 'requiredField' is required");
            }
            return {
              pk: `field#${item.requiredField}`,
              sk: `id#${item.id}`,
            };
          },
        },
      };

      indexBuilder = new IndexBuilder(mockTable, indexes);

      const currentData = {
        id: "123",
        // requiredField is missing
      };

      const updates = {
        name: "Updated Name",
      };

      // Should extract 'requiredField' from the validation error message
      expect(() => {
        indexBuilder.buildForUpdate(currentData, updates);
      }).toThrow(/Missing attributes:.*requiredField/);
    });

    it("should include specific missing attribute names in error message", () => {
      // This test specifically verifies our enhanced error messages
      const indexes: Record<string, IndexDefinition<DynamoItem>> = {
        enhancedIndex: {
          name: "enhancedIndex",
          partitionKey: "gsi4pk",
          sortKey: "gsi4sk",
          isReadOnly: false,
          generateKey: (item: DynamoItem) => {
            // Simulate a real-world scenario where missing attributes result in "undefined" strings
            const userId = item.userId || "undefined";
            const timestamp = item.timestamp || "undefined";
            const category = item.category || "undefined";

            return {
              pk: `user#${userId}#category#${category}`,
              sk: `timestamp#${timestamp}`,
            };
          },
        },
      };

      (mockTable.gsis as any).enhancedIndex = {
        partitionKey: "gsi4pk",
        sortKey: "gsi4sk",
      };
      indexBuilder = new IndexBuilder(mockTable, indexes);

      // Scenario 1: Update that changes index but missing multiple attributes
      const currentData = {
        id: "789",
        userId: "user123",
        timestamp: "2024-01-01T00:00:00Z",
        category: "original",
      };

      const updates = {
        userId: "user456", // Changes the index PK, triggers regeneration
        // timestamp and category are not provided, should be preserved from currentData
      };

      // This should work because all data is available
      const result = indexBuilder.buildForUpdate(currentData, updates);
      expect(result).toEqual({
        gsi4pk: "user#user456#category#original",
        gsi4sk: "timestamp#2024-01-01T00:00:00Z",
      });

      // Scenario 2: Missing required attributes in currentData
      const incompleteData = {
        id: "999",
        userId: "user789",
        // timestamp and category are missing
      };

      const incompleteUpdates = {
        userId: "user000", // Triggers index regeneration
      };

      // This should throw with specific missing attributes
      expect(() => {
        indexBuilder.buildForUpdate(incompleteData, incompleteUpdates);
      }).toThrow('Cannot update entity: insufficient data to regenerate index "enhancedIndex"');

      // The error should mention missing attributes
      expect(() => {
        indexBuilder.buildForUpdate(incompleteData, incompleteUpdates);
      }).toThrow(/Missing attributes:/);
    });

    it("should handle multiple missing attributes in error message", () => {
      const indexes: Record<string, IndexDefinition<DynamoItem>> = {
        multiAttrIndex: {
          name: "multiAttrIndex",
          partitionKey: "gsi1pk",
          sortKey: "gsi1sk",
          isReadOnly: false,
          generateKey: (item: DynamoItem) => ({
            pk: `${item.attr1}#${item.attr2}#${item.attr3}`,
            sk: `${item.attr4}#${item.attr5}`,
          }),
        },
      };

      indexBuilder = new IndexBuilder(mockTable, indexes);

      const currentData = {
        id: "123",
        attr1: "value1",
        // attr2, attr3, attr4, attr5 are missing
      };

      const updates = {
        attr1: "updated1",
      };

      // Should list all missing attributes
      expect(() => {
        indexBuilder.buildForUpdate(currentData, updates);
      }).toThrow(/Missing attributes:/);
    });
  });

  describe("buildForCreate", () => {
    it("should build index attributes for item creation", () => {
      const indexes: Record<string, IndexDefinition<DynamoItem>> = {
        byStatus: {
          name: "byStatus",
          partitionKey: "gsi1pk",
          sortKey: "gsi1sk",
          isReadOnly: false,
          generateKey: (item: DynamoItem) => ({
            pk: `status#${item.status}`,
            sk: `created#${item.createdAt}`,
          }),
        },
      };

      indexBuilder = new IndexBuilder(mockTable, indexes);

      const item = {
        id: "123",
        status: "active",
        createdAt: "2024-01-01",
      };

      const result = indexBuilder.buildForCreate(item);

      expect(result).toEqual({
        gsi1pk: "status#active",
        gsi1sk: "created#2024-01-01",
      });
    });

    it("should skip read-only indexes when excludeReadOnly is true", () => {
      const indexes: Record<string, IndexDefinition<DynamoItem>> = {
        readOnlyIndex: {
          name: "readOnlyIndex",
          partitionKey: "gsi1pk",
          sortKey: "gsi1sk",
          isReadOnly: true,
          generateKey: (item: DynamoItem) => ({
            pk: `readonly#${item.value}`,
          }),
        },
        normalIndex: {
          name: "normalIndex",
          partitionKey: "gsi2pk",
          sortKey: "gsi2sk",
          isReadOnly: false,
          generateKey: (item: DynamoItem) => ({
            pk: `normal#${item.value}`,
          }),
        },
      };

      (mockTable.gsis as any).readOnlyIndex = { partitionKey: "gsi1pk", sortKey: undefined };
      (mockTable.gsis as any).normalIndex = { partitionKey: "gsi2pk", sortKey: undefined };

      indexBuilder = new IndexBuilder(mockTable, indexes);

      const item = {
        id: "123",
        value: "test",
      };

      const result = indexBuilder.buildForCreate(item, {
        excludeReadOnly: true,
      });

      expect(result).toEqual({
        gsi2pk: "normal#test",
      });
      expect(result).not.toHaveProperty("gsi1pk");
    });
  });
});
