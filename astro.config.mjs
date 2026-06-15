// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// In e2e / CI, use the Node.js prerender environment to avoid workerd's
// module isolation which causes dual React instances (ssr.noExternal = true
// is only injected when prerenderEnvironment === "workerd").
const prerenderEnvironment = process.env.ASTRO_PRERENDER_ENV === "node" ? "node" : "workerd";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      dedupe: ["react", "react-dom", "react-dom/server"],
    },
  },
  adapter: cloudflare({ prerenderEnvironment }),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
