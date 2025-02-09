import { Table } from "../../src/table";
import { dbClient } from "../db-client";

const table = new Table({
  client: dbClient,
  tableIndexes: {
    primary: {
      pkName: "pk",
      skName: "sk",
    },
  },
  tableName: "application-table",
});

const user = await table.get({
  pk: "userId#1123",
  sk: "userName#Scott",
});

const fluentUsers = await table
  .query({ pk: "users" })
  .whereEquals("name", "Scott")
  .useIndex("primary")
  .limit(100)
  .execute();

const users = await table
  .scan<{ meta: { paddock: { name: string; id: number } } }>()
  .whereEquals("meta.paddock.id", 20)
  .whereIn("meta.paddock.name", ["Paddock 1", "Paddock 2"])
  .execute();
