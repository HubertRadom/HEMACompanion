# Quality-gates wiring + critical-path e2e — Implementation Plan

## Overview

Wire four missing CI gates (`astro check`, `npm test`, `npm run test:integration`, `npm run
test:e2e`) into `.github/workflows/ci.yml` and write one Playwright critical-path e2e test
covering the full happy path: sign in → add gear item → create gear set → log fight → view stats.
All four gates land in one PR; each implementation phase is independently verifiable before
moving to the next.

## Current State Analysis

The workflow at `.github/workflows/ci.yml` runs five steps:
`npm ci` → `npx astro sync` → `npm run lint` → `npm run build` → `wrangler deploy` (push only).
None of the existing test infrastructure (Vitest unit, Vitest integration, Playwright) is
invoked in CI. Regressions in the 13 integration scenarios (A–M) or the 11+ unit assertions
would silently reach `main`.

Vitest configs, the Astro dev server lifecycle (`vitest.globalSetup.ts`), and the two-user
admin-API harness (`src/test/setup.integration.ts`) are complete and production-ready from
Phases 1–3. Playwright is not yet installed.

## Desired End State

Every PR to `main` must pass:
1. `npx astro check` — TypeScript and Astro template type errors
2. `npm test` — 11+ unit assertions
3. `npm run test:integration` — 13 integration scenarios (A–M, Supabase required)
4. `npm run test:e2e` — one Playwright critical-path spec

Verification: open a PR, push a deliberate type error → CI fails at `astro check` before
reaching the build. Revert the error → all steps pass. The Playwright spec logs in as a
pre-created test user, adds a gear item, creates a gear set, logs a fight, navigates to `/stats`,
and asserts that the opponent name, gear set name, and gear item name are visible on the page.

### Key Discoveries

- `.github/workflows/ci.yml` — currently five steps; all four test gates are absent
  (`src/lib/gear-categories.ts`, `vitest.config.ts`, `vitest.integration.config.ts` already set)
- `vitest.integration.config.ts` uses `loadEnv` + `Object.assign(process.env, env)` — in CI
  where `.env.test.local` is absent, `loadEnv` returns `{}` and the `$GITHUB_ENV` vars
  already in `process.env` flow through untouched
- `vitest.globalSetup.ts` maps `SUPABASE_ANON_KEY` → `SUPABASE_KEY` for the Astro child
  process; `playwright.config.ts` must replicate this mapping in `webServer.env`
- `supabase/config.toml` present (API port 54321) → `supabase start` in CI works on
  `ubuntu-latest` (Docker available by default)
- `FormField` sets `name={name ?? id}` → form input names match IDs exactly; all selectors
  confirmed from source
- GearSetForm renders gear-item checkboxes as wrapping `<label>` elements (no `htmlFor`);
  the plan uses `page.locator('input[type="checkbox"][name="item_ids"]')` directly
- `fights/add` page pre-fetches gear sets server-side; the `#gear_set_id` select is populated
  on initial render — no async wait needed
- `lessons.md` flag: `?error=` URL param reflection is a phishing vector → e2e spec must
  assert only on success states, never on rendered error text from URL params

## What We're NOT Doing

- No multi-browser Playwright matrix — Chromium only
- No `supabase/config.toml` changes
- No new application code or database schema changes
- No Playwright visual regression or screenshot comparison — text-presence assertions only
- No caching of Supabase Docker images — GitHub runner layer cache handles it implicitly
- No separate CI jobs — one sequential job covers all gates
- No e2e tests for error paths (IDOR, server validation) — integration tests A–M already cover those

## Implementation Approach

CI steps are added sequentially in dependency order: cheap gates first (no Supabase), then
Supabase-dependent gates, then Playwright. All test steps come before `npm run build` so
failures surface before wasting build/deploy minutes. Playwright reuses the Supabase instance
started for integration tests (same `$GITHUB_ENV` vars) via a `webServer` config that spawns
a fresh Astro dev server on port 4322 (the integration test teardown has already killed the
previous one). Env var loading in `playwright.config.ts` mirrors `vitest.integration.config.ts`
exactly (same `loadEnv` call), so local dev and CI behave identically.

## Critical Implementation Details

**`supabase status` JSON key names**: verified against CLI v2.98.2 — the output uses
UPPERCASE: `.API_URL`, `.ANON_KEY`, `.SERVICE_ROLE_KEY`. The CI YAML uses these exact keys.
Do not change to snake_case — it will produce empty env vars and cause integration tests to fail.

