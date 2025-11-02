import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    table: "src/table.ts",
    entity: "src/entity/entity.ts",
    conditions: "src/conditions.ts",
    types: "src/types.ts",
    "standard-schema": "src/standard-schema.ts",
    utils: "src/utils/index.ts",
    builders: "src/builders/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: false,
  splitting: true,
  treeshake: true,
});
