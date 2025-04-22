import { defineEntity } from "../src/entity/entity-class";
import type { StandardSchemaV1 } from "../src/standard-schema";
import type { Table } from "../src/table";
import { partitionKey } from "../src/utils/partition-key-template";
import { sortKey } from "../src/utils/sort-key-template";

interface Animal extends Record<string, unknown> {
  id: string;
  species: string;
  name: string;
  enclosureId: string;
  diet: string;
  age: number;
  createdAt?: string;
  updatedAt?: string;
}

// Define the indexes type
const AnimalIndexes = {
  byEnclosure: {
    gsi: "gsi2",
    partitionKey: partitionKey`ENCLOSURE#${"enclosureId"}`,
    sortKey: sortKey`ANIMAL#${"id"}#SPECIES#${"species"}`,
  },
  bySpeciesAndDiet: {
    gsi: "gsi1",
    partitionKey: partitionKey`SPECIES#${"species"}`,
    sortKey: sortKey`DIET#${"diet"}#ANIMAL#${"id"}`,
  },
} as const;

// This could be Zod, Valibot, or a Arktype schema, anything that implements the StandardSchemaV1 interface
const animalSchema: StandardSchemaV1<Animal, Animal> = {
  "~standard": {
    version: 1,
    vendor: "dyno-table",
    validate: (value: unknown) => {
      if (typeof value !== "object" || value === null) {
        return {
          issues: [{ message: "Value must be an object" }],
        };
      }

      const animal = value as Animal;
      const issues: StandardSchemaV1.Issue[] = [];

      if (typeof animal.id !== "string") {
        issues.push({ message: "id must be a string" });
      }
      if (typeof animal.species !== "string") {
        issues.push({ message: "species must be a string" });
      }
      if (typeof animal.name !== "string") {
        issues.push({ message: "name must be a string" });
      }
      if (typeof animal.enclosureId !== "string") {
        issues.push({ message: "enclosureId must be a string" });
      }
      if (typeof animal.diet !== "string") {
        issues.push({ message: "diet must be a string" });
      }
      if (typeof animal.age !== "number") {
        issues.push({ message: "age must be a number" });
      }

      if (issues.length > 0) {
        return { issues };
      }

      return { value: animal };
    },
    types: {
      input: {} as Animal,
      output: {} as Animal,
    },
  },
};

// Define lifecycle hooks
const animalHooks = {
  beforeCreate: async (data: Animal) => {
    // Add timestamps before creation
    return {
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  },
  beforeUpdate: async (data: Partial<Animal>) => {
    // Update timestamp before update
    return {
      ...data,
      updatedAt: new Date().toISOString(),
    };
  },
  afterGet: async (data: Animal | null) => {
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

const AnimalEntity = defineEntity<Animal, typeof AnimalIndexes>(
  {
    name: "Animal",
    schema: animalSchema,
    primaryKey: {
      partitionKey: partitionKey`ANIMAL#${"id"}`,
      sortKey: sortKey`METADATA#${"species"}`,
    },
    indexes: AnimalIndexes,
  },
  animalHooks,
);

// Example usage
export async function exampleUsage(table: Table) {
  // Create repository
  const animalRepository = AnimalEntity.createRepository(table);

  // Create an animal (will have timestamps added by beforeCreate hook)
  const tiger = await animalRepository.create({
    id: "a123",
    species: "tiger",
    name: "Raja",
    enclosureId: "E5",
    diet: "carnivore",
    age: 5,
  });

  // Query by species and diet
  const carnivores = await animalRepository.query.bySpeciesAndDiet({
    species: "tiger",
    diet: "carnivore",
    id: "123",
  });

  // Query by enclosure
  const enclosureAnimals = await animalRepository.query.byEnclosure({
    enclosureId: "E5",
    id: "a123", // Required by the sort key
    species: "tiger", // Required by the sort key
  });

  // Get a specific animal (name will be transformed to uppercase by afterGet hook)
  const animal = await animalRepository.get({
    pk: "ANIMAL#a123",
    sk: "METADATA#tiger",
  });

  // Update an animal (updatedAt will be set by beforeUpdate hook)
  const updatedAnimal = await animalRepository.update({
    id: "a123",
    species: "tiger",
    age: 6,
  });

  // Delete an animal
  await animalRepository.delete({
    pk: "ANIMAL#a123",
    sk: "METADATA#tiger",
  });

  return {
    tiger,
    carnivores,
    enclosureAnimals,
    animal,
    updatedAnimal,
  };
}
