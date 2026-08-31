import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

const configuredChromium = process.env["FDPM_CHROMIUM_EXECUTABLE_PATH"];
const chromiumExecutable =
  configuredChromium ?? (existsSync("/snap/bin/chromium") ? "/snap/bin/chromium" : undefined);

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
      ...(chromiumExecutable === undefined ? {} : { executablePath: chromiumExecutable }),
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
});
