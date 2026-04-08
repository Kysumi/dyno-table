import type { Table } from "dyno-table";
import { DinosaurEntity } from "./dinosaur-entity";

// Intentionally inferred exports to validate declaration portability.
export const inferredEntity = DinosaurEntity;

export const createInferredRepository = (table: Table) => {
  return DinosaurEntity.createRepository(table);
};

export const createInferredDietQuery = (table: Table) => {
  return DinosaurEntity.createRepository(table).query.byDiet;
};
