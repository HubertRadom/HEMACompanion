---
date: 2026-06-14T00:00:00+02:00
researcher: Claude Sonnet 4.6
git_commit: 7de3df18093a9853ca4a3ee2faae071432395b13
branch: main
repository: HEMACompanion
topic: "Phase 4 — Quality-gates wiring + critical-path e2e"
tags: [research, codebase, ci, playwright, e2e, quality-gates, github-actions, supabase]
status: complete
last_updated: 2026-06-14
last_updated_by: Claude Sonnet 4.6
---

# Research: Phase 4 — Quality-gates wiring + critical-path e2e

**Date**: 2026-06-14
**Researcher**: Claude Sonnet 4.6
**Git Commit**: 7de3df18093a9853ca4a3ee2faae071432395b13
**Branch**: main
**Repository**: HEMACompanion

## Research Question

Ground rollout Phase 4 of `context/foundation/test-plan.md`: lock lint/typecheck/unit+integration
in CI; add one Playwright e2e covering the register → add gear → create set → log fight → view
stats critical path.

## Summary

The CI workflow (`.github/workflows/ci.yml`) currently runs lint + build + deploy only — it is
missing typecheck, unit tests, integration tests, and e2e. Adding them requires:

1. **Typecheck gate**: `npx astro check` — already installed (`@astrojs/check` in dependencies),
   just not invoked in CI.
2. **Unit gate**: `npm test` — Vitest is configured and 13+ unit assertions pass locally; wiring
   to CI is a one-liner.
3. **Integration gate**: `npm run test:integration` — requires a live Supabase instance in CI. The
   `supabase/config.toml` exists; `supabase/setup-cli@v1` + `supabase start` on
   `ubuntu-latest` (Docker available) is the standard path. Env vars can be exported from
   `supabase status --output json`.
4. **E2e gate**: Playwright is not yet installed. The critical path is fully grounded — all form
   field selectors, redirects, and stat-page assertions are verified against source. A
   pre-created admin-API test user sidesteps email confirmation; the rest of the flow runs
   through real browser UI.

The Phase 1–3 test infrastructure (vitest.globalSetup.ts, setup.integration.ts, env loading) is
re-usable by Playwright with minimal adaptation.

---

## Detailed Findings

### Finding 1 — Current CI pipeline and its gaps

**File**: [.github/workflows/ci.yml](.github/workflows/ci.yml)

Current steps on every PR and push to `main`:
1. `npm ci`
2. `npx astro sync`
3. `npm run lint`
4. `npm run build` (with `SUPABASE_URL` + `SUPABASE_KEY` from secrets)
5. `npx wrangler deploy` (push only)

**What is missing:**

| Gate | Command | Gap reason |
|------|---------|------------|
| Typecheck | `npx astro check` | Tool installed, never invoked in CI |
| Unit tests | `npm test` | Vitest configured (Phase 1), never invoked in CI |
| Integration tests | `npm run test:integration` | Requires live Supabase; no CI Supabase setup yet |
| E2e tests | `npm run test:e2e` | Playwright not installed yet |

All four are blocking regressions from merging silently. Any of the 13 existing test scenarios
(A–M) could fail on main without anyone noticing.

---

### Finding 2 — Test infrastructure built in Phases 1–3 (reuse opportunities)

**Unit runner** (`vitest.config.ts`):
- `npm test` → `vitest run`
- `include: ["src/**/*.test.ts"]`, `exclude: ["src/**/*.integration.test.ts"]`
- Node environment; `@/` alias maps to `./src/`

**Integration runner** (`vitest.integration.config.ts`):
- `npm run test:integration` → `vitest run --config vitest.integration.config.ts`
- `loadEnv(mode, cwd, "")` reads `.env.test.local`; result is `Object.assign`-ed into
  `process.env` — env vars already in `process.env` (i.e. from $GITHUB_ENV) are NOT overwritten
  when the file is absent. CI works without `.env.test.local` as long as the vars are in the
  environment before Node starts.
- `globalSetup: ["vitest.globalSetup.ts"]` — starts Astro dev server before any test runs
- `maxWorkers: 1` (serialize to avoid auth races)

