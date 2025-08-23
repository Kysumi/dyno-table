import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    // Main entry point
    index: "src/index.ts",

    // Individual module entry points
    table: "src/table.ts",
    entity: "src/entity/entity.ts",
    conditions: "src/conditions.ts",
    types: "src/types.ts",
    "standard-schema": "src/standard-schema.ts",

    // Utils
    utils: "src/utils/index.ts",

    // Builders
    "builders/query-builder": "src/builders/query-builder.ts",
    "builders/paginator": "src/builders/paginator.ts",
    "builders/put-builder": "src/builders/put-builder.ts",
    "builders/update-builder": "src/builders/update-builder.ts",
    "builders/delete-builder": "src/builders/delete-builder.ts",
    "builders/transaction-builder": "src/builders/transaction-builder.ts",
    "builders/condition-check-builder": "src/builders/condition-check-builder.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
});
