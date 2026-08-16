import { z } from "zod";
import { createIndex, defineCollection, defineEntity } from "../src/entity";
import { Table } from "../src/table";
import type { TableConfig } from "../src/types";
import { dbClient } from "./db-client";

const statusSchema = z.enum(["ACTIVE", "INACTIVE"]);
const dinosaurSchema = z.object({
  id: z.string(),
  location: z.string(),
  name: z.string(),
  status: statusSchema,
});
const warehouseSchema = z.object({
  id: z.string(),
  location: z.string(),
  capacity: z.number(),
  status: statusSchema,
});

const DinosaurEntity = defineEntity({
  name: "Dinosaur",
  schema: dinosaurSchema,
  primaryKey: createIndex()
    .input(dinosaurSchema)
    .partitionKey(({ id }) => `DINOSAUR#${id}`)
    .sortKey(() => "METADATA"),
  indexes: {
    GSI1: createIndex()
      .input(dinosaurSchema.pick({ id: true, location: true }))
      .partitionKey(({ location }) => `LOCATION#${location}`)
      .sortKey(({ id }) => `DINOSAUR#${id}`),
  },
  queries: {},
});

const WarehouseEntity = defineEntity({
  name: "Warehouse",
  schema: warehouseSchema,
  primaryKey: createIndex()
    .input(warehouseSchema)
    .partitionKey(({ id }) => `WAREHOUSE#${id}`)
    .sortKey(() => "METADATA"),
  indexes: {
    GSI1: createIndex()
      .input(warehouseSchema.pick({ id: true, location: true }))
      .partitionKey(({ location }) => `LOCATION#${location}`)
      .sortKey(({ id }) => `WAREHOUSE#${id}`),
  },
  queries: {},
});

interface LocalTableConfig extends TableConfig {
  indexes: {
    partitionKey: "demoPartitionKey";
    sortKey: "demoSortKey";
    gsis: {
      GSI1: { partitionKey: "GSI1PK"; sortKey: "GSI1SK" };
    };
  };
}

const table = new Table<LocalTableConfig>({
  client: dbClient,
  tableName: "TestTable",
  indexes: {
    partitionKey: "demoPartitionKey",
    sortKey: "demoSortKey",
    gsis: { GSI1: { partitionKey: "GSI1PK", sortKey: "GSI1SK" } },
  },
});

await DinosaurEntity.createRepository(table)
  .upsert({ id: "dino-1", location: "WELLINGTON", name: "Geoff", status: "ACTIVE" })
  .execute();
await WarehouseEntity.createRepository(table)
  .upsert({ id: "warehouse-1", location: "WELLINGTON", capacity: 100, status: "ACTIVE" })
  .execute();

const inventory = defineCollection({
  entities: { Dinosaur: DinosaurEntity, Warehouse: WarehouseEntity },
  indexName: "GSI1",
});

const iterator = await inventory
  .createReader(table)
  .query({ pk: "LOCATION#WELLINGTON" })
  .filter((op) => op.eq("status", "ACTIVE"))
  .execute();
const data = await iterator.toArray();
