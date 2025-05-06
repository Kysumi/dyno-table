import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    // Individual module entry points
    table: "src/table.ts",
    entity: "src/entity.ts",
    conditions: "src/conditions.ts",
    types: "src/types.ts",
    "standard-schema": "src/standard-schema.ts",

    // Utils
    "utils/key-template": "src/utils/key-template.ts",
    "utils/sort-key-template": "src/utils/sort-key-template.ts",

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