**`SUPABASE_KEY` mapping**: the Astro dev server reads `SUPABASE_KEY` (not `SUPABASE_ANON_KEY`)
as its client-facing Supabase key. `vitest.globalSetup.ts` maps this explicitly. The
`playwright.config.ts` `webServer.env` must do the same:
`SUPABASE_KEY: process.env.SUPABASE_ANON_KEY ?? ''`.

---

## Phase 1: Typecheck + unit gates in CI

### Overview

Add `npx astro check` and `npm test` to the CI workflow immediately after `npx astro sync`.
No new dependencies, no Supabase required. This phase delivers value on the first commit and
is independently verifiable before the Supabase work begins.

### Changes Required

#### 1. CI workflow — typecheck and unit steps

**File**: `.github/workflows/ci.yml`

**Intent**: Insert two new `run` steps immediately after `- run: npx astro sync` and before
`- run: npm run lint`. Adding them after sync ensures the generated `.astro/types.d.ts` is
present before type checking runs. Placing them before the build means CI fails early on cheap
operations.

**Contract**: The two new steps, in order:
```yaml
- run: npx astro check
- run: npm test
```

### Success Criteria

#### Automated Verification

- [ ] 1.1 Push the branch → `npx astro check` step appears and passes in GitHub Actions
- [ ] 1.2 Push the branch → `npm test` step appears and passes in GitHub Actions

#### Manual Verification

- [ ] 1.3 Introduce a deliberate TypeScript error in `src/lib/stats.ts` (e.g. wrong return
  type), push → CI fails at `npx astro check` before reaching `npm run build`; revert → CI
  passes

---

## Phase 2: Supabase CLI in CI + integration gate

### Overview

Add `supabase/setup-cli@v1`, `supabase start`, env var export, and `npm run test:integration`
to the CI workflow. The existing `vitest.integration.config.ts`, `vitest.globalSetup.ts`, and
`src/test/setup.integration.ts` require no changes — only the CI YAML is modified.

### Changes Required

#### 1. CI workflow — Supabase setup and integration test steps

**File**: `.github/workflows/ci.yml`

**Intent**: After `- run: npm test` (Phase 1) and before `- run: npm run build`, add a block
that installs the Supabase CLI, starts the local stack, exports the three env vars that
`setup.integration.ts` and `vitest.globalSetup.ts` read, and runs the integration suite.

**Contract**:
```yaml
- uses: supabase/setup-cli@v1
  with:
    version: latest
- run: supabase start
- name: Export Supabase env vars
  run: |
    STATUS=$(supabase status --output json)
    echo "SUPABASE_URL=$(echo $STATUS | jq -r '.API_URL')" >> $GITHUB_ENV
    echo "SUPABASE_ANON_KEY=$(echo $STATUS | jq -r '.ANON_KEY')" >> $GITHUB_ENV
    echo "SUPABASE_SERVICE_ROLE_KEY=$(echo $STATUS | jq -r '.SERVICE_ROLE_KEY')" >> $GITHUB_ENV
- run: npm run test:integration
```

See the Critical Implementation Details section for the jq key-name verification step.

### Success Criteria

#### Automated Verification

