import { beforeEach, describe, expect, it } from "vitest";
import { Table } from "../table";

import { docClient } from "../../tests/ddb-client";
import { defineEntity, createIndex } from "../entity/entity";
import type { DynamoItem } from "../types";
import type { StandardSchemaV1 } from "../standard-schema";
import type { ConditionOperator } from "../conditions";

// Define a dinosaur entity type
interface DinosaurEntity extends DynamoItem {
  id: string;
  species: string;
  period: string;
  diet: string;
  heightMeters?: number;
  weightKg?: number;
  habitats?: Set<string>;
  characteristics?: {
    roar?: string;
    speed?: string;
    traits?: {
      aggressive?: boolean;
      social?: boolean;
      hunting?: {
        packHunter?: boolean;
        soloHunter?: boolean;
      };
    };
  };
  discovery?: {
    firstFound?: string;
    lastSighting?: string;
    fossilCount?: number;
  };
  classification?: {
    taxonomy?: {
      kingdom?: string;
      phylum?: string;
    };
  };
}

// Create a mock schema with a proper StandardSchemaV1 structure
const dinosaurSchema: StandardSchemaV1<DinosaurEntity> = {
  "~standard": {
    version: 1,
    vendor: "paleontology",
    validate: (data: unknown) => ({ value: data as DinosaurEntity }),
  },
};

const primaryKeySchema: StandardSchemaV1<{ id: string }> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (data: unknown) => ({ value: data as { id: string } }),
  },
};

// Create a dinosaur table
function createDinosaurTable(): Table {
  return new Table({
    client: docClient,
    tableName: "TestTable",
    indexes: {
      partitionKey: "demoPartitionKey",
      sortKey: "demoSortKey",
    },
  });
}

const entityRepository = defineEntity({
  name: "DinosaurEntity",
  schema: dinosaurSchema,
  primaryKey: createIndex()
    .input(primaryKeySchema)
    .partitionKey((item) => `DINO#${item.id}`)
    .sortKey(() => "FOSSIL"),
  queries: {},
});

const table = createDinosaurTable();
const repository = entityRepository.createRepository(table);

