import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Table } from "../table";
import { createTestTable, type Dinosaur } from "./table-test-setup";

interface DinosaurExcavation {
  demoPartitionKey: string;
  demoSortKey: string;
  organisationId?: string;
  status?: string;
  digitised?: boolean;
  name?: string;
  excavationId?: string;
  dinoSpecies?: string;
  period?: string;
  site?: string;
  weight?: number;
  length?: number;
  completeness?: number;
}

describe("Nested AND Conditions Integration Test - Large Dataset", () => {
  let table: Table;

  // Dinosaur species for variety
  const dinoSpecies = [
    "Tyrannosaurus Rex",
    "Triceratops",
    "Velociraptor",
    "Stegosaurus",
    "Brachiosaurus",
    "Allosaurus",
    "Diplodocus",
    "Ankylosaurus",
    "Spinosaurus",
    "Carnotaurus",
    "Parasaurolophus",
    "Therizinosaurus",
    "Deinonychus",
    "Iguanodon",
    "Compsognathus",
    "Gallimimus",
    "Kentrosaurus",
    "Maiasaura",
    "Orodromeus",
    "Pachycephalosaurus",
  ];

  const periods = ["Triassic", "Jurassic", "Cretaceous"];
  const sites = ["Bone Valley", "Fossil Ridge", "Dino Canyon", "Ancient Plains", "Stone Creek"];
  const statuses = ["draft", "in-progress", "finalised", "archived"];
  const organisations = [
    "5b94480f-fe36-47e6-9369-e8c9534634c6", // Main org we'll filter on
    "paleontology-museum-north",
    "university-dino-dept",
    "fossil-hunters-inc",
    "cretaceous-research-lab",
  ];

  beforeAll(() => {
    table = createTestTable();
  });

  beforeEach(async () => {
    console.log("Creating 2500+ dinosaur excavation records...");
    const excavations: DinosaurExcavation[] = [];

    // Counters for tracking exact distributions
    let targetOrgCount = 0;
    let finalizedCount = 0;
    let digitisedCount = 0;
    let perfectMatchCount = 0;

    // Create 2500 excavation records with controlled variance for better testing
    for (let i = 1; i <= 2500; i++) {
      const paddedId = i.toString().padStart(6, "0");
      const speciesIndex = (i - 1) % dinoSpecies.length;
      const periodIndex = (i - 1) % periods.length;
      const siteIndex = (i - 1) % sites.length;

      // Create sophisticated distribution patterns for better test variance
      const isTargetOrg =
        i <= 500 || // First 500 are target org
        (i >= 1000 && i <= 1200) || // Batch in middle
        (i >= 2000 && i <= 2100) || // Batch near end
        i % 23 === 0; // Scattered throughout using prime number

      const isFinalized =
        (i >= 100 && i <= 800) || // Large batch early
        (i >= 1500 && i <= 1700) || // Batch in middle
        i % 17 === 0; // Scattered pattern using different prime

      const isDigitised =
        i % 4 !== 0 && // 75% base rate
        !(i >= 300 && i <= 350); // Except for a small gap to create variance

      // Use the calculated booleans to set actual values with more variance
      const organisationId = isTargetOrg ? organisations[0] : organisations[(i % 4) + 1];
      const status = isFinalized ? statuses[2] : statuses[i % 4 === 2 ? 0 : i % 3];
      const digitised = isDigitised;

      // Track counts for exact verification
      if (isTargetOrg) targetOrgCount++;
      if (isFinalized) finalizedCount++;
      if (isDigitised) digitisedCount++;
      if (isTargetOrg && isFinalized && isDigitised) perfectMatchCount++;

      excavations.push({
        demoPartitionKey: "type#DINOSAUR_EXCAVATION",
        demoSortKey: `excavationId#${paddedId}`,
        organisationId,
        status,
        digitised,
        name: `${dinoSpecies[speciesIndex]} Excavation ${paddedId}`,
        excavationId: paddedId,
        dinoSpecies: dinoSpecies[speciesIndex],
        period: periods[periodIndex],
        site: sites[siteIndex],
        weight: Math.floor(Math.random() * 15000) + 100, // 100-15000 kg
        length: Math.floor(Math.random() * 30) + 1, // 1-30 meters
        completeness: Math.floor(Math.random() * 100) + 1, // 1-100%
      });
    }

    console.log(`Generated ${excavations.length} excavation records with controlled distribution:`);
    console.log(
      `- Target org (${organisations[0]}): ${targetOrgCount} records (${((targetOrgCount / 2500) * 100).toFixed(1)}%)`,
    );
    console.log(`- Finalised status: ${finalizedCount} records (${((finalizedCount / 2500) * 100).toFixed(1)}%)`);
    console.log(`- Digitised: ${digitisedCount} records (${((digitisedCount / 2500) * 100).toFixed(1)}%)`);
    console.log(
      `- Perfect matches (all 3 criteria): ${perfectMatchCount} records (${((perfectMatchCount / 2500) * 100).toFixed(1)}%)`,
    );

    // Store expected counts for test verification
    (global as any).testExpectedCounts = {
      targetOrg: targetOrgCount,
      finalized: finalizedCount,
      digitised: digitisedCount,
      perfectMatch: perfectMatchCount,
      totalRecords: excavations.length,
    };

    // Batch insert for better performance
    const BATCH_SIZE = 25; // DynamoDB batch write limit
    for (let i = 0; i < excavations.length; i += BATCH_SIZE) {
      const batch = excavations.slice(i, i + BATCH_SIZE);
      const operations = batch.map((excavation) => ({
        type: "put" as const,
        item: excavation,
      }));

      const batchResult = await table.batchWrite<DinosaurExcavation>(operations);
      if (batchResult.unprocessedItems.length > 0) {
        console.warn(
          `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchResult.unprocessedItems.length} unprocessed items`,
        );
      }
    }

    console.log("Finished creating dinosaur excavation records");
  }, 60000); // Increase timeout for data creation

  it("should handle complex nested AND conditions in filter - exact pattern from bug report with large dataset", async () => {
    console.log("Testing nested AND conditions with large dataset...");

    // This is the exact query pattern from the bug report, adapted for dinosaur excavations
    const results = await table
      .query<DinosaurExcavation>({
        pk: "type#DINOSAUR_EXCAVATION",
        sk: (op) => op.beginsWith("excavationId"),
      })
      .filter((op) =>
        op.and(
          op.eq("organisationId", "5b94480f-fe36-47e6-9369-e8c9534634c6"),
          op.eq("status", "finalised"),
          op.eq("digitised", true),
        ),
      )
      .useIndex("gsi1")
      .execute();

    const items = await results.toArray();
    const expectedCounts = (global as any).testExpectedCounts;
    console.log(`Found ${items.length} matching excavations (expected: ${expectedCounts.perfectMatch})`);

    // Verify we got the exact expected count
    expect(items.length).toBe(expectedCounts.perfectMatch);
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(expectedCounts.totalRecords); // Should be filtered subset

    // Verify all returned items match the filter conditions
    for (const item of items) {
      expect(item.organisationId).toBe("5b94480f-fe36-47e6-9369-e8c9534634c6");
      expect(item.status).toBe("finalised");
      expect(item.digitised).toBe(true);
      expect(item.dinoSpecies).toBeDefined();
    }

    // Verify we have a diverse set of dinosaur species in results
    const species = [...new Set(items.map((item) => item.dinoSpecies))];
    expect(species.length).toBeGreaterThan(1);
    console.log(`Species found: ${species.slice(0, 5).join(", ")} (${species.length} unique species)`);

    // Verify distribution stats
    console.log(`Data verification - Expected vs Actual:`);
    console.log(`- Total records: ${expectedCounts.totalRecords}`);
    console.log(
      `- Target org records: ${expectedCounts.targetOrg} (${((expectedCounts.targetOrg / expectedCounts.totalRecords) * 100).toFixed(1)}%)`,
    );
    console.log(
      `- Finalized records: ${expectedCounts.finalized} (${((expectedCounts.finalized / expectedCounts.totalRecords) * 100).toFixed(1)}%)`,
    );
    console.log(
      `- Digitised records: ${expectedCounts.digitised} (${((expectedCounts.digitised / expectedCounts.totalRecords) * 100).toFixed(1)}%)`,
    );
    console.log(
      `- Perfect matches: ${expectedCounts.perfectMatch} (${((expectedCounts.perfectMatch / expectedCounts.totalRecords) * 100).toFixed(1)}%)`,
    );
    console.log(`- Query returned: ${items.length} items - EXACT MATCH ✓`);
  }, 120000);

  it("should handle pagination correctly with large dataset and nested AND filters", async () => {
    console.log("Testing pagination with large dataset and filters...");

    // Use pagination to go through filtered results
    const paginator = table
      .query<DinosaurExcavation>({
        pk: "type#DINOSAUR_EXCAVATION",
        sk: (op) => op.beginsWith("excavationId"),
      })
      .filter((op) =>
        op.and(
          op.eq("organisationId", "5b94480f-fe36-47e6-9369-e8c9534634c6"),
          op.eq("status", "finalised"),
          op.eq("digitised", true),
        ),
      )
      .paginate(50); // 50 items per page

    let totalItems = 0;
    let pageCount = 0;
    const allExcavationIds = new Set<string>();

    // Get first few pages to test pagination behavior
    for (let i = 0; i < 5; i++) {
      const page = await paginator.getNextPage();
      pageCount++;
      totalItems += page.items.length;

      console.log(`Page ${pageCount}: ${page.items.length} items, hasNextPage: ${page.hasNextPage}`);

      // Verify all items on this page match our criteria
      for (const item of page.items) {
        expect(item.organisationId).toBe("5b94480f-fe36-47e6-9369-e8c9534634c6");
        expect(item.status).toBe("finalised");
        expect(item.digitised).toBe(true);

        // Ensure no duplicate excavation IDs across pages
        expect(allExcavationIds.has(item.excavationId!)).toBe(false);
        allExcavationIds.add(item.excavationId!);
      }

      if (!page.hasNextPage) break;
    }

    expect(totalItems).toBeGreaterThan(0);
    expect(pageCount).toBeGreaterThan(0);
    console.log(`Processed ${pageCount} pages with ${totalItems} total items`);
  }, 120000);

  it("should handle nested AND conditions with numerical comparisons on large dataset", async () => {
    console.log("Testing nested AND with numerical conditions...");

    // Find large, heavy, well-preserved dinosaurs from our target organization
    const results = await table
      .query<DinosaurExcavation>({
        pk: "type#DINOSAUR_EXCAVATION",
      })
      .filter((op) =>
        op.and(
          op.eq("organisationId", "5b94480f-fe36-47e6-9369-e8c9534634c6"),
          op.eq("digitised", true),
          op.gt("weight", 5000), // Heavy dinosaurs (> 5 tons)
          op.gt("length", 15), // Long dinosaurs (> 15 meters)
          op.gt("completeness", 80), // Well-preserved (> 80% complete)
        ),
      )
      .execute();

    const items = await results.toArray();
    console.log(`Found ${items.length} large, well-preserved dinosaur excavations`);

    for (const item of items) {
      expect(item.organisationId).toBe("5b94480f-fe36-47e6-9369-e8c9534634c6");
      expect(item.digitised).toBe(true);
      expect(item.weight!).toBeGreaterThan(5000);
      expect(item.length!).toBeGreaterThan(15);
      expect(item.completeness!).toBeGreaterThan(80);
    }

    // Should have some matches but not too many due to strict criteria
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(500);
  }, 120000);

  it("should handle complex filter combinations with OR and AND on large dataset", async () => {
    console.log("Testing complex OR/AND combinations...");

    // Find Cretaceous period dinosaurs that are either very complete OR very large
    const results = await table
      .query<DinosaurExcavation>({
        pk: "type#DINOSAUR_EXCAVATION",
      })
      .filter((op) =>
        op.and(
          op.eq("period", "Cretaceous"),
          op.eq("digitised", true),
          op.or(
            op.and(op.gt("completeness", 90), op.eq("status", "finalised")),
            op.and(op.gt("weight", 10000), op.gt("length", 20)),
          ),
        ),
      )
      .execute();

    const items = await results.toArray();
    console.log(`Found ${items.length} Cretaceous dinosaurs matching complex criteria`);

    for (const item of items) {
      expect(item.period).toBe("Cretaceous");
      expect(item.digitised).toBe(true);

      // Should match one of the OR conditions
      const isHighlyComplete = item.completeness! > 90 && item.status === "finalised";
      const isVeryLarge = item.weight! > 10000 && item.length! > 20;
      expect(isHighlyComplete || isVeryLarge).toBe(true);
    }
  }, 120000);

  it("should handle scan with nested AND on large dataset and verify performance", async () => {
    console.log("Testing scan operation with nested AND conditions...");

    const startTime = Date.now();

    // Scan for specific dinosaur species with our target criteria
    const results = await table
      .scan<DinosaurExcavation>()
      .filter((op) =>
        op.and(
          op.eq("organisationId", "5b94480f-fe36-47e6-9369-e8c9534634c6"),
          op.eq("status", "finalised"),
          op.eq("digitised", true),
          op.contains("dinoSpecies", "Tyrannosaurus"),
        ),
      )
      .execute();

    const items = await results.toArray();
    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`Scan completed in ${duration}ms, found ${items.length} T-Rex excavations`);

    for (const item of items) {
      expect(item.organisationId).toBe("5b94480f-fe36-47e6-9369-e8c9534634c6");
      expect(item.status).toBe("finalised");
      expect(item.digitised).toBe(true);
      expect(item.dinoSpecies).toContain("Tyrannosaurus");
    }

    // Should find some T-Rex excavations
    expect(items.length).toBeGreaterThan(0);

    // Scan should complete in reasonable time even with large dataset
    expect(duration).toBeLessThan(30000); // Less than 30 seconds
  }, 120000);

  it("should return consistent results across multiple query executions", async () => {
    console.log("Testing query consistency across multiple executions...");

    const query = () =>
      table
        .query<DinosaurExcavation>({
          pk: "type#DINOSAUR_EXCAVATION",
          sk: (op) => op.beginsWith("excavationId"),
        })
        .filter((op) =>
          op.and(
            op.eq("organisationId", "5b94480f-fe36-47e6-9369-e8c9534634c6"),
            op.eq("status", "finalised"),
            op.eq("digitised", true),
          ),
        )
        .execute();

    // Execute the same query multiple times
    const [result1, result2, result3] = await Promise.all([query(), query(), query()]);

    const items1 = await result1.toArray();
    const items2 = await result2.toArray();
    const items3 = await result3.toArray();

    // All executions should return the same number of items
    expect(items1.length).toBe(items2.length);
    expect(items2.length).toBe(items3.length);

    console.log(`Consistent results: ${items1.length} items across all executions`);

    // Items should have the same excavation IDs (though order might differ)
    const ids1 = new Set(items1.map((i) => i.excavationId));
    const ids2 = new Set(items2.map((i) => i.excavationId));
    const ids3 = new Set(items3.map((i) => i.excavationId));

    expect(ids1.size).toBe(ids2.size);
    expect(ids2.size).toBe(ids3.size);

    // Check that all IDs are the same across executions
    for (const id of ids1) {
      expect(ids2.has(id)).toBe(true);
      expect(ids3.has(id)).toBe(true);
    }
  }, 120000);

  it("should return empty results when nested AND conditions don't match any records", async () => {
    console.log("Testing query with no matching conditions...");

    // Test with conditions that should not match any items
    const results = await table
      .query<DinosaurExcavation>({
        pk: "type#DINOSAUR_EXCAVATION",
      })
      .filter((op) =>
        op.and(
          op.eq("organisationId", "non-existent-organisation-id"),
          op.eq("status", "finalised"),
          op.eq("digitised", true),
        ),
      )
      .execute();

    const items = await results.toArray();
    expect(items).toHaveLength(0);
    console.log("Correctly returned 0 items for non-matching conditions");
  }, 60000);

  it("should handle limit and pagination correctly with large filtered dataset", async () => {
    console.log("Testing limit and pagination behavior...");

    // Test with a specific limit
    const limitedResults = await table
      .query<DinosaurExcavation>({
        pk: "type#DINOSAUR_EXCAVATION",
      })
      .filter((op) => op.and(op.eq("organisationId", "5b94480f-fe36-47e6-9369-e8c9534634c6"), op.eq("digitised", true)))
      .limit(100)
      .execute();

    const limitedItems = await limitedResults.toArray();
    console.log(`Limited query returned ${limitedItems.length} items`);

    // Should respect the limit
    expect(limitedItems.length).toBeLessThanOrEqual(100);
    expect(limitedItems.length).toBeGreaterThan(0);

    // Test pagination with the same filter
    const paginator = table
      .query<DinosaurExcavation>({
        pk: "type#DINOSAUR_EXCAVATION",
      })
      .filter((op) => op.and(op.eq("organisationId", "5b94480f-fe36-47e6-9369-e8c9534634c6"), op.eq("digitised", true)))
      .paginate(25);

    const page1 = await paginator.getNextPage();
    const page2 = await paginator.getNextPage();

    console.log(`Page 1: ${page1.items.length} items`);
    console.log(`Page 2: ${page2.items.length} items`);

    expect(page1.items.length).toBeGreaterThan(0);
    if (page1.hasNextPage) {
      expect(page2.items.length).toBeGreaterThan(0);
    }

    // Ensure no duplicates between pages
    const page1Ids = new Set(page1.items.map((i) => i.excavationId));
    const page2Ids = new Set(page2.items.map((i) => i.excavationId));

    for (const id of page1Ids) {
      expect(page2Ids.has(id)).toBe(false);
    }
  }, 120000);
});