- [ ] 2.1 Push the branch → `supabase start` step exits 0
- [ ] 2.2 Push the branch → "Export Supabase env vars" step sets non-empty `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (add a debug `echo $SUPABASE_URL` step
  temporarily if needed; remove before merging)
- [ ] 2.3 Push the branch → `npm run test:integration` step runs all 13 scenarios (A–M) and
  passes

#### Manual Verification

- [ ] 2.4 Inspect the CI step log for `npm run test:integration`: confirm the Astro dev server
  starts ("ready" substring visible in vitest output) and is killed in teardown (no "port in
  use" error on subsequent runs)

---

## Phase 3: Playwright infrastructure

### Overview

Install `@playwright/test`, add the `test:e2e` npm script, write `playwright.config.ts`,
`playwright/global-setup.ts`, and `playwright/global-teardown.ts`, then extend the CI workflow
with Playwright binary caching, the `test:e2e` step, and artifact upload on failure.

### Changes Required

#### 1. Add `@playwright/test` and `test:e2e` script

**File**: `package.json`

**Intent**: Add `@playwright/test` to `devDependencies` and add a `test:e2e` script so both
local developers and CI can invoke Playwright consistently.

**Contract**: In `devDependencies`, add `"@playwright/test": "^1.50.0"` (or the latest stable
at install time). In `scripts`, add `"test:e2e": "playwright test"`.

#### 2. Playwright configuration

**File**: `playwright.config.ts` (new, at repo root)

**Intent**: Configure Playwright to run in Chromium only, load `.env.test.local` for local dev
(same pattern as `vitest.integration.config.ts`), launch an Astro dev server on port 4322 via
`webServer` (passing `SUPABASE_KEY = SUPABASE_ANON_KEY` to the child process), and capture
traces and screenshots only on failure.

**Contract**: Use `loadEnv('test', process.cwd(), '')` from `vite` and `Object.assign(process.env, env)` before calling `defineConfig` — this is identical to the pattern in `vitest.integration.config.ts`.

```ts
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
      ...process.env,
      SUPABASE_KEY: process.env.SUPABASE_ANON_KEY ?? "",
    },
    timeout: 60_000,
  },
  globalSetup: "./playwright/global-setup.ts",
  globalTeardown: "./playwright/global-teardown.ts",
});
```

#### 3. Playwright global setup

**File**: `playwright/global-setup.ts` (new)

**Intent**: Before any spec runs, create one confirmed test user via the Supabase admin API
(same pattern as `src/test/setup.integration.ts` `beforeAll`), then store the user's ID, email,
and password in `process.env` so the spec and teardown can read them.

**Contract**: Use `createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })` with the service-role key from `process.env.SUPABASE_SERVICE_ROLE_KEY`. Call `db.auth.admin.createUser({ email, password, email_confirm: true })`. Throw on error. Write `process.env.E2E_USER_ID`, `process.env.E2E_USER_EMAIL`, `process.env.E2E_USER_PASSWORD`.

Use a timestamp-based email for uniqueness: `` `e2e+${Date.now()}@integration.test` `` and a
fixed password constant (e.g. `"e2e-password-playwright"`).

#### 4. Playwright global teardown

**File**: `playwright/global-teardown.ts` (new)

**Intent**: Delete the test user created in `global-setup.ts` after all specs have run.
`ON DELETE CASCADE` on `fights` and `gear_sets` removes all test data automatically — no
per-resource cleanup needed.

**Contract**: Read `process.env.E2E_USER_ID`; if non-empty, call
`db.auth.admin.deleteUser(process.env.E2E_USER_ID)`. Use the same service-role client
construction as `global-setup.ts`. Do not throw if deletion fails (teardown should not mask
spec failures).

#### 5. CI workflow — Playwright cache, install, test, artifact upload

**File**: `.github/workflows/ci.yml`

**Intent**: After `- run: npm run test:integration`, add: a Playwright browser cache step
(keyed to `package-lock.json` so the cache invalidates when `@playwright/test` is upgraded),
the browser install step, the `test:e2e` run step, and an artifact upload step that fires only
on failure to capture the Playwright report for debugging.

**Contract**:
```yaml
- name: Cache Playwright browsers
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ hashFiles('package-lock.json') }}
- run: npx playwright install --with-deps chromium
- run: npm run test:e2e
- name: Upload Playwright report
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: playwright-report
    path: playwright-report/
    retention-days: 7
