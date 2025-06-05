import { beforeAll, describe, expect, it } from "vitest";
import type { Table } from "../table";
import { type Dinosaur, createTestTable } from "./table-test-setup";

describe("Table Integration Tests - Large Data Loading", () => {
  let table: Table;

  beforeAll(() => {
    table = createTestTable();
  });

  // Helper function to generate large string data
  const generateLargeString = (size: number): string => {
    // Create a deterministic pattern of characters
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < size; i++) {
      // Use a deterministic pattern based on position
      result += characters[i % characters.length];
    }
    return result;
  };

  // Helper function to create and insert large records
  const createAndInsertLargeRecords = async (count: number, pkValue: string) => {
    const largeRecords: Dinosaur[] = [];

    console.log(`Creating ${count} large records...`);

    for (let i = 0; i < count; i++) {
      largeRecords.push({
        demoPartitionKey: pkValue,
        demoSortKey: `dino#large${i.toString().padStart(3, "0")}`,
        name: `Large Dino ${i}`,
        type: "LargeData",
        // Add a large data field (approximately 100KB)
        tags: new Set([generateLargeString(100 * 1024)]), // 100KB of deterministic data
      });
    }

    // Insert the records into DynamoDB
    console.log("Inserting large records into DynamoDB...");
    const createPromises = largeRecords.map((dino) => table.put(dino).execute());
    await Promise.all(createPromises);
    console.log("Insertion complete");

    return { count, partitionKey: pkValue };
  };

  it("should load large records using toArray()", async () => {
    // Create large records (at least 2 pages of data)
    const recordCount = 20; // Enough records to ensure pagination
    const partitionKey = "dinosaur#large-array";

    const { count, partitionKey: pk } = await createAndInsertLargeRecords(recordCount, partitionKey);

    // Query the records
    console.log("Querying large records...");
    const result = await table.query({ pk }).execute();

    // Convert to array to load all data
    console.log("Loading all records using toArray()...");
    const loadedRecords = await result.toArray();

    // Verify all records were loaded
    expect(loadedRecords).toHaveLength(count);

    // Calculate the total size of the data for logging purposes
    let totalSize = 0;
    for (const record of loadedRecords) {
      if (record.tags instanceof Set) {
        for (const tag of record.tags) {
          totalSize += tag.length;
        }
      }
    }

    console.log(`Total data size loaded: ${totalSize} bytes`);
  });

  it("should load large records using for-await-of iteration", async () => {
    // Create large records (at least 2 pages of data)
    const recordCount = 20; // Enough records to ensure pagination
    const partitionKey = "dinosaur#large-iteration";

    const { count, partitionKey: pk } = await createAndInsertLargeRecords(recordCount, partitionKey);

    // Query the records
    console.log("Querying large records...");
    const result = await table.query({ pk }).execute();

    // Test iterating through the records using for-await-of
    console.log("Testing iteration using for-await-of...");
    let iterationCount = 0;
    for await (const record of result) {
      expect(record.demoPartitionKey).toBe(pk);
      expect(record.name).toMatch(/Large Dino \d+/);
      iterationCount++;
    }

    expect(iterationCount).toBe(count);
    console.log("Iteration test complete");
  });
});
