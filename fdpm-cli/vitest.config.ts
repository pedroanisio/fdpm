import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    // Each test file's first test pays a plugin-activation cold-start
    // (11+ plugins, hundreds of CEL rules and validators registered per
    // freshHost()). Under default vitest parallelism, that cold-start
    // can exceed the 5000ms default testTimeout when many files race
    // for the thread pool. Raise the budget so plugin-heavy first
    // tests survive parallel I/O thrash without false-flagging.
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
