# Quality-gates wiring + critical-path e2e — Plan Brief

> Full plan: `context/changes/testing-quality-gates-e2e/plan.md`
> Research: `context/changes/testing-quality-gates-e2e/research.md`

## What & Why

Wire four missing CI gates into `.github/workflows/ci.yml` and write one Playwright e2e
covering the critical happy path. The CI currently runs only lint + build + deploy — all 13
integration scenarios (A–M) and 11+ unit assertions from Phases 1–3 are invisible to CI, so
regressions can reach `main` silently. This change closes that gap and adds the browser-layer
e2e that integration tests cannot cover.

## Starting Point

`.github/workflows/ci.yml` has five steps (checkout, install, sync, lint, build+deploy). All
three Vitest configs (`vitest.config.ts`, `vitest.integration.config.ts`, `vitest.globalSetup.ts`)
and the integration harness (`src/test/setup.integration.ts`) are complete from Phases 1–3.
Playwright is not installed.

## Desired End State

Every PR to `main` must pass: `npx astro check` → `npm test` → `npm run test:integration` →
`npm run test:e2e`. The Playwright spec signs in, creates a gear item, creates a gear set,
logs a fight, navigates to `/stats`, and asserts that the opponent name, gear set name, and
gear item name are visible — proving the full browser-to-DB round trip.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|----------|--------|-----------------|--------|
| Gate delivery | All 4 gates in one PR | Matches rollout-phase boundary; one place to review and bisect | Plan |
| CI job structure | One sequential job | No parallel jobs; simpler YAML; Supabase startup serializes naturally | Plan |
| Supabase in CI | `supabase/setup-cli@v1` + `supabase start` | `config.toml` exists; Docker available on `ubuntu-latest` | Research |
| Playwright browser | Chromium only | Covers critical path; form-based UI has no browser-specific quirks | Plan |
| Stats oracle | Text presence of input strings | Assertions on opponent/gear/set names prove round-trip without fragile count assertions | Plan |
| Playwright binary caching | `actions/cache` on `~/.cache/ms-playwright` | Saves ~40–60 s per PR; invalidated by `package-lock.json` hash | Plan |
| Trace/screenshot | `on-first-retry` / `only-on-failure` | Zero overhead on passing runs; upload artifact on CI failure for debugging | Plan |
| E2e test user | Admin API in `global-setup.ts` | Bypasses email-confirmation gate (`email_confirm: true`); mirrors Phase 2/3 pattern | Research |
| Port strategy | 4322 (same as integration tests) | Integration teardown kills the server; Playwright starts a new one sequentially | Research |
| Env loading | `loadEnv('test', cwd, '')` in `playwright.config.ts` | Mirrors `vitest.integration.config.ts` exactly; `.env.test.local` works locally; `$GITHUB_ENV` works in CI | Research |

## Scope

**In scope:**
- `.github/workflows/ci.yml` — 4 new gate blocks (typecheck, unit, Supabase+integration, Playwright+e2e)
- `package.json` — `@playwright/test` in devDependencies, `test:e2e` script
- `playwright.config.ts` — webServer, Chromium, trace/screenshot, globalSetup/Teardown wiring
- `playwright/global-setup.ts` — admin user creation
- `playwright/global-teardown.ts` — user deletion
- `playwright/critical-path.spec.ts` — one happy-path e2e test
- `context/foundation/test-plan.md §6.4` — cookbook pattern for Playwright

**Out of scope:**
- No application code or DB schema changes
- No multi-browser Playwright matrix
- No Supabase Docker image caching
- No visual regression / screenshot comparison
- No e2e tests for error paths (covered by integration tests A–M)

## Architecture / Approach

All test steps run sequentially in one CI job before `npm run build`. The Supabase local
instance (started by `supabase start`) is shared by both integration tests and the Playwright
spec — integration teardown kills the Astro dev server on port 4322, then Playwright's
`webServer` config starts a fresh one. `playwright.config.ts` loads `.env.test.local` via
`loadEnv` (local) or reads from `$GITHUB_ENV` (CI) using `Object.assign(process.env, env)`.
The `webServer.env` maps `SUPABASE_KEY = SUPABASE_ANON_KEY` for the Astro child process,
mirroring `vitest.globalSetup.ts`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. Typecheck + unit gates | `npx astro check` + `npm test` in CI | None — no new dependencies |
| 2. Supabase CLI + integration gate | `npm run test:integration` in CI | `supabase status` JSON key names may differ from plan (verify locally first) |
| 3. Playwright infrastructure | Install, config, globalSetup/Teardown, CI steps | ESLint config may need to include `playwright/` directory |
| 4. Critical-path e2e spec | One passing Playwright test in CI | `input[type="checkbox"][name="item_ids"]` selector assumes exactly one gear item |
| 5. Cookbook update | §6.4 filled in `test-plan.md` | None |

**Prerequisites:** Local Supabase running (`npx supabase start`) and `.env.test.local`
populated for local testing. GitHub Actions secrets `SUPABASE_URL` + `SUPABASE_KEY` (used by
the existing build step) are unchanged.

**Estimated effort:** ~2 sessions across 5 phases; Phases 1–2 are very lightweight (CI YAML
only); Phases 3–4 are the bulk.

## Open Risks & Assumptions

- `supabase status --output json` key names (`.api_url`, `.anon_key`, `.service_role_key`)
  must be verified against the actual CLI 2.23.4 output before Phase 2 is pushed
- `ubuntu-latest` runner image must have Docker daemon running (standard assumption; has held
  for all `supabase/setup-cli@v1` users but worth confirming on first CI run)
- `GEAR_CATEGORIES` in the gear form uses titlecase ("Longsword"); `WEAPON_CATEGORIES` in the
  fight form uses lowercase ("longsword") — the e2e test data uses "Longsword" for gear and
  "longsword" (default select) for fight; these are correct and independent

## Success Criteria (Summary)

- A PR with a deliberate TypeScript error fails at `npx astro check` before reaching the build
- `npm run test:e2e` locally runs 1 test, passes, and passes again on a second run
- All 4 CI gates pass green on the PR branch in GitHub Actions
