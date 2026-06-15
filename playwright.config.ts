import { defineConfig } from "@playwright/test";
import { loadEnv } from "vite";

const env = loadEnv("test", process.cwd(), "");
Object.assign(process.env, env);

export default defineConfig({
  testDir: "./playwright",
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  use: {
    baseURL: process.env.TEST_BASE_URL ?? "http://localhost:4322",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npx astro dev --port 4322 --force",
    port: 4322,
    reuseExistingServer: !process.env.CI,
    env: {
      ...(process.env as Record<string, string>),
      SUPABASE_KEY: process.env.SUPABASE_ANON_KEY ?? "",
      ASTRO_PRERENDER_ENV: "node",
    },
    timeout: 60_000,
  },
  globalSetup: "./playwright/global-setup.ts",
  globalTeardown: "./playwright/global-teardown.ts",
});
