import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./downloads/playwright/",
  timeout: 60000,
  testMatch: '**/*.spec.ts',
  reporter: [["html", {outputFolder: "downloads/reports/"}]],
  use: {
    headless: false, // Run tests in headless mode
    viewport: { width: 1280, height: 720 },
  },
});