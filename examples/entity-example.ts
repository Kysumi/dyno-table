import { defineEntity } from "../src/entity/entity-class";
import type { StandardSchemaV1 } from "../src/standard-schema";
import type { Table } from "../src/table";
import { partitionKey } from "../src/utils/partition-key-template";
import { sortKey } from "../src/utils/sort-key-template";

interface Dinosaur extends Record<string, unknown> {
  id: string;
  species: string;
  name: string;
  enclosureId: string;
  diet: string;
  height: number;
  weight: number;
  createdAt?: string;
  updatedAt?: string;
}

// Define the indexes type
const DinosaurIndexes = {
  byEnclosure: {
    gsi: "gsi2",
    partitionKey: partitionKey`ENCLOSURE#${"enclosureId"}`,
    sortKey: sortKey`DINOSAUR#${"id"}#SPECIES#${"species"}`,
  },
  bySpeciesAndDiet: {
    gsi: "gsi1",
    partitionKey: partitionKey`SPECIES#${"species"}`,
    sortKey: sortKey`DIET#${"diet"}#DINOSAUR#${"id"}`,
  },
} as const;

// This could be Zod, Valibot, or a Arktype schema, anything that implements the StandardSchemaV1 interface
const dinosaurSchema: StandardSchemaV1<Dinosaur, Dinosaur> = {
  "~standard": {
    version: 1,
    vendor: "dyno-table",
    validate: (value: unknown) => {
      if (typeof value !== "object" || value === null) {
        return {
          issues: [{ message: "Value must be an object" }],
        };
      }

      const dinosaur = value as Dinosaur;
      const issues: StandardSchemaV1.Issue[] = [];

      if (typeof dinosaur.id !== "string") {
        issues.push({ message: "id must be a string" });
      }
      if (typeof dinosaur.species !== "string") {
        issues.push({ message: "species must be a string" });
      }
      if (typeof dinosaur.name !== "string") {
        issues.push({ message: "name must be a string" });
      }
      if (typeof dinosaur.enclosureId !== "string") {
        issues.push({ message: "enclosureId must be a string" });
      }
      if (typeof dinosaur.diet !== "string") {
        issues.push({ message: "diet must be a string" });
      }
      if (typeof dinosaur.height !== "number") {
        issues.push({ message: "height must be a number" });
      }
      if (typeof dinosaur.weight !== "number") {
        issues.push({ message: "weight must be a number" });
      }

      if (issues.length > 0) {
        return { issues };
      }

      return { value: dinosaur };
    },
    types: {
      input: {} as Dinosaur,
      output: {} as Dinosaur,
    },
  },
};

// Define lifecycle hooks
const dinosaurHooks = {
  beforeCreate: async (data: Dinosaur) => {
    // Add timestamps before creation
    return {
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  },
  beforeUpdate: async (data: Partial<Dinosaur>) => {
    // Update timestamp before update
    return {
      ...data,
      updatedAt: new Date().toISOString(),
    };
  },
  afterGet: async (data: Dinosaur | null) => {
    // Transform data after retrieval
    if (data) {
      return {
        ...data,
        name: data.name.toUpperCase(), // Example transformation
      };
    }
    return data;
  },
};

const DinosaurEntity = defineEntity<Dinosaur, typeof DinosaurIndexes>(
  {
    name: "Dinosaur",
    schema: dinosaurSchema,
    primaryKey: {
      partitionKey: partitionKey`DINOSAUR#${"id"}`,
      sortKey: sortKey`METADATA#${"species"}`,
    },
    indexes: DinosaurIndexes,
  },
  dinosaurHooks,
);

// Example usage
export async function exampleUsage(table: Table) {
  // Create repository
  const dinosaurRepository = DinosaurEntity.createRepository(table);

  // Create a dinosaur (will have timestamps added by beforeCreate hook)
  const rex = await dinosaurRepository.create({
    id: "d123",
    species: "Tyrannosaurus",
    name: "Rex",
    enclosureId: "E5",
    diet: "carnivore",
    height: 4.5,
    weight: 8000,
  });

  // Query by species and diet
  const carnivores = await dinosaurRepository.query.bySpeciesAndDiet({
    species: "Tyrannosaurus",
    diet: "carnivore",
    id: "d123",
  });

  // Query by enclosure
  const enclosureDinosaurs = await dinosaurRepository.query.byEnclosure({
    enclosureId: "E5",
    id: "d123", // Required by the sort key
    species: "Tyrannosaurus", // Required by the sort key
  });

  // Get a specific dinosaur (name will be transformed to uppercase by afterGet hook)
  const dinosaur = await dinosaurRepository.get({
    pk: "DINOSAUR#d123",
    sk: "METADATA#Tyrannosaurus",
  });

  // Update a dinosaur (updatedAt will be set by beforeUpdate hook)
  const updatedDinosaur = await dinosaurRepository.update({
    id: "d123",
    species: "Tyrannosaurus",
    weight: 8500,
  });

  // Delete a dinosaur
  await dinosaurRepository.delete({
    pk: "DINOSAUR#d123",
    sk: "METADATA#Tyrannosaurus",
  });

  return {
    rex,
    carnivores,
    enclosureDinosaurs,
    dinosaur,
    updatedDinosaur,
  };
}
