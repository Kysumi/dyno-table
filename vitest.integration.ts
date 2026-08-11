import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    maxConcurrency: 1,
    fileParallelism: false,
    setupFiles: ["./tests/setup-tests.ts"],
    include: ["./src/**/*.itest.ts"],
  },
});
