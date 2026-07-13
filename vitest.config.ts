import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
    // Unit tests must never touch the network or a real database;
    // setup.ts enforces both.
    testTimeout: 10_000,
  },
});