**Astro dev server** (`vitest.globalSetup.ts`):
- `setup()`: spawns `astro dev --port 4322`, passes `SUPABASE_KEY = process.env.SUPABASE_ANON_KEY`
  to the child process env, waits for "ready" in stdout (60 s timeout), sets
  `process.env.TEST_BASE_URL = "http://localhost:4322"`
- `teardown()`: kills the process

**Integration harness** (`src/test/setup.integration.ts`):
- `db` = service-role Supabase client (bypasses RLS, respects FK constraints)
- `USER_PASSWORD = "test-password-integration"`
- `ctx.userId`, `ctx.userAEmail`, `ctx.userBId`, `ctx.userBEmail`
- `beforeAll` creates both users via `db.auth.admin.createUser({ email_confirm: true })` —
  bypasses Supabase email-confirmation gate entirely
- `afterAll` deletes both users; `ON DELETE CASCADE` removes all their fights, gear_sets, etc.
- `createUserClient(email, password)` returns an anon Supabase client with real JWT (respects RLS)

**Env vars needed** (`.env.test.local` locally; `$GITHUB_ENV` in CI):

| Var | Used by |
|-----|---------|
| `SUPABASE_URL` | `setup.integration.ts` (DB client) |
| `SUPABASE_SERVICE_ROLE_KEY` | `setup.integration.ts` (admin operations) |
| `SUPABASE_ANON_KEY` | `setup.integration.ts` (`createUserClient`); `vitest.globalSetup.ts` (Astro child env) |

No other vars are needed by the test runner itself.

---

### Finding 3 — Supabase local CLI in CI

**File**: [supabase/config.toml](supabase/config.toml) — present (`project_id = "10x-astro-starter"`,
API port 54321, DB port 54322, Postgres 17).

`ubuntu-latest` on GitHub Actions has Docker available by default. The
`supabase/setup-cli@v1` action installs the Supabase CLI; `supabase start` then launches all
containers using the local `config.toml`. Keys are extracted from `supabase status --output json`.

```bash
# After supabase start
echo "SUPABASE_URL=$(supabase status -o json | jq -r '.API_URL')" >> $GITHUB_ENV
echo "SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r '.SERVICE_ROLE_KEY')" >> $GITHUB_ENV
echo "SUPABASE_ANON_KEY=$(supabase status -o json | jq -r '.ANON_KEY')" >> $GITHUB_ENV
```

These become process.env vars for all subsequent steps in the job. The `loadEnv` call in
`vitest.integration.config.ts` is a no-op when `.env.test.local` is absent — the vars already in
process.env are used as-is.

`supabase start` in CI typically takes 60–120 s (image pull on first run, cached on subsequent).
Plan must include a wait step or rely on `supabase start`'s own readiness check (it blocks until
healthy by default).

---

### Finding 4 — Auth flow for the e2e test

**Files**: `src/pages/auth/signup.astro`, `src/pages/auth/signin.astro`,
`src/pages/auth/confirm-email.astro`, `src/pages/api/auth/signup.ts`,
`src/pages/api/auth/signin.ts`

**Signup API** (`src/pages/api/auth/signup.ts`):
- POST `email` + `password` → `supabase.auth.signUp()` → redirect to `/auth/confirm-email`
- On error → redirect to `/auth/signup?error=…`

**Confirm-email page** (`src/pages/auth/confirm-email.astro`):
- In `import.meta.env.DEV` mode: shows "Registration successful — You can now sign in"
- In production: shows "Check your email" prompt
- The page does NOT auto-confirm the Supabase user; it's UI-only messaging.
- Local Supabase CLI's default behavior: email confirmation may or may not be required depending
  on project settings (not verified in config.toml scope).

**Recommendation for e2e test setup**: Do NOT navigate through the signup UI. Instead, use
`db.auth.admin.createUser({ email_confirm: true })` in a Playwright `globalSetup` (same
pattern as `src/test/setup.integration.ts`). This creates a confirmed user without email
interaction, then the e2e test signs in via the browser UI — exercising the real sign-in flow.

