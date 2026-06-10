import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Minimal Vitest config for the framework-free pure modules in src/lib.
// node environment (no jsdom/Astro runtime needed); `@/` mirrors the tsconfig path alias.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