```

### Success Criteria

#### Automated Verification

- [ ] 3.1 `npm install` succeeds with `@playwright/test` present in `node_modules`
- [ ] 3.2 `npx playwright install --with-deps chromium` exits 0 locally
- [ ] 3.3 `npm run test:e2e` (with local Supabase running and `.env.test.local` populated)
  exits 0 with 0 tests collected (no spec file yet — `--passWithNoTests` is not needed;
  Playwright exits 0 with 0 specs by default)
- [ ] 3.4 Push the branch → "Cache Playwright browsers" step appears and eventually shows
  a cache hit on the second push
- [ ] 3.5 `npm run lint` passes (ESLint must not flag `playwright.config.ts` or the new
  `playwright/` files — add `playwright/` to the ESLint config's include or ignore if needed)

#### Manual Verification

- [ ] 3.6 Run `npm run test:e2e` locally without Supabase running → `playwright/global-setup.ts`
  throws a clear error about missing `SUPABASE_SERVICE_ROLE_KEY` (not a silent hang)

---

## Phase 4: Critical-path e2e spec

### Overview

Write the single Playwright spec that executes the full critical path: sign in → add gear item
→ create gear set → log fight → navigate to `/stats` → assert that the opponent name, gear set
name, and gear item name are visible. The oracle is derived from test-input strings, not from
calling `computeStats()`.

### Changes Required

#### 1. Critical-path spec

**File**: `playwright/critical-path.spec.ts` (new)

**Intent**: One `test()` that traverses the entire happy path as a signed-in user. The test
reads credentials from `process.env` (set by `global-setup.ts`), navigates through each step
sequentially, and asserts on user-specific strings visible in the stats page. No intermediate
assertions on intermediate pages (the navigation redirect is the implicit assertion; errors
would surface via URL or missing form elements).

**Contract**:

Readable names for test data (use fixed strings so failures are easy to read):
```
gear item name:  "E2E-Sword"
gear category:   "Longsword"
gear set name:   "E2E-Set"
opponent name:   "E2E-Opponent"
weapon category: "longsword" (default — do not change the select)
result:          "win"       (default — do not change the select)
date:            leave as default (today)
```

Step sequence:
1. `page.goto('/auth/signin')` → fill `input[name="email"]` and `input[name="password"]` →
   click `button[type="submit"]` → `expect(page).toHaveURL('/')` (signin API redirects to `/`)
2. `page.goto('/gear/add')` → `page.fill('#name', 'E2E-Sword')` →
   `page.selectOption('#category', 'Longsword')` → `page.click('button[type="submit"]')` →
   `expect(page).toHaveURL('/gear')`
3. `page.goto('/gear-sets/add')` → `page.fill('#name', 'E2E-Set')` →
   `page.locator('input[type="checkbox"][name="item_ids"]').check()` (the only checkbox) →
   `page.click('button[type="submit"]')` → `expect(page).toHaveURL('/gear-sets')`
4. `page.goto('/fights/add')` → `page.fill('#opponent_name', 'E2E-Opponent')` →
   `page.selectOption('#gear_set_id', { label: 'E2E-Set' })` →
   `page.click('button[type="submit"]')` → `expect(page).toHaveURL('/fights')`
5. `page.goto('/stats')` →
   `await expect(page.getByText('E2E-Opponent')).toBeVisible()` →
   `await expect(page.getByText('E2E-Set')).toBeVisible()` →
   `await expect(page.getByText('E2E-Sword')).toBeVisible()`

The `weapon_category` and `result` selects default to `"longsword"` and `"win"` on first
render in `FightForm.tsx` — do not set them; the defaults satisfy the server-side validation.

The `date` input defaults to today's date in `FightForm.tsx` — do not set it.

The gear set selector in `/fights/add` is pre-populated server-side; `selectOption` by label
`'E2E-Set'` will find the option without any async wait beyond Playwright's default navigation
wait.

### Success Criteria

#### Automated Verification

- [ ] 4.1 `npm run test:e2e` (local Supabase running, `.env.test.local` populated) → 1 test
  passes, all 5 `expect` assertions pass
- [ ] 4.2 `npm run test:e2e` run twice in a row → both pass (teardown deletes the first
  user; second run creates a fresh one with a new timestamp-based email)
- [ ] 4.3 Push the branch → `npm run test:e2e` step in CI passes (all 4 gates green)
- [ ] 4.4 `npm run test:integration` still passes (13 scenarios A–M unaffected)
- [ ] 4.5 `npm test` still passes (unit tests unaffected)
- [ ] 4.6 `npx astro check` passes (no new type errors in `playwright/` files)

#### Manual Verification

- [ ] 4.7 Break the stats page by temporarily removing the `computeStats()` call in
  `src/pages/stats/index.astro` (return empty values instead) → the spec fails with a clear
  "Expected to be visible" error naming `E2E-Opponent`; restore the call → spec passes

---

## Phase 5: Cookbook update

### Overview

Fill in `§6.4` of `context/foundation/test-plan.md` with the Playwright pattern so future
contributors know how to add e2e tests.

### Changes Required

#### 1. Test-plan cookbook §6.4

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the "TBD — see §3 Phase 4" placeholder in §6.4 with the actual Playwright
pattern: `globalSetup`/`globalTeardown` for user lifecycle, `webServer` config for the Astro
server, the text-presence assertion approach, and a pointer to `playwright/critical-path.spec.ts`
as the reference test.

**Contract**: The new §6.4 body must cover:
- Prerequisites: local Supabase running + `.env.test.local` populated (same as §6.2)
- Runner: `npm run test:e2e` → `playwright test` (Chromium, `playwright.config.ts`)
- User lifecycle: `playwright/global-setup.ts` creates a user via admin API
  (`email_confirm: true`); `playwright/global-teardown.ts` deletes it; ON DELETE CASCADE
  cleans all data
- Form interaction pattern: fill by `id` selector, submit button click, assert
  `toHaveURL(target)` for redirect
- Stats page oracle rule: assert by **user-specific input strings** (opponent name, gear set
  name, gear item name) — never by calling `computeStats()` or copying its output
- Reference test: `playwright/critical-path.spec.ts`

### Success Criteria

#### Automated Verification

- [ ] 5.1 `§6.4` no longer contains "TBD"
- [ ] 5.2 `npm run lint` passes (no markdown linting regressions)

#### Manual Verification

- [ ] 5.3 A reader unfamiliar with the project can follow §6.4 to add a new e2e spec (for
  a different user flow) without further questions — the section names the prerequisites, the
  pattern files, and the oracle rule

---

## Testing Strategy

### Unit Tests

No changes to unit test files. Phase 1 verifies all 11+ unit assertions still pass in CI.

### Integration Tests

No changes to integration test files. Phase 2 verifies all 13 scenarios (A–M) pass in CI
with the local Supabase instance started via `supabase/setup-cli@v1`.

### E2e Tests

One spec in `playwright/critical-path.spec.ts` covering the full happy path. Assertions are
text-presence only (not numeric counts), targeting user-specific strings that cannot match
unless the full data round-trip succeeded.

### Manual Testing Steps

1. Start local Supabase: `npx supabase start`
2. `npm run test:e2e` — confirm 1 test passes
3. Run twice — confirm both pass (idempotency)
4. Introduce a regression in `src/pages/stats/index.astro` → confirm spec fails with a
   readable error
5. Push the branch → confirm all 4 CI gates pass in GitHub Actions

## Migration Notes

No database schema changes. No application code changes. CI workflow additions are backwards
compatible — the existing lint + build + deploy steps remain unchanged in position and behavior.

## References

- Research: `context/changes/testing-quality-gates-e2e/research.md`
- Phase 3 pattern (Astro dev server lifecycle): `vitest.globalSetup.ts`
- Phase 2/3 pattern (admin user creation): `src/test/setup.integration.ts`
- Env loading pattern: `vitest.integration.config.ts`
- Form selectors source: `src/components/gear/GearItemForm.tsx`,
  `src/components/gear/GearSetForm.tsx`, `src/components/fights/FightForm.tsx`
- Stats page oracle source: `src/pages/stats/index.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Typecheck + unit gates in CI