**Signin flow** (`src/pages/api/auth/signin.ts`):
- POST `email` + `password` → `supabase.auth.signInWithPassword()` → redirect to `/` on success
- On error → redirect to `/auth/signin?error=…`
- Session is stored in cookies by `@supabase/ssr`

After successful sign-in, the user lands on `/` (index.astro → `<Welcome />`). The middleware
does NOT protect `/`; the test must navigate explicitly to `/gear/add` etc.

---

### Finding 5 — Protected routes (middleware.ts)

Protected routes (middleware uses `.startsWith()` matching):
```
/dashboard, /gear, /gear-sets, /fights, /stats
```
Unauthenticated requests to any of these → 302 redirect to `/auth/signin`.

This means the e2e test must be authenticated before navigating to any feature page.

---

### Finding 6 — Critical-path form fields and DOM selectors

All form components use `<form method="POST">` (server-side submission). `FormField` sets
`name={name ?? id}`, meaning the `name` attribute equals the `id` when not explicitly overridden.

#### Gear add form (`/gear/add` → POST `/api/gear`)

| Field | Selector | Type | Required | Notes |
|-------|----------|------|----------|-------|
| Name | `#name` / `input[name="name"]` | text | yes | |
| Category | `#category` / `select[name="category"]` | select | yes | Options: "Longsword", "Sabre", "Rapier", "Messer", "Sidesword", "Dagger", "Sword & Buckler", "Poleaxe", "Other" |
| Brand | `#brand` / `input[name="brand"]` | text | no | |
| Model | `#model` / `input[name="model"]` | text | no | |
| Submit | `button[type="submit"]` | button | — | Text: "Save gear item" |

**Success redirect**: `/gear`

#### Gear set add form (`/gear-sets/add` → POST `/api/gear-sets`)

⚠️ **Dependency**: page renders "You have no gear items yet" + link to `/gear/add` when the user
has no gear items. Gear item MUST be created first.

| Field | Selector | Type | Required | Notes |
|-------|----------|------|----------|-------|
| Set name | `#name` / `input[name="name"]` | text | yes | |
| Gear items | `input[type="checkbox"][name="item_ids"]` | checkbox | yes (≥1) | `value` = gear item UUID; label = item name + "(category)" |
| Submit | `button[type="submit"]` | button | — | Text: "Save gear set" |

To check the gear item by name: `page.getByLabel('E2E Sword (longsword)')` targets the checkbox
via its wrapping `<label>`.

**Success redirect**: `/gear-sets`

#### Fight add form (`/fights/add` → POST `/api/fights`)

| Field | Selector | Type | Default | Notes |
|-------|----------|------|---------|-------|
| Opponent name | `#opponent_name` / `input[name="opponent_name"]` | text | "" | Required |
| Weapon category | `#weapon_category` / `select[name="weapon_category"]` | select | "longsword" | Options: longsword, sabre, rapier, other |
| Result | `#result` / `select[name="result"]` | select | "win" | Options: win, loss, draw |
| Date | `#date` / `input[name="date"]` | date | today (YYYY-MM-DD) | Required |
| Gear set | `#gear_set_id` / `select[name="gear_set_id"]` | select | "" (no set) | Disabled + "No gear sets" label if none exist |
| Submit | `button[type="submit"]` | button | — | Text: "Save fight" |

`weapon_category` and `result` default to "longsword" and "win" on first render — the e2e can
submit without explicitly selecting them.

**Success redirect**: `/fights`

#### Sign-in form (`/auth/signin` → POST `/api/auth/signin`)

| Field | Selector | Notes |
|-------|----------|-------|
| Email | `input[name="email"]` / `#email` | required |
| Password | `input[name="password"]` / `#password` | required |
| Submit | `button[type="submit"]` | |

**Success redirect**: `/` (index page)

---

### Finding 7 — Stats page oracle

**File**: [src/pages/stats/index.astro](src/pages/stats/index.astro)

Server-rendered. Fetches all user fights, gear_sets, gear_items, gear_set_compositions in
parallel, then calls `computeStats()`. Rendered HTML sections:

