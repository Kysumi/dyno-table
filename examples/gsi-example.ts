import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import type { TableConfig } from "../src/types";
import { Table } from "../src/table";

// Define entity types for our single-table design
type EntityType = "DINOSAUR" | "FOSSIL" | "HABITAT" | "PERIOD";

// Define base entity type with common attributes
type BaseEntity = {
  pk: string;
  sk: string;
  gsi1pk: string;
  gsi2pk: string;
  gsi3pk: string;
  entityType: EntityType;
  createdAt: string;
  updatedAt: string;
};

// Define dinosaur type
type Dinosaur = BaseEntity & {
  entityType: "DINOSAUR";
  dinoId: string;
  species: string;
  diet: "Carnivore" | "Herbivore" | "Omnivore";
  periodId: string;
  length: number;
  weight: number;
  habitatId: string;
};

// Define period type
type Period = BaseEntity & {
  entityType: "PERIOD";
  periodId: string;
  name: string;
  startMya: number; // millions of years ago
  endMya: number;
};

// Define habitat type
type Habitat = BaseEntity & {
  entityType: "HABITAT";
  habitatId: string;
  name: string;
  climate: string;
  terrain: string;
};

// Define fossil type
type Fossil = BaseEntity & {
  entityType: "FOSSIL";
  fossilId: string;
  dinoId: string;
  discoveryLocation: string;
  discoveryDate: string;
  completeness: number; // percentage of skeleton found
};

// Define table configuration with GSIs
type DinoTableConfig = TableConfig & {
  indexes: {
    partitionKey: string;
    sortKey: string;
    gsis: {
      gsi1: {
        partitionKey: string;
        sortKey?: string;
      };
      gsi2: {
        partitionKey: string;
        sortKey?: string;
      };
      gsi3: {
        partitionKey: string;
        sortKey?: string;
      };
    };
  };
};

// Create DynamoDB client
const client = DynamoDBDocument.from(new DynamoDBClient({}));

// Create table instance with the typed configuration
const dinoTable = new Table<DinoTableConfig>({
  client,
  tableName: "DinosaurData",
  indexes: {
    partitionKey: "pk",
    sortKey: "sk",
    gsis: {
      gsi1: {
        partitionKey: "gsi1pk",
      },
      gsi2: {
        partitionKey: "gsi2pk",
      },
      gsi3: {
        partitionKey: "gsi3pk",
      },
    },
  },
});

async function getDinosaursBySpecies(species: string): Promise<Dinosaur[]> {
  const result = await dinoTable
    .query<Dinosaur>({
      pk: species,
    })
    .useIndex("gsi1")
    .execute();

  return result.toArray();
}

async function getDinosaursByPeriod(periodId: string): Promise<Dinosaur[]> {
  const result = await dinoTable
    .query<Dinosaur>({
      pk: periodId,
    })
    .useIndex("gsi2")
    .execute();

  return result.toArray();
}

async function getDinosaursByHabitat(habitatId: string): Promise<Dinosaur[]> {
  const result = await dinoTable
    .query<Dinosaur>({
      pk: habitatId,
    })
    .useIndex("gsi3")
    .execute();

  return result.toArray();
}

async function getDinosaurWithFossils(dinoId: string): Promise<{
  dinosaur: Dinosaur | undefined;
  fossils: Fossil[];
}> {
  // Get the dinosaur
  const dinoResult = await dinoTable
    .query<Dinosaur>({
      pk: `DINOSAUR#${dinoId}`,
      sk: (op) => op.eq(`METADATA#${dinoId}`),
    })
    .execute();

  // Get all fossils for this dinosaur
  const fossilsResult = await dinoTable
    .query<Fossil>({
      pk: `DINOSAUR#${dinoId}`,
      sk: (op) => op.beginsWith("FOSSIL#"),
    })
    .execute();

  return {
    dinosaur: (await dinoResult.toArray())[0],
    fossils: await fossilsResult.toArray(),
  };
}

// Example function demonstrating the type safety
async function demonstrateTypeSafety(page: Record<string, unknown>) {
  // This would cause a TypeScript error because "NonExistentIndex" is not a valid GSI
  // const result = await dinoTable
  //   .query<Dinosaur>({
  //     pk: "some-value",
  //   })
  //   .useIndex("NonExistentIndex")
  //   .execute();

  const result = await dinoTable
    .query<Dinosaur>({
      pk: "PERIOD#jurassic",
    })
    .useIndex("gsi2") // TypeScript will validate that "PeriodIndex" exists
    .limit(10)
    .sortDescending()
    .startFrom(page)
    .execute();

  return result.toArray();
}

async function createDinosaur(
  dinoData: Omit<Dinosaur, "pk" | "sk" | "createdAt" | "updatedAt" | "entityType">,
): Promise<Dinosaur> {
  const now = new Date().toISOString();

  const dinosaur = {
    ...dinoData,
    pk: `DINOSAUR#${dinoData.dinoId}`,
    sk: `METADATA#${dinoData.dinoId}`,
    entityType: "DINOSAUR" as const,
    createdAt: now,
    updatedAt: now,
  } as Dinosaur;

  await dinoTable.put(dinosaur).execute();

  return dinosaur;
}

async function createFossil(
  fossilData: Omit<Fossil, "pk" | "sk" | "createdAt" | "updatedAt" | "entityType">,
): Promise<Fossil> {
  const now = new Date().toISOString();

  const newFossil = {
    ...fossilData,
    pk: `DINOSAUR#${fossilData.dinoId}`,
    sk: `FOSSIL#${fossilData.fossilId}`,
    entityType: "FOSSIL" as const,
    createdAt: now,
    updatedAt: now,
  } as Fossil;

  const fossil = await dinoTable.put(newFossil).returnValues("CONSISTENT").execute();

  if (!fossil) {
    throw new Error("Fossil not created");
  }

  return fossil;
}

async function updateDinosaurHabitat(dinoId: string, habitatId: string): Promise<void> {
  await dinoTable
    .update<Dinosaur>({
      pk: `DINOSAUR#${dinoId}`,
      sk: `METADATA#${dinoId}`,
    })
    .set("habitatId", habitatId)
    .set("updatedAt", new Date().toISOString())
    .execute();
}
