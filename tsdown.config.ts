import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    table: "src/table.ts",
    entity: "src/entity.ts",
    migration: "src/migration.ts",
    conditions: "src/conditions.ts",
    types: "src/types.ts",
    "standard-schema": "src/standard-schema.ts",
    utils: "src/utils.ts",
    builders: "src/builders.ts",
  },
  format: ["esm", "cjs"],
  dts: { tsconfig: "tsconfig.types.json" },
  clean: true,
  sourcemap: false,
  treeshake: true,
  outExtensions: ({ format }) => ({
    js: format === "es" ? ".js" : ".cjs",
    dts: ".d.ts",
  }),
});
