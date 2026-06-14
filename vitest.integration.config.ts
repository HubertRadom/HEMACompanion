import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Integration test config — runs against local Supabase (supabase start required).
// Run via: npm run test:integration
// See context/foundation/test-plan.md §6.2 for the pattern.
export default defineConfig(({ mode }) => {
  // loadEnv with empty prefix loads ALL vars (not just VITE_-prefixed ones).
  // Assign to process.env so setup.integration.ts can read them via process.env.
  const env = loadEnv(mode, process.cwd(), "");
  Object.assign(process.env, env);

  return {
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    test: {
      environment: "node",
      include: ["src/**/*.integration.test.ts"],
      setupFiles: ["src/test/setup.integration.ts"],
      globalSetup: ["vitest.globalSetup.ts"],
      // Integration tests share a real DB; serialise to avoid concurrent auth races.
      maxWorkers: 1,
    },
  };
});
