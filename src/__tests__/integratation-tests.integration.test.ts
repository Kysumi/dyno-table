import { describe } from "vitest";
import { tableSuite } from "./table-test";
import { baseRepositorySuite } from "../repository/__tests__/base-repository-test";

describe("Running Integration Tests", () => {
  tableSuite();
  baseRepositorySuite();
});
