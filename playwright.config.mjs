import { defineConfig } from "@playwright/test";

const origin = "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./test/browser",
  testMatch: "**/*.spec.mjs",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: "line",
  outputDir: ".artifacts/playwright",
  use: {
    baseURL: origin,
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: "node test/browser/server.mjs",
    url: `${origin}/health`,
    reuseExistingServer: false,
    timeout: 15_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
