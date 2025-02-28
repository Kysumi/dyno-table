import {
  and,
  attributeExists,
  attributeNotExists,
  attributeType,
  beginsWith,
  contains,
  eq,
  gte,
  inArray,
  lt,
  not,
  or,
  size,
} from "../../src/builders/expressions";
import { Table } from "../../src/table";
import { dbClient } from "../db-client";

const table = new Table(dbClient, {
  name: "le-table",
  partitionKey: "pk",
  sortKey: "sk",
  gsis: [
    {
      name: "gsi1",
      keySchema: {
        pk: "gsi1pk",
        sk: "gsi1sk",
      },
    },
  ],
});

const user = await table.getItem({
  pk: "userId#1123",
  sk: "userName#Scott",
});

const fluentUsers = await table.query(
  { pk: eq("pk", "userId") },
  {
    filter: and(inArray("name", ["Scott", "John"]), beginsWith("email", "scott@")),
  },
);

const users = await table
  .scan<{ meta: { paddock: { name: string; id: number } } }>()
  .whereEquals("meta.paddock.id", 20)
  .whereIn("meta.paddock.name", ["Paddock 1", "Paddock 2"])
  .execute();

const complexFilter = and(
  eq("pk", "userId"),
  // and
  or(
    eq("sk", "userName#Scott"),
    // or
    eq("sk", "userName#John"),
    // or
    and(eq("sk", "userName#Scott"), or(eq("sk", "userName#John"))),
  ),
);

const complexUsers = await table
  .query({
    pk: "123123123",
    sk: (op) => op.and(op.beginsWith("userName#Scott"), op.between(["2024-01-01", "2024-01-02"])),
  })
  .filter(complexFilter)
  .select({
    name: true,
    email: true,
  })
  .select("name", "email")
  .useIndex("gsi1")
  .sortAscending()
  .sortDescending()
  // .limit(10)
  .paginate(500);

KeyCondition: "#pk = :pk AND begins_with(#sk, :sk) AND #sk BETWEEN :start_date AND :end_date";
