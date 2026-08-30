import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/renderers",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: "list",
  outputDir: resolve(process.cwd(), "../_tmp/renderer-playwright-results"),
  snapshotPathTemplate: "{testDir}/__snapshots__/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.001,
    },
  },
  use: {
    browserName: "chromium",
    colorScheme: "light",
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
    launchOptions: {
      executablePath: process.env["FDPM_CHROMIUM_EXECUTABLE_PATH"] ?? "/snap/bin/chromium",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
});
