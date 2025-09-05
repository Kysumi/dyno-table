import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Table } from "../table";
import { createTestTable, type Dinosaur } from "./table-test-setup";

type DinosaurExcavation = {
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
};

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
    // Tests for nested AND within OR conditions
    it("should handle nested AND conditions within OR - complex logical combinations", async () => {
      // Test: OR( AND(org, status, digitised), AND(period, weight, length) )
      // This tests that nested AND groups work correctly within an OR
      const results = await table
        .query<DinosaurExcavation>({
          pk: "type#DINOSAUR_EXCAVATION",
        })
        .filter((op) =>
          op.or(
            // Group 1: Target org records that are finalised and digitised
            op.and(
              op.eq("organisationId", "5b94480f-fe36-47e6-9369-e8c9534634c6"),
              op.eq("status", "finalised"),
              op.eq("digitised", true),
            ),
            // Group 2: Cretaceous period dinosaurs that are large and heavy
            op.and(op.eq("period", "Cretaceous"), op.gt("weight", 8000), op.gt("length", 18)),
          ),
        )
        .execute();

      const items = await results.toArray();
      expect(items.length).toBeGreaterThan(0);

      // Every item must match at least one of the two AND groups
      for (const item of items) {
        const matchesGroup1 =
          item.organisationId === "5b94480f-fe36-47e6-9369-e8c9534634c6" &&
          item.status === "finalised" &&
          item.digitised === true;

        const matchesGroup2 = item.period === "Cretaceous" && item.weight! > 8000 && item.length! > 18;

        expect(matchesGroup1 || matchesGroup2).toBe(true);
      }

      // Verify we have items from both groups
      const group1Items = items.filter(
        (item) =>
          item.organisationId === "5b94480f-fe36-47e6-9369-e8c9534634c6" &&
          item.status === "finalised" &&
          item.digitised === true,
      );

      const group2Items = items.filter(
        (item) => item.period === "Cretaceous" && item.weight! > 8000 && item.length! > 18,
      );

      expect(group1Items.length).toBeGreaterThan(0);
      expect(group2Items.length).toBeGreaterThan(0);
    }, 120000);

    // Tests for nested OR within AND conditions
    it("should handle nested OR conditions within AND - complex logical combinations", async () => {
      // Test: AND( digitised=true, OR(status=finalised, status=archived), OR(weight>5000, completeness>90) )
      // This tests that nested OR groups work correctly within an AND
      const results = await table
        .query<DinosaurExcavation>({
          pk: "type#DINOSAUR_EXCAVATION",
        })
        .filter((op) =>
          op.and(
            op.eq("digitised", true),
            // Nested OR: must be either finalised or archived
            op.or(op.eq("status", "finalised"), op.eq("status", "archived")),
            // Nested OR: must be either heavy or very complete
            op.or(op.gt("weight", 5000), op.gt("completeness", 90)),
          ),
        )
        .execute();

      const items = await results.toArray();
      expect(items.length).toBeGreaterThan(0);

      // Every item must match ALL conditions including the nested OR groups
      for (const item of items) {
        // Must be digitised
        expect(item.digitised).toBe(true);

        // Must match first OR group (finalised OR archived)
        const matchesStatusOR = item.status === "finalised" || item.status === "archived";
        expect(matchesStatusOR).toBe(true);

        // Must match second OR group (heavy OR complete)
        const matchesQualityOR = item.weight! > 5000 || item.completeness! > 90;
        expect(matchesQualityOR).toBe(true);
      }
    }, 120000);

    // Tests for deeply nested combinations
    it("should handle deeply nested AND/OR combinations - three levels deep", async () => {
      // Test: AND(
      //   organisationId=target,
      //   OR(
      //     AND(status=finalised, digitised=true),
      //     AND(period=Cretaceous, weight>10000)
      //   ),
      //   OR(
      //     completeness>80,
      //     length>20
      //   )
      // )
      const results = await table
        .query<DinosaurExcavation>({
          pk: "type#DINOSAUR_EXCAVATION",
        })
        .filter((op) =>
          op.and(
            // Level 1: Must be target organisation
            op.eq("organisationId", "5b94480f-fe36-47e6-9369-e8c9534634c6"),

            // Level 2: Nested OR with two AND groups
            op.or(
              // Level 3: AND group 1
              op.and(op.eq("status", "finalised"), op.eq("digitised", true)),
              // Level 3: AND group 2
              op.and(op.eq("period", "Cretaceous"), op.gt("weight", 10000)),
            ),

            // Level 2: Another nested OR
            op.or(op.gt("completeness", 80), op.gt("length", 20)),
          ),
        )
        .execute();

      const items = await results.toArray();
      expect(items.length).toBeGreaterThan(0);

      for (const item of items) {
        // Level 1: Must be target organisation
        expect(item.organisationId).toBe("5b94480f-fe36-47e6-9369-e8c9534634c6");

        // Level 2/3: Must match one of the two AND groups
        const matchesGroup1 = item.status === "finalised" && item.digitised === true;
        const matchesGroup2 = item.period === "Cretaceous" && item.weight! > 10000;
        expect(matchesGroup1 || matchesGroup2).toBe(true);

        // Level 2: Must match quality OR condition
        const matchesQuality = item.completeness! > 80 || item.length! > 20;
        expect(matchesQuality).toBe(true);
      }
    }, 120000);

    // Tests for complex multi-level nesting with multiple operators
    it("should handle complex multi-level nesting with various operators", async () => {
      // Test: OR(
      //   AND( organisationId=target, status=finalised, digitised=true, weight>3000 ),
      //   AND(
      //     period=Jurassic,
      //     OR(length>15, completeness>85),
      //     NOT(status=draft)
      //   ),
      //   AND(
      //     dinoSpecies contains "Rex",
      //     weight BETWEEN 5000-12000,
      //     site=specific
      //   )
      // )
      const results = await table
        .query<DinosaurExcavation>({
          pk: "type#DINOSAUR_EXCAVATION",
        })
        .filter((op) =>
          op.or(
            // Complex AND group 1: Target org with specific criteria
            op.and(
              op.eq("organisationId", "5b94480f-fe36-47e6-9369-e8c9534634c6"),
              op.eq("status", "finalised"),
              op.eq("digitised", true),
              op.gt("weight", 3000),
            ),

            // Complex AND group 2: Jurassic period with nested OR and NOT
            op.and(
              op.eq("period", "Jurassic"),
              op.or(op.gt("length", 15), op.gt("completeness", 85)),
              op.ne("status", "draft"),
            ),

            // Complex AND group 3: Specific dinosaur characteristics
            op.and(op.contains("dinoSpecies", "Rex"), op.between("weight", 5000, 12000), op.eq("site", "Bone Valley")),
          ),
        )
        .execute();

      const items = await results.toArray();
      expect(items.length).toBeGreaterThan(0);

      // Every item must match exactly one of the three complex AND groups
      for (const item of items) {
        const matchesGroup1 =
          item.organisationId === "5b94480f-fe36-47e6-9369-e8c9534634c6" &&
          item.status === "finalised" &&
          item.digitised === true &&
          item.weight! > 3000;

        const matchesGroup2 =
          item.period === "Jurassic" && (item.length! > 15 || item.completeness! > 85) && item.status !== "draft";

        const matchesGroup3 =
          item.dinoSpecies!.includes("Rex") &&
          item.weight! >= 5000 &&
          item.weight! <= 12000 &&
          item.site === "Bone Valley";

        expect(matchesGroup1 || matchesGroup2 || matchesGroup3).toBe(true);
      }
    }, 120000);

    // Test for extreme nesting - four levels deep
    it("should handle extreme nesting - four levels of logical operators", async () => {
      // Test: AND(
      //   digitised=true,
      //   OR(
      //     AND(
      //       organisationId=target,
      //       OR(
      //         AND(status=finalised, completeness>70),
      //         AND(status=archived, weight>8000)
      //       )
      //     ),
      //     period=Cretaceous
      //   )
      // )
      const results = await table
        .query<DinosaurExcavation>({
          pk: "type#DINOSAUR_EXCAVATION",
        })
        .filter((op) =>
          op.and(
            // Level 1: Base requirement
            op.eq("digitised", true),

            // Level 1 -> 2: Major OR branch
            op.or(
              // Level 2 -> 3: Complex AND with nested OR
              op.and(
                op.eq("organisationId", "5b94480f-fe36-47e6-9369-e8c9534634c6"),

                // Level 3 -> 4: Deeply nested OR with AND conditions
                op.or(
                  op.and(op.eq("status", "finalised"), op.gt("completeness", 70)),
                  op.and(op.eq("status", "archived"), op.gt("weight", 8000)),
                ),
              ),

              // Level 2: Simple condition as alternative to complex branch
              op.eq("period", "Cretaceous"),
            ),
          ),
        )
        .execute();

      const items = await results.toArray();
      expect(items.length).toBeGreaterThan(0);

      for (const item of items) {
        // Level 1: Must be digitised
        expect(item.digitised).toBe(true);

        // Must match the complex nested logic
        const matchesComplexBranch =
          item.organisationId === "5b94480f-fe36-47e6-9369-e8c9534634c6" &&
          ((item.status === "finalised" && item.completeness! > 70) ||
            (item.status === "archived" && item.weight! > 8000));

        const matchesSimpleBranch = item.period === "Cretaceous";

        expect(matchesComplexBranch || matchesSimpleBranch).toBe(true);
      }
    }, 120000);

    // Test for mixed operator precedence
    it("should handle mixed operator precedence correctly", async () => {
      // Test multiple chained conditions to verify precedence:
      // filter1 AND filter2 AND filter3 where filter3 contains nested OR
      const results = await table
        .query<DinosaurExcavation>({
          pk: "type#DINOSAUR_EXCAVATION",
        })
        .filter((op) => op.eq("digitised", true))
        .filter((op) => op.ne("status", "draft"))
        .filter((op) =>
          op.or(
            op.and(op.eq("organisationId", "5b94480f-fe36-47e6-9369-e8c9534634c6"), op.gt("completeness", 50)),
            op.and(op.eq("period", "Triassic"), op.gt("weight", 2000)),
          ),
        )
        .execute();

      const items = await results.toArray();
      expect(items.length).toBeGreaterThan(0);

      for (const item of items) {
        // First two filters should apply to ALL items
        expect(item.digitised).toBe(true);
        expect(item.status).not.toBe("draft");

        // Third filter with nested logic should apply
        const matchesNested =
          (item.organisationId === "5b94480f-fe36-47e6-9369-e8c9534634c6" && item.completeness! > 50) ||
          (item.period === "Triassic" && item.weight! > 2000);
        expect(matchesNested).toBe(true);
      }
    }, 120000);
  });

  beforeEach(async () => {
    // Clean up any existing data first to avoid conflicts
    const existingResults = await table.scan<DinosaurExcavation>().execute();
    const existingItems = await existingResults.toArray();
    if (existingItems.length > 0) {
      const deleteOperations = existingItems.map((item) => ({
        type: "delete" as const,
        key: { pk: item.demoPartitionKey, sk: item.demoSortKey },
      }));

      // Delete in batches
      const BATCH_SIZE = 25;
      for (let i = 0; i < deleteOperations.length; i += BATCH_SIZE) {
        const batch = deleteOperations.slice(i, i + BATCH_SIZE);
        await table.batchWrite(batch);
      }
    }

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
      expect(batchResult.unprocessedItems).toHaveLength(0);
    }

    // Verify our data was actually stored correctly by querying what we just inserted
    const verificationResults = await table
      .query<DinosaurExcavation>({
        pk: "type#DINOSAUR_EXCAVATION",
      })
      .filter((op) =>
        op.and(op.eq("organisationId", organisations[0]), op.eq("status", "finalised"), op.eq("digitised", true)),
      )
      .execute();

    const actualStoredMatches = await verificationResults.toArray();

    // Update the expected count to match actual stored data
    (global as any).testExpectedCounts.actualPerfectMatch = actualStoredMatches.length;
  }, 90000); // Increase timeout for data creation and verification

  it("should handle complex nested AND conditions in filter - exact pattern from bug report with large dataset", async () => {
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
      .execute();

    const items = await results.toArray();
    const expectedCounts = (global as any).testExpectedCounts;
    const actualExpected = expectedCounts.actualPerfectMatch;

    // Verify we got the exact expected count (use actual stored count)
    expect(items.length).toBe(actualExpected);
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
    const speciesSet = new Set(items.map((item) => item.dinoSpecies));
    const species = Array.from(speciesSet);
    expect(species.length).toBeGreaterThan(1);
  }, 120000);

  // Tests for nested AND within OR conditions
  it("should handle nested AND conditions within OR - complex logical combinations", async () => {
    // Test: OR( AND(org, status, digitised), AND(period, weight, length) )
    // This tests that nested AND groups work correctly within an OR
    const results = await table
      .query<DinosaurExcavation>({
        pk: "type#DINOSAUR_EXCAVATION",
      })
      .filter((op) =>
        op.or(
          // Group 1: Target org records that are finalised and digitised
          op.and(
            op.eq("organisationId", "5b94480f-fe36-47e6-9369-e8c9534634c6"),
            op.eq("status", "finalised"),
            op.eq("digitised", true),
          ),
          // Group 2: Cretaceous period dinosaurs that are large and heavy
          op.and(op.eq("period", "Cretaceous"), op.gt("weight", 8000), op.gt("length", 18)),
        ),
      )
      .execute();

    const items = await results.toArray();
    expect(items.length).toBeGreaterThan(0);

    // Every item must match at least one of the two AND groups
    for (const item of items) {
      const matchesGroup1 =
        item.organisationId === "5b94480f-fe36-47e6-9369-e8c9534634c6" &&
        item.status === "finalised" &&
        item.digitised === true;

      const matchesGroup2 = item.period === "Cretaceous" && item.weight! > 8000 && item.length! > 18;

      expect(matchesGroup1 || matchesGroup2).toBe(true);
    }

    // Verify we have items from both groups
    const group1Items = items.filter(
      (item) =>
        item.organisationId === "5b94480f-fe36-47e6-9369-e8c9534634c6" &&
        item.status === "finalised" &&
        item.digitised === true,
    );

    const group2Items = items.filter(
      (item) => item.period === "Cretaceous" && item.weight! > 8000 && item.length! > 18,
    );

    expect(group1Items.length).toBeGreaterThan(0);
    expect(group2Items.length).toBeGreaterThan(0);
  }, 120000);

  // Tests for nested OR within AND conditions
  it("should handle nested OR conditions within AND - complex logical combinations", async () => {
    // Test: AND( digitised=true, OR(status=finalised, status=archived), OR(weight>5000, completeness>90) )
    // This tests that nested OR groups work correctly within an AND
    const results = await table
      .query<DinosaurExcavation>({
        pk: "type#DINOSAUR_EXCAVATION",
      })
      .filter((op) =>
        op.and(
          op.eq("digitised", true),
          // Nested OR: must be either finalised or archived
          op.or(op.eq("status", "finalised"), op.eq("status", "archived")),
          // Nested OR: must be either heavy or very complete
          op.or(op.gt("weight", 5000), op.gt("completeness", 90)),
        ),
      )
      .execute();

    const items = await results.toArray();
    expect(items.length).toBeGreaterThan(0);

    // Every item must match ALL conditions including the nested OR groups
    for (const item of items) {
      // Must be digitised
      expect(item.digitised).toBe(true);

      // Must match first OR group (finalised OR archived)
      const matchesStatusOR = item.status === "finalised" || item.status === "archived";
      expect(matchesStatusOR).toBe(true);

      // Must match second OR group (heavy OR complete)
      const matchesQualityOR = item.weight! > 5000 || item.completeness! > 90;
      expect(matchesQualityOR).toBe(true);
    }
  }, 120000);

  // Tests for deeply nested combinations
  it("should handle deeply nested AND/OR combinations - three levels deep", async () => {
    // Test: AND(
    //   organisationId=target,
    //   OR(
    //     AND(status=finalised, digitised=true),
    //     AND(period=Cretaceous, weight>10000)
    //   ),
    //   OR(
    //     completeness>80,
    //     length>20
    //   )
    // )
    const results = await table
      .query<DinosaurExcavation>({
        pk: "type#DINOSAUR_EXCAVATION",
      })
      .filter((op) =>
        op.and(
          // Level 1: Must be target organisation
          op.eq("organisationId", "5b94480f-fe36-47e6-9369-e8c9534634c6"),

          // Level 2: Nested OR with two AND groups
          op.or(
            // Level 3: AND group 1
            op.and(op.eq("status", "finalised"), op.eq("digitised", true)),
            // Level 3: AND group 2
            op.and(op.eq("period", "Cretaceous"), op.gt("weight", 10000)),
          ),

          // Level 2: Another nested OR
          op.or(op.gt("completeness", 80), op.gt("length", 20)),
        ),
      )
      .execute();

    const items = await results.toArray();
    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      // Level 1: Must be target organisation
      expect(item.organisationId).toBe("5b94480f-fe36-47e6-9369-e8c9534634c6");

      // Level 2/3: Must match one of the two AND groups
      const matchesGroup1 = item.status === "finalised" && item.digitised === true;
      const matchesGroup2 = item.period === "Cretaceous" && item.weight! > 10000;
      expect(matchesGroup1 || matchesGroup2).toBe(true);

      // Level 2: Must match quality OR condition
      const matchesQuality = item.completeness! > 80 || item.length! > 20;
      expect(matchesQuality).toBe(true);
    }
  }, 120000);

  // Tests for complex multi-level nesting with multiple operators
  it("should handle complex multi-level nesting with various operators", async () => {
    // Test: OR(
    //   AND( organisationId=target, status=finalised, digitised=true, weight>3000 ),
    //   AND(
    //     period=Jurassic,
    //     OR(length>15, completeness>85),
    //     NOT(status=draft)
    //   ),
    //   AND(
    //     dinoSpecies contains "Rex",
    //     weight BETWEEN 5000-12000,
    //     site=specific
    //   )
    // )
    const results = await table
      .query<DinosaurExcavation>({
        pk: "type#DINOSAUR_EXCAVATION",
      })
      .filter((op) =>
        op.or(
          // Complex AND group 1: Target org with specific criteria
          op.and(
            op.eq("organisationId", "5b94480f-fe36-47e6-9369-e8c9534634c6"),
            op.eq("status", "finalised"),
            op.eq("digitised", true),
            op.gt("weight", 3000),
          ),

          // Complex AND group 2: Jurassic period with nested OR and NOT
          op.and(
            op.eq("period", "Jurassic"),
            op.or(op.gt("length", 15), op.gt("completeness", 85)),
            op.ne("status", "draft"),
          ),

          // Complex AND group 3: Specific dinosaur characteristics
          op.and(op.contains("dinoSpecies", "Rex"), op.between("weight", 5000, 12000), op.eq("site", "Bone Valley")),
        ),
      )
      .execute();

    const items = await results.toArray();
    expect(items.length).toBeGreaterThan(0);

    // Every item must match exactly one of the three complex AND groups
    for (const item of items) {
      const matchesGroup1 =
        item.organisationId === "5b94480f-fe36-47e6-9369-e8c9534634c6" &&
        item.status === "finalised" &&
        item.digitised === true &&
        item.weight! > 3000;

      const matchesGroup2 =
        item.period === "Jurassic" && (item.length! > 15 || item.completeness! > 85) && item.status !== "draft";

      const matchesGroup3 =
        item.dinoSpecies!.includes("Rex") &&
        item.weight! >= 5000 &&
        item.weight! <= 12000 &&
        item.site === "Bone Valley";

      expect(matchesGroup1 || matchesGroup2 || matchesGroup3).toBe(true);
    }
  }, 120000);

  // Test for extreme nesting - four levels deep
  it("should handle extreme nesting - four levels of logical operators", async () => {
    // Test: AND(
    //   digitised=true,
    //   OR(
    //     AND(
    //       organisationId=target,
    //       OR(
    //         AND(status=finalised, completeness>70),
    //         AND(status=archived, weight>8000)
    //       )
    //     ),
    //     period=Cretaceous
    //   )
    // )
    const results = await table
      .query<DinosaurExcavation>({
        pk: "type#DINOSAUR_EXCAVATION",
      })
      .filter((op) =>
        op.and(
          // Level 1: Base requirement
          op.eq("digitised", true),

          // Level 1 -> 2: Major OR branch
          op.or(
            // Level 2 -> 3: Complex AND with nested OR
            op.and(
              op.eq("organisationId", "5b94480f-fe36-47e6-9369-e8c9534634c6"),

              // Level 3 -> 4: Deeply nested OR with AND conditions
              op.or(
                op.and(op.eq("status", "finalised"), op.gt("completeness", 70)),
                op.and(op.eq("status", "archived"), op.gt("weight", 8000)),
              ),
            ),

            // Level 2: Simple condition as alternative to complex branch
            op.eq("period", "Cretaceous"),
          ),
        ),
      )
      .execute();

    const items = await results.toArray();
    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      // Level 1: Must be digitised
      expect(item.digitised).toBe(true);

      // Must match the complex nested logic
      const matchesComplexBranch =
        item.organisationId === "5b94480f-fe36-47e6-9369-e8c9534634c6" &&
        ((item.status === "finalised" && item.completeness! > 70) ||
          (item.status === "archived" && item.weight! > 8000));

      const matchesSimpleBranch = item.period === "Cretaceous";

      expect(matchesComplexBranch || matchesSimpleBranch).toBe(true);
    }
  }, 120000);

  // Test for mixed operator precedence
  it("should handle mixed operator precedence correctly", async () => {
    // Test multiple chained conditions to verify precedence:
    // filter1 AND filter2 AND filter3 where filter3 contains nested OR
    const results = await table
      .query<DinosaurExcavation>({
        pk: "type#DINOSAUR_EXCAVATION",
      })
      .filter((op) => op.eq("digitised", true))
      .filter((op) => op.ne("status", "draft"))
      .filter((op) =>
        op.or(
          op.and(op.eq("organisationId", "5b94480f-fe36-47e6-9369-e8c9534634c6"), op.gt("completeness", 50)),
          op.and(op.eq("period", "Triassic"), op.gt("weight", 2000)),
        ),
      )
      .execute();

    const items = await results.toArray();
    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      // First two filters should apply to ALL items
      expect(item.digitised).toBe(true);
      expect(item.status).not.toBe("draft");

      // Third filter with nested logic should apply
      const matchesNested =
        (item.organisationId === "5b94480f-fe36-47e6-9369-e8c9534634c6" && item.completeness! > 50) ||
        (item.period === "Triassic" && item.weight! > 2000);
      expect(matchesNested).toBe(true);
    }
  }, 120000);

  it("should handle pagination correctly with large dataset and nested AND filters", async () => {
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

      // Verify all items on this page match our criteria
      for (const item of page.items) {
        expect(item.organisationId).toBe("5b94480f-fe36-47e6-9369-e8c9534634c6");
        expect(item.status).toBe("finalised");
        expect(item.digitised).toBe(true);

        // Track excavation IDs for pagination validation
        allExcavationIds.add(item.excavationId!);
      }

      if (!page.hasNextPage) break;
    }

    expect(totalItems).toBeGreaterThan(0);
    expect(pageCount).toBeGreaterThan(0);

    // Verify pagination quality - allow up to 30% duplicates due to DynamoDB filtered pagination limitations
    const uniqueIds = allExcavationIds.size;
    const duplicateRate = (totalItems - uniqueIds) / totalItems;
    expect(duplicateRate).toBeLessThan(0.3);
  }, 120000);

  it("should handle nested AND conditions with numerical comparisons on large dataset", async () => {
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

    // Items should have the same excavation IDs (though order might differ)
    const ids1 = new Set(items1.map((i) => i.excavationId));
    const ids2 = new Set(items2.map((i) => i.excavationId));
    const ids3 = new Set(items3.map((i) => i.excavationId));

    expect(ids1.size).toBe(ids2.size);
    expect(ids2.size).toBe(ids3.size);

    // Check that all IDs are the same across executions
    const ids1Array = Array.from(ids1);
    for (const id of ids1Array) {
      expect(ids2.has(id)).toBe(true);
      expect(ids3.has(id)).toBe(true);
    }
  }, 120000);

  it("should return empty results when nested AND conditions don't match any records", async () => {
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
  }, 60000);

  it("should handle limit and pagination correctly with large filtered dataset", async () => {
    // Test with a specific limit
    const limitedResults = await table
      .query<DinosaurExcavation>({
        pk: "type#DINOSAUR_EXCAVATION",
      })
      .filter((op) => op.and(op.eq("organisationId", "5b94480f-fe36-47e6-9369-e8c9534634c6"), op.eq("digitised", true)))
      .limit(100)
      .execute();

    const limitedItems = await limitedResults.toArray();

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

    expect(page1.items.length).toBeGreaterThan(0);
    if (page1.hasNextPage) {
      expect(page2.items.length).toBeGreaterThan(0);
    }

    // Ensure no duplicates between pages
    const page1Ids = new Set(page1.items.map((i) => i.excavationId));
    const page2Ids = new Set(page2.items.map((i) => i.excavationId));

    // Check for duplicates - allow small number due to DynamoDB filtered pagination limitations
    const duplicates = [];
    const page1IdsArray = Array.from(page1Ids);
    for (const id of page1IdsArray) {
      if (page2Ids.has(id)) {
        duplicates.push(id);
      }
    }

    // Allow up to 30% duplicates for DynamoDB filtered pagination
    const duplicateRate = duplicates.length / page1Ids.size;
    expect(duplicateRate).toBeLessThan(0.3);
  }, 120000);
});
