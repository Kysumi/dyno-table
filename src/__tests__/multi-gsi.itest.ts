import { beforeEach, describe, expect, it } from "vitest";
import { Table } from "../table";
import { docClient } from "../../tests/ddb-client";

// Define our dinosaur type with multiple GSI attributes
interface Dinosaur extends Record<string, unknown> {
  demoPartitionKey: string;
  demoSortKey: string;
  // GSI1: Query by period and diet
  GSI1PK: string;
  GSI1SK: string;
  // GSI2: Query by habitat and size
  GSI2PK: string;
  GSI2SK: string;
  // GSI3: Query by discovery year
  GSI3PK: string;

  name: string;
  species: string;
  diet: string;
  period: string;
  length: number;
  weight: number;
  habitat: string;
  discoveryYear: number;
}

describe("Multiple GSI Integration Tests", () => {
  // Sample dinosaurs for testing
  const dinosaurs: Dinosaur[] = [
    {
      demoPartitionKey: "DINO#trex1",
      demoSortKey: "METADATA#trex1",
      // GSI1: Period + Diet
      GSI1PK: "PERIOD#cretaceous",
      GSI1SK: "DIET#carnivore",
      // GSI2: Habitat + Size (length in meters)
      GSI2PK: "HABITAT#forest",
      GSI2SK: "SIZE#12",
      // GSI3: Discovery year
      GSI3PK: "YEAR#1902",

      name: "Tyrannosaurus Rex",
      species: "T-Rex",
      diet: "carnivore",
      period: "cretaceous",
      length: 12,
      weight: 8000,
      habitat: "forest",
      discoveryYear: 1902,
    },
    {
      demoPartitionKey: "DINO#stego1",
      demoSortKey: "METADATA#stego1",
      // GSI1: Period + Diet
      GSI1PK: "PERIOD#jurassic",
      GSI1SK: "DIET#herbivore",
      // GSI2: Habitat + Size
      GSI2PK: "HABITAT#plains",
      GSI2SK: "SIZE#09",
      // GSI3: Discovery year
      GSI3PK: "YEAR#1877",

      name: "Stegosaurus",
      species: "Stegosaurus",
      diet: "herbivore",
      period: "jurassic",
      length: 9,
      weight: 5000,
      habitat: "plains",
      discoveryYear: 1877,
    },
    {
      demoPartitionKey: "DINO#raptor1",
      demoSortKey: "METADATA#raptor1",
      // GSI1: Period + Diet
      GSI1PK: "PERIOD#cretaceous",
      GSI1SK: "DIET#carnivore",
      // GSI2: Habitat + Size
      GSI2PK: "HABITAT#plains",
      GSI2SK: "SIZE#02",
      // GSI3: Discovery year
      GSI3PK: "YEAR#1924",

      name: "Velociraptor",
      species: "Velociraptor",
      diet: "carnivore",
      period: "cretaceous",
      length: 2,
      weight: 15,
      habitat: "plains",
      discoveryYear: 1924,
    },
    {
      demoPartitionKey: "DINO#brach1",
      demoSortKey: "METADATA#brach1",
      // GSI1: Period + Diet
      GSI1PK: "PERIOD#jurassic",
      GSI1SK: "DIET#herbivore",
      // GSI2: Habitat + Size
      GSI2PK: "HABITAT#forest",
      GSI2SK: "SIZE#25",
      // GSI3: Discovery year
      GSI3PK: "YEAR#1903",

      name: "Brachiosaurus",
      species: "Brachiosaurus",
      diet: "herbivore",
      period: "jurassic",
      length: 25,
      weight: 50000,
      habitat: "forest",
      discoveryYear: 1903,
    },
    {
      demoPartitionKey: "DINO#anky1",
      demoSortKey: "METADATA#anky1",
      // GSI1: Period + Diet
      GSI1PK: "PERIOD#cretaceous",
      GSI1SK: "DIET#herbivore",
      // GSI2: Habitat + Size
      GSI2PK: "HABITAT#plains",
      GSI2SK: "SIZE#07",
      // GSI3: Discovery year
      GSI3PK: "YEAR#1908",

      name: "Ankylosaurus",
      species: "Ankylosaurus",
      diet: "herbivore",
      period: "cretaceous",
      length: 7,
      weight: 6000,
      habitat: "plains",
      discoveryYear: 1908,
    },
  ];

  let table: Table;

  beforeEach(async () => {
    // Initialize table with multiple GSI configuration
    table = new Table({
      client: docClient,
      tableName: "TestTable",
      indexes: {
        partitionKey: "demoPartitionKey",
        sortKey: "demoSortKey",
        gsis: {
          GSI1: {
            partitionKey: "GSI1PK",
            sortKey: "GSI1SK",
          },
          GSI2: {
            partitionKey: "GSI2PK",
            sortKey: "GSI2SK",
          },
          GSI3: {
            partitionKey: "GSI3PK",
          },
        },
      },
    });

    // Insert test data
    for (const dino of dinosaurs) {
      await table.put(dino).execute();
    }
  });

  describe("Multiple GSI Access Patterns", () => {
    it("should query dinosaurs by period and diet using GSI1", async () => {
      // Query for Cretaceous herbivores
      const result = await table
        .query<Dinosaur>({
          pk: "PERIOD#cretaceous",
          sk: (op) => op.beginsWith("DIET#herbivore"),
        })
        .useIndex("GSI1")
        .execute();

      // Should find 1 Cretaceous herbivore
      const items = await result.toArray();
      expect(items).toHaveLength(1);
      expect(items[0]?.name).toBe("Ankylosaurus");
    });

    it("should query dinosaurs by habitat and size range using GSI2", async () => {
      // Query for plains dinosaurs with size between 2 and 10 meters
      const result = await table
        .query<Dinosaur>({
          pk: "HABITAT#plains",
          sk: (op) => op.between("SIZE#02", "SIZE#10"),
        })
        .useIndex("GSI2")
        .execute();

      // Should find 3 plains dinosaurs in this size range
      const items = await result.toArray();
      expect(items).toHaveLength(3);

      // Verify the correct dinosaurs were returned
      const dinoNames = items.map((dino) => dino.name as string).sort();
      expect(dinoNames).toEqual(["Ankylosaurus", "Stegosaurus", "Velociraptor"].sort());
    });

    it("should query dinosaurs by discovery year using GSI3", async () => {
      // Query for dinosaurs discovered before 1900
      const result = await table
        .query<Dinosaur>({
          pk: "YEAR#1877",
        })
        .useIndex("GSI3")
        .execute();

      // Should find 1 dinosaur discovered in 1877
      const items = await result.toArray();
      expect(items).toHaveLength(1);
      expect(items[0]?.name).toBe("Stegosaurus");
    });

    it("should combine GSI query with filtering for complex access patterns", async () => {
      // Query for forest dinosaurs and filter by weight
      const result = await table
        .query<Dinosaur>({
          pk: "HABITAT#forest",
        })
        .useIndex("GSI2")
        .filter((op) => op.gt("weight", 10000))
        .execute();

      // Should find 1 heavy forest dinosaur
      const items = await result.toArray();
      expect(items).toHaveLength(1);
      expect(items[0]?.name).toBe("Brachiosaurus");
    });

    it("should handle complex filtering with multiple conditions", async () => {
      // Query for Jurassic dinosaurs and apply complex filter
      const result = await table
        .query<Dinosaur>({
          pk: "PERIOD#jurassic",
        })
        .useIndex("GSI1")
        .filter((op) => op.and(op.eq("diet", "herbivore"), op.gt("length", 10)))
        .execute();

      // Should find 1 large Jurassic herbivore
      const items = await result.toArray();
      expect(items).toHaveLength(1);
      expect(items[0]?.name).toBe("Brachiosaurus");
    });

    it("should support different access patterns with different GSIs", async () => {
      // First query: Find dinosaurs by period (GSI1)
      const periodResult = await table
        .query<Dinosaur>({
          pk: "PERIOD#jurassic",
        })
        .useIndex("GSI1")
        .execute();

      // Second query: Find dinosaurs by habitat (GSI2)
      const habitatResult = await table
        .query<Dinosaur>({
          pk: "HABITAT#forest",
        })
        .useIndex("GSI2")
        .execute();

      // Third query: Find dinosaurs by discovery year (GSI3)
      const yearResult = await table
        .query<Dinosaur>({
          pk: "YEAR#1903",
        })
        .useIndex("GSI3")
        .execute();

      // Verify each query returned the expected results
      const periodItems = await periodResult.toArray();
      const habitatItems = await habitatResult.toArray();
      const yearItems = await yearResult.toArray();

      expect(periodItems).toHaveLength(2); // 2 Jurassic dinosaurs
      expect(habitatItems).toHaveLength(2); // 2 forest dinosaurs
      expect(yearItems).toHaveLength(1); // 1 dinosaur discovered in 1903

      // Verify specific dinosaurs
      const jurassicNames = periodItems.map((d) => d.name as string).sort();
      const forestNames = habitatItems.map((d) => d.name as string).sort();

      expect(jurassicNames).toEqual(["Brachiosaurus", "Stegosaurus"].sort());
      expect(forestNames).toEqual(["Brachiosaurus", "Tyrannosaurus Rex"].sort());
      expect(yearItems[0]?.name).toBe("Brachiosaurus");
    });
  });
});
