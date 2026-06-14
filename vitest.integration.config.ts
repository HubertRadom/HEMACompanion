import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration test config — runs against local Supabase (supabase start required).
// Run via: npm run test:integration
// See context/foundation/test-plan.md §6.2 for the pattern.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    setupFiles: ["src/test/setup.integration.ts"],
  },
});
