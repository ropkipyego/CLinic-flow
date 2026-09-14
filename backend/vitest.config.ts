import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    pool: "forks",
    maxWorkers: 1,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
