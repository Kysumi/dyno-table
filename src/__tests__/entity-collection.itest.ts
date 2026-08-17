import { beforeEach, describe, expect, it } from "vitest";
import { docClient } from "../../tests/ddb-client";
import { defineCollection } from "../entity/collection";
import { createIndex, defineEntity } from "../entity/entity";
import type { StandardSchemaV1 } from "../standard-schema";
import { Table } from "../table";
import type { DynamoItem } from "../types";

interface Dinosaur extends DynamoItem {
  id: string;
  location: string;
  name: string;
  status: string;
}

interface Warehouse extends DynamoItem {
  id: string;
  location: string;
  capacity: number;
  status: string;
}

function schema<T>(): StandardSchemaV1<T> {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value) => ({ value: value as T }),
    },
  };
}

const DinosaurEntity = defineEntity({
  name: "Dinosaur",
  schema: schema<Dinosaur>(),
  primaryKey: createIndex()
    .input(schema<{ id: string }>())
    .partitionKey(({ id }) => `DINOSAUR#${id}`)
    .sortKey(() => "METADATA"),
  indexes: {
    GSI1: createIndex()
      .input(schema<Dinosaur>())
      .partitionKey(({ location }) => `LOCATION#${location}`)
      .sortKey(({ id }) => `DINOSAUR#${id}`),
  },
  queries: {},
});

const WarehouseEntity = defineEntity({
  name: "Warehouse",
  schema: schema<Warehouse>(),
  primaryKey: createIndex()
    .input(schema<{ id: string }>())
    .partitionKey(({ id }) => `WAREHOUSE#${id}`)
    .sortKey(() => "METADATA"),
  indexes: {
    GSI1: createIndex()
      .input(schema<Warehouse>())
      .partitionKey(({ location }) => `LOCATION#${location}`)
      .sortKey(({ id }) => `WAREHOUSE#${id}`),
  },
  queries: {},
});

const table = new Table({
  client: docClient,
  tableName: "TestTable",
  indexes: {
    partitionKey: "demoPartitionKey",
    sortKey: "demoSortKey",
    gsis: { GSI1: { partitionKey: "GSI1PK", sortKey: "GSI1SK" } },
  },
});

const dinosaurRepository = DinosaurEntity.createRepository(table);
const warehouseRepository = WarehouseEntity.createRepository(table);
const inventory = defineCollection({
  entities: { Dinosaur: DinosaurEntity, Warehouse: WarehouseEntity },
  indexName: "GSI1",
}).createReader(table);

describe("Entity Collection Integration Tests", () => {
  beforeEach(async () => {
    await Promise.all([
      dinosaurRepository.upsert({ id: "dino-1", location: "WELLINGTON", name: "Geoff", status: "ACTIVE" }).execute(),
      warehouseRepository
        .upsert({ id: "warehouse-1", location: "WELLINGTON", capacity: 100, status: "INACTIVE" })
        .execute(),
      table
        .put({
          demoPartitionKey: "OTHER#1",
          demoSortKey: "METADATA",
          GSI1PK: "LOCATION#WELLINGTON",
          GSI1SK: "OTHER#1",
          entityType: "Other",
          status: "ACTIVE",
        })
        .execute(),
    ]);
  });

  it("groups configured entities across real GSI pages", async () => {
    const pages = inventory.query({ pk: "LOCATION#WELLINGTON" }).paginate(1);
    const grouped = await pages.getAllPages();

    expect(grouped.Dinosaur.map(({ id }) => id)).toEqual(["dino-1"]);
    expect(grouped.Warehouse.map(({ id }) => id)).toEqual(["warehouse-1"]);
    expect(pages.getCurrentPage()).toBeGreaterThan(1);
  });

  it("executes chained filters and omits unconfigured entity types", async () => {
    const result = await inventory
      .query({ pk: "LOCATION#WELLINGTON" })
      .filter((op) => op.eq("status", "ACTIVE"))
      .execute();
    const grouped = await result.toArray();

    expect(grouped.Dinosaur.map(({ id }) => id)).toEqual(["dino-1"]);
    expect(grouped.Warehouse).toEqual([]);
  });
});