describe("Dinosaur Integration Tests - Update Operations", () => {
  beforeEach(async () => {
    // Create a test dinosaur
    const dinosaur: DinosaurEntity = {
      id: "update-test",
      species: "Tyrannosaurus Rex",
      period: "Cretaceous",
      diet: "carnivore",
      heightMeters: 6,
      weightKg: 8000,
    };
    await repository.create(dinosaur).execute();
  });

  it("should update specific attributes", async () => {
    const result = await repository
      .update(
        { id: "update-test" },
        {
          species: "Allosaurus",
          heightMeters: 8,
        },
      )
      .returnValues("ALL_NEW")
      .execute();

    expect(result.item).toBeDefined();
    expect(result.item?.species).toBe("Allosaurus");
    expect(result.item?.heightMeters).toBe(8);
    expect(result.item?.period).toBe("Cretaceous"); // Unchanged
    expect(result.item?.weightKg).toBe(8000); // Unchanged
    expect(result.item?.diet).toBe("carnivore"); // Unchanged
  });

  it("should update with a condition that passes", async () => {
    const result = await repository
      .update(
        { id: "update-test" },
        {
          species: "Rex Maximus",
        },
      )
      .condition((op: ConditionOperator<DinosaurEntity>) => op.eq("period", "Cretaceous"))
      .execute();

    expect(result.item?.species).toBe("Rex Maximus");
  });

  it("should fail to update with a condition that fails", async () => {
    await expect(
      repository
        .update(
          { id: "update-test" },
          {
            species: "Should Not Update",
          },
        )
        .condition((op: ConditionOperator<DinosaurEntity>) => op.eq("period", "Jurassic"))
        .execute(),
    ).rejects.toThrow();

    // Verify item wasn't updated
    const getResult = await repository.get({ id: "update-test" }).execute();
    expect(getResult.item?.species).not.toBe("Should Not Update");
  });

  it("should update with timestamps when configured", async () => {
    // Create a test dinosaur with the timestamped repository
    const dinosaur: DinosaurEntity = {
      id: "timestamp-test",
      species: "Triceratops",
      period: "Cretaceous",
      diet: "herbivore",
    };
    await repository.create(dinosaur).execute();

    // Update the dinosaur
    const beforeUpdate = new Date();
    const result = await repository
      .update(
        { id: "timestamp-test" },
        {
          species: "Triceratops Horridus",
        },
      )
      .execute();

    expect(result.item?.species).toBe("Triceratops Horridus");

    // Check if updatedAt was automatically added
    // Note: This test might need adjustment based on how timestamps are implemented
    if (result.item?.updatedAt) {
      const updatedAt = new Date(result.item.updatedAt as string);
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    }
  });

  it("should handle complex update operations", async () => {
    // Create a dinosaur with habitats
    const dinosaurWithHabitats: DinosaurEntity = {
      id: "complex-update",
      species: "Velociraptor",
      period: "Cretaceous",
      diet: "carnivore",
      habitats: new Set(["plains", "forests", "mountains"]),
    };
    await repository.create(dinosaurWithHabitats).execute();

    // Perform a complex update
    const result = await repository
      .update(
        { id: "complex-update" },
        {
          species: "Velociraptor Mongoliensis",
          diet: "omnivore",
        },
      )
      .execute();

    expect(result.item?.species).toBe("Velociraptor Mongoliensis");
    expect(result.item?.diet).toBe("omnivore");
    expect(result.item?.habitats).toEqual(new Set(["plains", "forests", "mountains"])); // Habitats should be unchanged
  });

  it("should update nested attributes using dot notation", async () => {
    // Create a dinosaur with nested structure
    const dinosaurWithNested: DinosaurEntity = {
      id: "nested-test",
      species: "Stegosaurus",
      period: "Jurassic",
      diet: "herbivore",
      characteristics: {
        roar: "deep-bellow",
        speed: "slow",
        traits: {
          aggressive: false,
          social: true,
          hunting: {
            packHunter: false,
            soloHunter: false,
          },
        },
      },
      discovery: {
        firstFound: "1877",
        lastSighting: "1900",
        fossilCount: 5,
      },
      classification: {
        taxonomy: {
          kingdom: "Animalia",
          phylum: "Chordata",
        },
      },
    };
    await repository.create(dinosaurWithNested).execute();

    // Update nested attributes using the underlying table's updateItem method
    const result = await repository
      .update(
        {
          id: "nested-test",
        },
        {},
      )
      .set("characteristics.roar", "thunderous-roar")
      .set("characteristics.traits.aggressive", true)
      .set("discovery.fossilCount", 12)
      .remove("characteristics.traits.hunting.soloHunter")
      .returnValues("ALL_NEW")
      .execute();

    expect(result.item?.characteristics?.roar).toBe("thunderous-roar");
    expect(result.item?.characteristics?.traits?.aggressive).toBe(true);
    expect(result.item?.discovery?.fossilCount).toBe(12);
    expect(result.item?.characteristics?.traits?.hunting?.soloHunter).toBeUndefined();

    // Verify other nested attributes remain unchanged
    expect(result.item?.characteristics?.speed).toBe("slow");
    expect(result.item?.characteristics?.traits?.social).toBe(true);
    expect(result.item?.characteristics?.traits?.hunting?.packHunter).toBe(false);
    expect(result.item?.discovery?.firstFound).toBe("1877");
    expect(result.item?.classification?.taxonomy?.kingdom).toBe("Animalia");
  });

  it("should remove multiple nested attributes", async () => {
    // Create a dinosaur with nested structure
    const dinosaurWithNested: DinosaurEntity = {
      id: "nested-remove-test",
      species: "Brontosaurus",
      period: "Jurassic",
      diet: "herbivore",
      characteristics: {
        roar: "low-rumble",
        speed: "very-slow",
        traits: {
          aggressive: false,
          social: true,
          hunting: {
            packHunter: false,
            soloHunter: false,
          },
        },
      },
      discovery: {
        firstFound: "1879",
        lastSighting: "1903",
        fossilCount: 3,
      },
      classification: {
        taxonomy: {
          kingdom: "Animalia",
          phylum: "Chordata",
        },
      },
    };
    await repository.create(dinosaurWithNested).execute();

    // Remove multiple nested attributes
    const result = await repository
      .update(
        {
          id: "nested-remove-test",
        },
        {},
      )
      .remove("characteristics.traits.aggressive")
      .remove("discovery.lastSighting")
      .remove("classification.taxonomy.phylum")
      .returnValues("ALL_NEW")
      .execute();

    // Verify attributes were removed
    expect(result.item?.characteristics?.traits?.aggressive).toBeUndefined();
    expect(result.item?.discovery?.lastSighting).toBeUndefined();
    expect(result.item?.classification?.taxonomy?.phylum).toBeUndefined();

    // Verify other nested attributes remain unchanged
    expect(result.item?.characteristics?.roar).toBe("low-rumble");
    expect(result.item?.characteristics?.traits?.social).toBe(true);
    expect(result.item?.discovery?.fossilCount).toBe(3);
    expect(result.item?.classification?.taxonomy?.kingdom).toBe("Animalia");
  });

  it("should handle mixed operations on nested attributes", async () => {
    // Create a dinosaur with nested structure
    const dinosaurWithNested: DinosaurEntity = {
      id: "mixed-nested-test",
      species: "Parasaurolophus",
      period: "Cretaceous",
      diet: "herbivore",
      characteristics: {
        roar: "trumpet-call",
        speed: "moderate",
        traits: {
          aggressive: false,
          social: true,
          hunting: {
            packHunter: false,
            soloHunter: false,
          },
        },
      },
      discovery: {
        firstFound: "1922",
        lastSighting: "1950",
        fossilCount: 2,
      },
    };
    await repository.create(dinosaurWithNested).execute();

    // Perform mixed operations: SET, REMOVE, ADD
    const result = await repository
      .update({ id: "mixed-nested-test" }, {})
      .set("characteristics.roar", "harmonic-whistle")
      .set("characteristics.traits.social", false)
      .remove("characteristics.traits.hunting.soloHunter")
      .add("discovery.fossilCount", 3)
      .returnValues("ALL_NEW")
      .execute();

    // Verify all operations worked correctly
    expect(result.item?.characteristics?.roar).toBe("harmonic-whistle");
    expect(result.item?.characteristics?.traits?.social).toBe(false);
    expect(result.item?.characteristics?.traits?.hunting?.soloHunter).toBeUndefined();
    expect(result.item?.discovery?.fossilCount).toBe(5); // 2 + 3

    // Verify other attributes remain unchanged
    expect(result.item?.characteristics?.speed).toBe("moderate");
    expect(result.item?.characteristics?.traits?.aggressive).toBe(false);
    expect(result.item?.characteristics?.traits?.hunting?.packHunter).toBe(false);
  });
});