| Section heading | Content | Selector hint |
|-----------------|---------|---------------|
| "Fight Summary" | `{totalFights}` (large bold number) + list of `{category}: {count}` | `h2:has-text("Fight Summary")` sibling |
| "Win Rate" | `{globalWinRate}` (e.g. "50%") + per-category rates | |
| "Top Opponents" | ranked list of `{name}` + `{count} fights` | `text=E2E Opponent` |
| "Gear Items" (conditional) | `{itemName}` + `{count} fights` | `text=E2E Sword` |
| "Gear Sets" (conditional) | `{setName}` + `{count} fights` | `text=E2E Set` |

"Gear Items" and "Gear Sets" sections only render if `gearItemCounts.length > 0` /
`gearSetUsage.length > 0` respectively.

**E2e oracle** — after one longsword win fight against "E2E Opponent" with gear set "E2E Set"
containing item "E2E Sword" (Longsword category):

Independent derivation (from test input, not from code):
- Total fights: **1**
- Fight Summary → Longsword: **1**
- Win Rate: **100%** (1 win / 1 total)
- Top Opponents: **"E2E Opponent"** — **1 fight**
- Gear Items: **"E2E Sword"** — **1 fight**
- Gear Sets: **"E2E Set"** — **1 fight**

The most robust assertions for Playwright are text-content assertions (`toContainText`,
`getByText`), not CSS-class-based ones (Tailwind classes can change without breaking the feature).

---

### Finding 8 — Playwright configuration strategy

Playwright is not currently installed. No `playwright.config.ts` exists.

**Recommended structure:**
```
playwright/
  global-setup.ts        ← creates e2e test user via admin API
  global-teardown.ts     ← deletes e2e test user
  critical-path.spec.ts  ← the one e2e test
playwright.config.ts     ← Playwright config
```

**npm script to add** (`package.json`):
```json
"test:e2e": "playwright test"
```

**`playwright.config.ts` strategy**:
- `testDir: './playwright'`
- `use.baseURL`: `process.env.TEST_BASE_URL ?? 'http://localhost:4322'`
- `webServer` config: starts `astro dev --port 4322` with `SUPABASE_KEY = SUPABASE_ANON_KEY`,
  waits for port to be listening, `reuseExistingServer: !process.env.CI`
- `globalSetup: './playwright/global-setup.ts'`
- `globalTeardown: './playwright/global-teardown.ts'`

**Port 4322 reuse vs. conflict**: `vitest.globalSetup.ts` kills the Astro server in `teardown()`.
If `npm run test:integration` completes before `npm run test:e2e` starts (sequential CI steps),
port 4322 will be free. Using the same port avoids maintaining two port numbers. Set
`reuseExistingServer: false` in CI to ensure a fresh server for e2e.

**Playwright `globalSetup` pattern** (mirrors `src/test/setup.integration.ts`):
```ts
// playwright/global-setup.ts
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

const E2E_USER_EMAIL = `e2e+${Date.now()}@integration.test`;
const E2E_USER_PASSWORD = "e2e-password-playwright";

export default async function globalSetup() {
  const env = loadEnv("test", process.cwd(), "");
  const url = env.SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data, error } = await db.auth.admin.createUser({
    email: E2E_USER_EMAIL,
    password: E2E_USER_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;

  process.env.E2E_USER_ID = data.user.id;
  process.env.E2E_USER_EMAIL = E2E_USER_EMAIL;
  process.env.E2E_USER_PASSWORD = E2E_USER_PASSWORD;
}
```

**Playwright `globalTeardown`**: reads `process.env.E2E_USER_ID` and calls
`db.auth.admin.deleteUser()`. Cascade deletes all test data.

---

### Finding 9 — CI workflow redesign

The updated `.github/workflows/ci.yml` should add these steps before the build:

