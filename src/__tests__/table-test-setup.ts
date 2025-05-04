import { Table } from "../table";
import { docClient } from "../../tests/ddb-client";

export type Dinosaur = {
  pk: string;
  sk: string;
  name: string;
  type: string;
  height?: number;
  weight?: number;
  diet?: string;
  period?: string;
  discovered?: number;
  tags?: Set<string>;
  species?: {
    name: string | null;
  };
};

export function createTestTable(): Table {
  return new Table({
    client: docClient,
    tableName: "TestTable",
    indexes: {
      partitionKey: "pk",
      sortKey: "sk",
    },
  });
}
