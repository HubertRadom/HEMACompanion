# Repository Guidelines

HEMA Companion is a greenfield web app for individual HEMA (Historical European Martial Arts) practitioners to track sparring history and gear wear. Stack: Astro 6, React 19, Tailwind 4, Supabase (auth + Postgres), Cloudflare Pages, TypeScript strict. Node 22 required.

## Hard Rules

- **RLS on every Supabase table.** One practitioner must never see another's data; enforce at the database layer, not the application layer. Never create a table or policy that skips Row Level Security.
- **Never commit secrets.** `.env`, `.env.production`, `.dev.vars` are gitignored. Copy from `.env.example` for local setup.
- **No `console.log` in committed code.** ESLint flags it as `warn`; the CI lint step will surface it.

## Project Structure

Source lives under `src/`: `components/` for `.astro` UI components, `layouts/` for the base shell, `lib/` for the Supabase client and utilities, `pages/` for file-based Astro routes, `middleware.ts` for the auth session guard, and `styles/` for global CSS. Database config and migrations live in `supabase/`. Product context is in `context/foundation/` — see `@context/foundation/prd.md` and `@context/foundation/tech-stack.md`.

Path alias `@/*` resolves to `./src/*` — use it for all cross-directory imports.

## Build, Test, and Development Commands

- `npm run dev` — local Astro dev server
- `npm run build` — type-check + production build (requires `SUPABASE_URL` and `SUPABASE_KEY` env vars)
- `npm run lint` — ESLint across `.ts`, `.tsx`, `.astro` files
- `npm run lint:fix` — ESLint with auto-fix
- `npm run format` — Prettier across `.json`, `.css`, `.md` files
- `npm run preview` — preview the production build locally

Full script definitions are in `@package.json`. CI runs `lint` then `build` on push/PR to `master`.

## Coding Style & Naming Conventions

TypeScript strict mode via `@tsconfig.json` (Astro strict preset). Prettier: 120-char line width, double quotes, trailing commas; runs on pre-commit via Husky (config in `@.prettierrc.json`). ESLint uses `typescript-eslint/strict` + `stylistic` and the React compiler plugin (config in `@eslint.config.js`). Use `.astro` for page/layout components and `.ts`/`.tsx` for utilities and React components. All cross-directory imports must use the `@/` alias.

## Testing Guidelines

No test framework is configured and no test files exist. Before wiring a CI test gate, add a test config and at least one test file.
