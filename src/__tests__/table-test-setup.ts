import { docClient } from "../../tests/ddb-client";
import { Table } from "../table";

export type Dinosaur = {
  demoPartitionKey: string;
  demoSortKey: string;
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
  description?: string;
};

export function createTestTable(): Table {
  return new Table({
    client: docClient,
    tableName: "TestTable",
    indexes: {
      partitionKey: "demoPartitionKey",
      sortKey: "demoSortKey",
    },
  });
}
