import { afterAll, beforeEach } from "vitest";
import { createTestTable, deleteTestTable } from "./setup-test-table";

beforeEach(async () => {
  await createTestTable();
});

afterAll(async () => {
  await deleteTestTable();
});
