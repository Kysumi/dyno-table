import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		poolOptions: {
			threads: {
				singleThread: true,
			},
		},
		setupFiles: ["./tests/setup-tests.ts"],
		include: ["./src/__tests__/*.test.ts"],
	},
});
