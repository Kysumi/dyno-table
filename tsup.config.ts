import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    table: "src/table.ts",
    entity: "src/entity.ts",
    conditions: "src/conditions.ts",
    types: "src/types.ts",
    "standard-schema": "src/standard-schema.ts",
    utils: "src/utils.ts",
    builders: "src/builders.ts",
  },
  format: ["esm", "cjs"],
  dts: false,
  clean: true,
  sourcemap: false,
  splitting: true,
  treeshake: true,
});