```yaml
# After: npx astro sync
# NEW: typecheck
- run: npx astro check

# NEW: unit tests (no Supabase needed)
- run: npm test

# NEW: Supabase local for integration + e2e
- uses: supabase/setup-cli@v1
  with:
    version: latest
- run: supabase start
- name: Export Supabase env vars
  run: |
    echo "SUPABASE_URL=$(supabase status -o json | jq -r '.API_URL')" >> $GITHUB_ENV
    echo "SUPABASE_SERVICE_ROLE_KEY=$(supabase status -o json | jq -r '.SERVICE_ROLE_KEY')" >> $GITHUB_ENV
    echo "SUPABASE_ANON_KEY=$(supabase status -o json | jq -r '.ANON_KEY')" >> $GITHUB_ENV

# NEW: integration tests (starts Astro dev on 4322, kills on teardown)
- run: npm run test:integration

# NEW: e2e (Playwright starts its own Astro on 4322 via webServer)
- run: npx playwright install --with-deps chromium
- run: npm run test:e2e
```

The existing `npm run build` step follows with `SUPABASE_URL: ${{ secrets.SUPABASE_URL }}` and
`SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}` — these step-level env vars override the local
Supabase vars set in `$GITHUB_ENV` for that specific step only.

**`supabase start` timing**: blocks until all services are healthy. On `ubuntu-latest` with image
caching (first run may take 2+ min), subsequent runs are faster. No extra wait step needed.

**`npx playwright install --with-deps chromium`**: installs only the Chromium browser + its OS
dependencies. Faster than `--with-deps` for all browsers. The e2e test runs in Chromium only.

---

### Finding 10 — GEAR_CATEGORIES mismatch to note for test data

`src/lib/gear-categories.ts` (used by the gear item form and API) exports:
`["Longsword", "Sabre", "Rapier", "Messer", "Sidesword", "Dagger", "Sword & Buckler", "Poleaxe", "Other"]`

`src/lib/fight-validation.ts` (used by the fight form and API) exports:
`WEAPON_CATEGORIES = ["longsword", "sabre", "rapier", "other"]` (lowercase, smaller set)

These are two different enums for two different purposes (gear item category vs. fight weapon
category). The e2e test creates a gear item with `category = "Longsword"` (gear enum, titlecase)
and logs a fight with `weapon_category = "longsword"` (fight enum, lowercase default). The stats
page groups by `weapon_category`, NOT by gear item category — this is important for the oracle:
the stats "longsword" category shows fight weapon categories, not gear item categories.

---

## Code References

- [.github/workflows/ci.yml](.github/workflows/ci.yml) — current CI pipeline (missing 4 gates)
- [vitest.config.ts](vitest.config.ts) — unit test runner
- [vitest.integration.config.ts](vitest.integration.config.ts) — integration runner, loadEnv pattern
- [vitest.globalSetup.ts](vitest.globalSetup.ts) — Astro dev server lifecycle (port 4322)
- [src/test/setup.integration.ts](src/test/setup.integration.ts) — admin user creation + cleanup pattern
- [src/pages/auth/signup.astro](src/pages/auth/signup.astro) — signup page
- [src/pages/auth/confirm-email.astro](src/pages/auth/confirm-email.astro) — DEV auto-confirm messaging
- [src/pages/api/auth/signup.ts](src/pages/api/auth/signup.ts) — signup API route
- [src/pages/api/auth/signin.ts](src/pages/api/auth/signin.ts) — signin API, redirects to `/`
- [src/middleware.ts](src/middleware.ts) — protected routes list
- [src/components/gear/GearItemForm.tsx](src/components/gear/GearItemForm.tsx) — gear form selectors
- [src/components/gear/GearSetForm.tsx](src/components/gear/GearSetForm.tsx) — gear set form (checkbox pattern)
- [src/components/fights/FightForm.tsx](src/components/fights/FightForm.tsx) — fight form (default weapon+result)
- [src/components/auth/FormField.tsx](src/components/auth/FormField.tsx) — `name={name ?? id}` wiring
- [src/pages/stats/index.astro](src/pages/stats/index.astro) — stats page structure + oracle sections
- [src/lib/gear-categories.ts](src/lib/gear-categories.ts) — gear item categories (titlecase)
- [src/lib/fight-validation.ts](src/lib/fight-validation.ts) — weapon_category / result enums (lowercase)
- [supabase/config.toml](supabase/config.toml) — local Supabase config (API port 54321)

