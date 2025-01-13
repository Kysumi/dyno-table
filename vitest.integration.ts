import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    maxConcurrency: 1,
    fileParallelism: false,
    poolOptions: {
      forks: {
        maxForks: 1,
      },
    },
    setupFiles: ["./tests/setup-tests.ts"],
    include: ["./src/**/*.itest.ts"],
  },
});
