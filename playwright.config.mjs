// Browser tests run against the built app in dist/, the same files GitHub Pages serves.
import { defineConfig, devices } from "@playwright/test";

const PORT = 8795;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}/`,
    serviceWorkers: "block",            // the offline test turns it back on
    timezoneId: "America/Chicago",     // a zone with daylight saving, like the engine tests
    trace: "retain-on-failure"
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } }
  ],
  webServer: {
    command: `npm run build && node scripts/serve.mjs dist ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI
  }
});
