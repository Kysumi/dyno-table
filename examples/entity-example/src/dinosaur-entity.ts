import { z } from "zod";
import { sortKey } from "dyno-table/utils/sort-key-template";
import { partitionKey } from "dyno-table/utils/partition-key-template";
import { createIndex, createQueries, defineEntity } from "dyno-table/entity";

const dinosaurSchema = z.object({
  id: z.string(),
  species: z.string(),
  name: z.string(),
  diet: z.enum(["carnivore", "herbivore", "omnivore"]),
  dangerLevel: z.number().int().min(1).max(10),
  height: z.number().positive(),
  weight: z.number().positive().default(1), // Default to 1kg (positive number)
  status: z.enum(["active", "inactive", "sick", "deceased"]),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Define the input type (what you provide when creating - weight is optional due to default)
export type DinosaurInput = z.input<typeof dinosaurSchema>;

// Define the entity type (what exists in database - weight is required after defaults applied)
export type Dinosaur = z.output<typeof dinosaurSchema>;

// Define key templates for Dinosaur entity
const dinosaurPK = partitionKey`ENTITY#DINOSAUR#DIET#${"diet"}`;
const dinosaurSK = sortKey`ID#${"id"}#SPECIES#${"species"}`;

// Create a primary index for Dinosaur entity
const primaryKey = createIndex()
  .input(z.object({ id: z.string(), diet: z.string(), species: z.string() }))
  .partitionKey(({ diet }) => dinosaurPK({ diet }))
  .sortKey(({ id, species }) => dinosaurSK({ species, id }));

// Create a query builder for our entity
const createQuery = createQueries<Dinosaur>();

// Define queries
const queries = {
  byDiet: createQuery.input(z.object({ diet: z.string() })).query(({ input, entity }) => {
    return entity.query({ pk: dinosaurPK({ diet: input.diet }) });
  }),
  /**
   * Scan query
   */
  bySpecies: createQuery
    .input(
      z.object({
        species: z.string(),
      }),
    )
    .query(({ input, entity }) => {
      return entity.scan().filter((op) => op.eq("species", input.species));
    }),
};

// Define the Dinosaur entity - now automatically handles schemas with defaults!
export const DinosaurEntity = defineEntity({
  name: "Dinosaur",
  schema: dinosaurSchema,
  primaryKey,
  queries: queries,
});

// Example usage demonstrating the type safety:
//
// Creating a dinosaur (uses DinosaurInput - weight is optional due to default):
// const repo = DinosaurEntity.createRepository(table);
// await repo.create({
//   id: "dino-001",
//   species: "Tyrannosaurus Rex",
//   name: "Rexy",
//   diet: "carnivore",
//   dangerLevel: 10,
//   height: 5.2,
//   // weight is optional here due to default value
//   status: "active"
// }).execute();
//
// Querying dinosaurs (returns Dinosaur type - weight is required):
// const results = await repo.query.byDiet({ diet: "carnivore" }).execute();
// results.forEach(dino => {
//   console.log(dino.weight); // TypeScript knows this is always a number
// });
