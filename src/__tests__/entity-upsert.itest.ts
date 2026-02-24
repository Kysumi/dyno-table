import { beforeEach, describe, expect, it } from "vitest";
import { docClient } from "../../tests/ddb-client";
import { createIndex, defineEntity } from "../entity/entity";
import type { StandardSchemaV1 } from "../standard-schema";
import { Table } from "../table";
import type { DynamoItem } from "../types";

interface DinosaurEntity extends DynamoItem {
  id: string;
  species: string;
  period: string;
  diet: string;
  heightMeters?: number;
}

const dinosaurSchema: StandardSchemaV1<DinosaurEntity> = {
  "~standard": {
    version: 1,
    vendor: "test",
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

function createTable(): Table {
  return new Table({
    client: docClient,
    tableName: "TestTable",
    indexes: {
      partitionKey: "demoPartitionKey",
      sortKey: "demoSortKey",
    },
  });
}

const entityDef = defineEntity({
  name: "DinosaurUpsert",
  schema: dinosaurSchema,
  primaryKey: createIndex()
    .input(primaryKeySchema)
    .partitionKey((item) => `DINO-UPSERT#${item.id}`)
    .sortKey(() => "PROFILE"),
  queries: {},
});

const table = createTable();
const repository = entityDef.createRepository(table);

describe("Entity Upsert Integration Tests", () => {
  beforeEach(async () => {
    // Clean up any items that may exist from previous test runs
    const ids = ["new-dino", "existing-dino", "overwrite-dino"];
    await Promise.allSettled(ids.map((id) => repository.delete({ id }).execute()));
  });

  it("regression: execute() should not throw when item does not previously exist (returnValues: NONE default)", async () => {
    // This is the regression test for the bug where upsert always threw because
    // the underlying put uses returnValues: "NONE" by default, meaning DynamoDB
    // returns nothing — and the old execute wrapper treated that as a failure.
    const dino: DinosaurEntity = {
      id: "new-dino",
      species: "Velociraptor",
      period: "Cretaceous",
      diet: "carnivore",
    };

    await expect(repository.upsert(dino).execute()).resolves.not.toThrow();
  });

  it("should return the enriched item (with generated keys and entityType) after upserting a new item", async () => {
    const dino: DinosaurEntity = {
      id: "new-dino",
      species: "Triceratops",
      period: "Cretaceous",
      diet: "herbivore",
      heightMeters: 3,
    };

    const result = await repository.upsert(dino).execute();

    expect(result).toBeDefined();
    // Original fields preserved
    expect(result).toMatchObject(dino);
    // Generated keys present
    expect(result.demoPartitionKey).toBe("DINO-UPSERT#new-dino");
    expect(result.demoSortKey).toBe("PROFILE");
    // Entity type attribute present
    expect(result.entityType).toBe("DinosaurUpsert");
  });

  it("should persist the item to DynamoDB so it can be retrieved afterwards", async () => {
    const dino: DinosaurEntity = {
      id: "new-dino",
      species: "Brachiosaurus",
      period: "Jurassic",
      diet: "herbivore",
    };

    await repository.upsert(dino).execute();

    const getResult = await repository.get({ id: "new-dino" }).execute();
    expect(getResult.item).toBeDefined();
    expect(getResult.item?.species).toBe("Brachiosaurus");
    expect(getResult.item?.period).toBe("Jurassic");
  });

  it("should overwrite an existing item without throwing", async () => {
    const original: DinosaurEntity = {
      id: "overwrite-dino",
      species: "T-Rex",
      period: "Cretaceous",
      diet: "carnivore",
      heightMeters: 6,
    };

    await repository.upsert(original).execute();

    const updated: DinosaurEntity = {
      id: "overwrite-dino",
      species: "T-Rex Updated",
      period: "Cretaceous",
      diet: "carnivore",
      heightMeters: 7,
    };

    const result = await repository.upsert(updated).execute();

    expect(result).toBeDefined();
    expect(result.species).toBe("T-Rex Updated");
    expect(result.heightMeters).toBe(7);

    // Verify the change is persisted
    const getResult = await repository.get({ id: "overwrite-dino" }).execute();
    expect(getResult.item?.species).toBe("T-Rex Updated");
  });

  it("should return data consistent with what is stored in DynamoDB", async () => {
    const dino: DinosaurEntity = {
      id: "existing-dino",
      species: "Stegosaurus",
      period: "Jurassic",
      diet: "herbivore",
      heightMeters: 4,
    };

    const upsertResult = await repository.upsert(dino).execute();
    const getResult = await repository.get({ id: "existing-dino" }).execute();

    expect(upsertResult.demoPartitionKey).toBe(getResult.item?.demoPartitionKey);
    expect(upsertResult.demoSortKey).toBe(getResult.item?.demoSortKey);
    expect(upsertResult.entityType).toBe(getResult.item?.entityType);
    expect(upsertResult.species).toBe(getResult.item?.species);
  });
});
