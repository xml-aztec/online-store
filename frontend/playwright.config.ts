import { defineConfig, devices } from "@playwright/test";

// Runs against the already-running docker compose stack (make up) -- this
// suite doesn't spin up its own server since it needs the full stack (Caddy,
// api, postgres, redis), not just `next dev`.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