## Architecture Insights

**Two-layer contract**: integration tests already cover auth, IDOR, server-side validation, and
write-path correctness via direct Supabase client calls. The e2e test covers the only layer they
cannot: the Astro routing layer (server-rendered page data fetching, form POST handling,
redirect chains) experienced through a real browser session. The e2e test must NOT re-test what
integration tests already cover — one happy-path flow through the UI is the correct scope.

**Form submission model**: all forms use standard HTML `method="POST"` (no fetch/axios). Playwright
`page.fill()` / `page.selectOption()` / `page.check()` + `page.click()` on the submit button
trigger a real form POST and server redirect. The test asserts on the resulting URL and visible
page content — not on request/response internals.

**Session handling**: Supabase session is stored in cookies by `@supabase/ssr`. Playwright's
default `BrowserContext` maintains cookies across navigations within the same test, so signing in
once covers all subsequent page navigations.

**Stats page is server-rendered**: no client-side hydration for the data. After logging a fight
and navigating to `/stats`, the page immediately shows the correct data — no need for
`waitForResponse` or explicit waits beyond Playwright's default navigation wait.

**`lessons.md` flag**: the `?error=` URL param reflection is flagged as a phishing vector. The
e2e test should only assert on success states (URL redirects, visible user-specific content) — not
assert on error message text rendered from URL params.

## Historical Context (from prior changes)

- [context/changes/testing-authorization-data-isolation/plan.md](../testing-authorization-data-isolation/plan.md)
  — Phase 3 established the `vitest.globalSetup.ts` pattern (Astro dev server lifecycle, port
  4322, `TEST_BASE_URL`) and the `createUserClient` helper. Both are directly reusable for
  Playwright.
- [context/changes/testing-fight-write-path/plan.md](../testing-fight-write-path/plan.md)
  — Phase 2 established the `db.auth.admin.createUser({ email_confirm: true })` pattern and
  the `ON DELETE CASCADE` teardown. Playwright globalSetup should replicate exactly this.
- [context/changes/testing-statistics-aggregation/plan.md](../testing-statistics-aggregation/plan.md)
  — Phase 1 established `vitest.config.ts` and the `npm test` / `npm run test:integration`
  scripts. Both are ready to wire into CI as-is.

## Related Research

- [context/foundation/test-plan.md](../../foundation/test-plan.md) §6.1, §6.2, §6.3 — prior
  cookbook patterns that this phase builds on
- [context/foundation/lessons.md](../../foundation/lessons.md) — `?error=` URL param is a
  phishing vector; do not assert its rendered text in e2e tests

## Open Questions

1. **`supabase status` JSON key names**: the research assumes `API_URL`, `SERVICE_ROLE_KEY`,
   `ANON_KEY` as jq paths. Verify against actual `supabase status --output json` output from the
   installed CLI version (2.23.4) — key names may differ slightly (e.g. `db_url` vs `DB_URL`).

2. **`playwright install` caching in CI**: `npx playwright install --with-deps chromium` downloads
   ~150 MB each run. Consider adding `actions/cache` on `~/.cache/ms-playwright` to speed up CI.
   Plan should decide whether to add this optimization in Phase 4 or defer.

3. **E2e browser choice**: research assumes Chromium only. If Safari/WebKit or Firefox coverage
   is wanted, extend `playwright.config.ts` `projects`. For now, one browser is the cheapest path
   to a meaningful gate.

4. **Playwright test isolation**: this research recommends one test user per run (created in
   `globalSetup`, deleted in `globalTeardown`). If the e2e test suite grows to multiple specs,
   per-test isolation (via `beforeEach`/`afterEach`) may be needed to avoid data cross-contamination.
   Out of scope for the single-spec Phase 4.

5. **Astro `security.checkOrigin` in Playwright**: the integration tests required an `Origin`
   header for POST requests to avoid CSRF rejection. Playwright sends a real browser `Origin`
   header automatically on form submissions — no special handling needed. Confirmed by the fact
   that form POs go through the form element's `action`, not `fetch()`.
