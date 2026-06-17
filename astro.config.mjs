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

// In e2e tests the dev toolbar floats over submit buttons at the bottom of the viewport,
// intercepting pointer events when the server is under load (parallel workers).
const devToolbarEnabled = process.env.ASTRO_DEV_TOOLBAR !== "false";

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
  devToolbar: { enabled: devToolbarEnabled },
  adapter: cloudflare({ prerenderEnvironment }),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
