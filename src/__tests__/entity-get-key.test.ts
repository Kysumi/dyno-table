import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { createIndex, defineEntity } from "../entity/entity";

const dinosaurSchema = z.object({
  id: z.string(),
  diet: z.enum(["carnivore", "herbivore"]),
  name: z.string(),
});

const DinosaurEntity = defineEntity({
  name: "Dinosaur",
  schema: dinosaurSchema,
  primaryKey: createIndex()
    .input(z.object({ id: z.string(), diet: z.enum(["carnivore", "herbivore"]) }))
    .partitionKey(({ diet }) => `DIET#${diet}`)
    .sortKey(({ id }) => `DINO#${id}`),
  queries: {},
});

const HabitatEntity = defineEntity({
  name: "Habitat",
  schema: z.object({ id: z.string(), name: z.string() }),
  primaryKey: createIndex()
    .input(z.object({ id: z.string() }))
    .partitionKey(({ id }) => `HABITAT#${id}`)
    .withoutSortKey(),
  queries: {},
});

describe("entity getKey", () => {
  it("generates the partition and sort key from the primary key input", () => {
    expect(DinosaurEntity.getKey({ id: "rex", diet: "carnivore" })).toEqual({ pk: "DIET#carnivore", sk: "DINO#rex" });
  });

  it("omits the sort key when the primary index has none", () => {
    expect(HabitatEntity.getKey({ id: "paddock-a" })).toEqual({ pk: "HABITAT#paddock-a" });
  });

  it("requires every field of the primary key input", () => {
    // @ts-expect-error diet is needed to build the partition key
    expect(() => DinosaurEntity.getKey({ id: "rex" })).toThrow();
    // @ts-expect-error diet must match the primary key schema
    expect(() => DinosaurEntity.getKey({ id: "rex", diet: "omnivore" })).toThrow();
  });

  it("types the key shape from the primary index", () => {
    expectTypeOf(DinosaurEntity.getKey).parameter(0).toEqualTypeOf<{ id: string; diet: "carnivore" | "herbivore" }>();
    expectTypeOf(DinosaurEntity.getKey).returns.toEqualTypeOf<{ pk: string; sk: string }>();
    expectTypeOf(HabitatEntity.getKey).returns.toEqualTypeOf<{ pk: string }>();
  });
});
