import { describe, it, expect, vi } from "vitest";
import { createIndex, createQueries, defineEntity } from "../entity";
import { partitionKey } from "../utils/partition-key-template";
import { sortKey } from "../utils/sort-key-template";
import type { StandardSchemaV1 } from "../standard-schema";
import type { Table } from "../table";
import type { QueryBuilder } from "../builders/query-builder";
import type { DynamoItem, TableConfig } from "../types";

// Define the Dinosaur type
type Dinosaur = {
  id: string;
  species: string;
  name: string;
  diet: "carnivore" | "herbivore" | "omnivore";
  dangerLevel: number;
  height: number;
  weight: number;
  status: "active" | "inactive" | "sick" | "deceased";
  createdAt?: string;
  updatedAt?: string;
};

// Create a standard schema for Dinosaur
const dinosaurSchema: StandardSchemaV1<Dinosaur> = {
  "~standard": {
    version: 1,
    vendor: "standard",
    validate: (value: unknown) => {
      // Simple validation logic
      const errors: { message: string; path?: (string | number)[] }[] = [];

      if (typeof value !== "object" || value === null) {
        return { issues: [{ message: "Expected an object" }] };
      }

      const dinosaur = value as Record<string, unknown>;

      // Validate required fields
      const requiredFields = ["id", "species", "name", "diet", "dangerLevel", "height", "weight", "status"];
      for (const field of requiredFields) {
        if (!(field in dinosaur)) {
          errors.push({ message: `Missing required field: ${field}`, path: [field] });
        }
      }

      // Validate field types
      if (typeof dinosaur.id !== "string") {
        errors.push({ message: "id must be a string", path: ["id"] });
      }

      if (typeof dinosaur.species !== "string") {
        errors.push({ message: "species must be a string", path: ["species"] });
      }

      if (typeof dinosaur.name !== "string") {
        errors.push({ message: "name must be a string", path: ["name"] });
      }

      if (!["carnivore", "herbivore", "omnivore"].includes(dinosaur.diet as string)) {
        errors.push({ message: "diet must be one of: carnivore, herbivore, omnivore", path: ["diet"] });
      }

      if (typeof dinosaur.dangerLevel !== "number" || dinosaur.dangerLevel < 1 || dinosaur.dangerLevel > 10) {
        errors.push({ message: "dangerLevel must be a number between 1 and 10", path: ["dangerLevel"] });
      }

      if (typeof dinosaur.height !== "number" || dinosaur.height <= 0) {
        errors.push({ message: "height must be a positive number", path: ["height"] });
      }

      if (typeof dinosaur.weight !== "number" || dinosaur.weight <= 0) {
        errors.push({ message: "weight must be a positive number", path: ["weight"] });
      }

      if (!["active", "inactive", "sick", "deceased"].includes(dinosaur.status as string)) {
        errors.push({ message: "status must be one of: active, inactive, sick, deceased", path: ["status"] });
      }

      if ("createdAt" in dinosaur && typeof dinosaur.createdAt !== "string") {
        errors.push({ message: "createdAt must be a string", path: ["createdAt"] });
      }

      if ("updatedAt" in dinosaur && typeof dinosaur.updatedAt !== "string") {
        errors.push({ message: "updatedAt must be a string", path: ["updatedAt"] });
      }

      if (errors.length > 0) {
        return { issues: errors };
      }

      return { value: value as Dinosaur };
    },
    types: {
      input: {} as Dinosaur,
      output: {} as Dinosaur,
    },
  },
};

type PKSchema = {
  id: string;
  diet: string;
  species: string;
};

const pk: StandardSchemaV1<PKSchema> = {
  "~standard": {
    version: 1,
    vendor: "standard",
    validate: (value: unknown) => {
      console.log("PK validate: ", value);
      // Simple validation logic
      const errors: { message: string; path?: (string | number)[] }[] = [];

      if (typeof value !== "object" || value === null) {
        return { issues: [{ message: "Expected an object" }] };
      }

      const dinosaur = value as Record<string, unknown>;

      if (errors.length > 0) {
        return { issues: errors };
      }

      return { value: value as Dinosaur };
    },
    types: {
      input: {} as Dinosaur,
      output: {} as Dinosaur,
    },
  },
};

// Define key templates for Dinosaur entity
const dinosaurPK = partitionKey`ENTITY#DINOSAUR#DIET#${"diet"}`;
const dinosaurSK = sortKey`ID#${"id"}#SPECIES#${"species"}`;

// Create a primary index for Dinosaur entity
const primaryKey = createIndex()
  .input(pk)
  .partitionKey(({ diet }) => dinosaurPK({ diet }))
  .sortKey(({ id, species }) => dinosaurSK({ species, id }));

// Create a query builder for our entity
const createQuery = createQueries<Dinosaur>();

// Define the Dinosaur entity
const DinosaurEntity = defineEntity({
  name: "Dinosaur",
  schema: dinosaurSchema,
  primaryKey,
  queries: {
    byDiet: createQuery.input(pk).query(({ input, entity }) => {
      console.log("byDiet input: ", input, " entity ->", entity);
      const t = entity.query({ pk: dinosaurPK({ diet: input.diet }) });
      console.log("byDiet t: ", t);
      return t;
    }),
    /**
     * Scan query
     */
    bySpecies: createQuery.input(pk).query(({ input, entity }) => {
      return entity.scan().filter((op) => op.eq("species", input.species));
    }),
  },
});

describe("DinosaurEntity", () => {
  it("should define an entity with queries", async () => {
    // Create a mock query builder that will be returned by the table.query method
    const mockQueryBuilder = {
      filter: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue({ items: [] }),
    } as unknown as QueryBuilder<Dinosaur, TableConfig>;

    // Create a mock table instance
    const mockTable = {
      tableName: "MockTable",
      partitionKey: "pk",
      sortKey: "sk",
      gsis: {},
      query: vi.fn().mockReturnValue(mockQueryBuilder),
      scan: vi.fn().mockReturnValue({
        filter: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ items: [] }),
      }),
    } as unknown as Table;

    // Create the repository with the mock table
    const repository = DinosaurEntity.createRepository(mockTable);

    // Call the byDiet query
    const queryResult = repository.query.byDiet({ 
      diet: "carnivore", 
      id: "123", 
      species: "triceratops" 
    });

    // Verify that the table.query method was called with the correct parameters
    expect(mockTable.query).toHaveBeenCalledWith({ 
      pk: "ENTITY#DINOSAUR#DIET#carnivore" 
    });

    // Verify that the query builder was returned
    expect(queryResult).toBe(mockQueryBuilder);
  });
});