#### Automated

- [x] 1.1 Push the branch → `npx astro check` step appears and passes in GitHub Actions — b692b69
- [x] 1.2 Push the branch → `npm test` step appears and passes in GitHub Actions — b692b69

#### Manual

- [ ] 1.3 Introduce a deliberate TypeScript error, push → CI fails at `npx astro check`; revert → CI passes

### Phase 2: Supabase CLI in CI + integration gate

#### Automated

- [x] 2.1 Push the branch → `supabase start` step exits 0 — b692b69
- [x] 2.2 Push the branch → "Export Supabase env vars" step sets non-empty env vars — b692b69
- [x] 2.3 Push the branch → `npm run test:integration` passes all 13 scenarios — b692b69

#### Manual

- [ ] 2.4 Inspect CI log: Astro dev server starts and is killed cleanly in teardown

### Phase 3: Playwright infrastructure

#### Automated

- [x] 3.1 `npm install` succeeds with `@playwright/test` in `node_modules` — f5e04d4
- [x] 3.2 `npx playwright install --with-deps chromium` exits 0 locally — b346271
- [x] 3.3 `npm run test:e2e` exits 0 with 0 tests (no spec yet)
- [x] 3.4 Push → Playwright cache step shows cache hit on second push — b692b69
- [x] 3.5 `npm run lint` passes on `playwright.config.ts` and `playwright/` files — b692b69

#### Manual

- [ ] 3.6 Run `npm run test:e2e` without Supabase → clear error about missing env var

### Phase 4: Critical-path e2e spec

#### Automated

- [x] 4.1 `npm run test:e2e` locally → 1 test passes — f5e04d4
- [x] 4.2 `npm run test:e2e` run twice → both pass — f5e04d4
- [x] 4.3 Push → `npm run test:e2e` step in CI passes (all 4 gates green) — b692b69
- [x] 4.4 `npm run test:integration` still passes (13 scenarios A–M) — f5e04d4
- [x] 4.5 `npm test` still passes — f5e04d4
- [x] 4.6 `npx astro check` passes (no type errors in `playwright/` files) — f5e04d4

#### Manual

- [x] 4.7 Break stats page → spec fails with readable assertion error; restore → passes — b346271

### Phase 5: Cookbook update

#### Automated

- [x] 5.1 `§6.4` no longer contains "TBD" — f5e04d4
- [x] 5.2 `npm run lint` passes — b692b69

#### Manual

- [ ] 5.3 A reader can follow §6.4 to add a new e2e spec without further questions
