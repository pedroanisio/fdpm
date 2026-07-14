import { defineConfig } from "vitest/config";

/**
 * The web app is otherwise built by `vite.config.ts`; this config governs the
 * unit-test run only. Tests here exercise pure, DOM-free logic (the
 * profile-document derivation), so the default `node` environment is
 * sufficient — no jsdom dependency is introduced.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
});
