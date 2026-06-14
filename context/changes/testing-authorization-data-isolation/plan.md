# Authorization & Data Isolation Integration Tests — Implementation Plan

## Overview

Rollout Phase 3 of `context/foundation/test-plan.md` ("Authorization & data isolation"), defending **Risks #3, #4, and #5**. Extends the Phase 2 integration harness with two new capabilities: an anon-JWT Supabase client for two-user IDOR probes at the DB layer (Risk #3), and an Astro dev server spawned in Vitest global setup for HTTP-level tests of route protection and server-side enum validation (Risks #4 + #5). Also extracts duplicated fight validation constants to a shared module, closing a latent duplication gap and enabling a unit test for the constants themselves.

## Current State Analysis

- Integration harness exists: `vitest.integration.config.ts`, `src/test/setup.integration.ts` (single service-role client, one test user with cascade teardown), `src/lib/fights.integration.test.ts` (5 scenarios, all green).
- `setup.integration.ts` exports `db` (service-role client — **bypasses RLS**) and `ctx.userId`. No anon-key client, no second user, no HTTP layer.
- Middleware (`src/middleware.ts:4`): `PROTECTED_ROUTES = ["/dashboard", "/gear", "/gear-sets", "/fights", "/stats"]`, `.startsWith()` match → 302 to `/auth/signin` on no session.
- Every API handler independently calls `supabase.auth.getUser()` and redirects to `/auth/signin` if no user.
- RLS fully enabled on `fights`, `gear_sets`, `gear_items`, `gear_set_compositions` — all check `auth.uid() = user_id`. **Service-role client bypasses RLS entirely**, so Phase 2 tests never touched ownership enforcement.
- `WEAPON_CATEGORIES = ["longsword", "sabre", "rapier", "other"]` and `FIGHT_RESULTS = ["win", "loss", "draw"]` are defined inline in both `src/pages/api/fights/index.ts` and `src/pages/api/fights/[id].ts` — duplicated, not shared. No DB CHECK constraints on either column.
- Adapter: `@astrojs/cloudflare` (`output: "server"`). Astro env schema: `SUPABASE_URL` and `SUPABASE_KEY` (the anon key), both `optional: true`. `astro preview` produces Cloudflare output — not a standard Node.js server. `astro dev` uses Miniflare for CF Workers emulation and serves standard HTTP, making it suitable for local HTTP integration tests.

(Full grounding: `context/changes/testing-authorization-data-isolation/research.md`.)

## Desired End State

- `npm run test:integration` passes with all Phase 2 tests + three IDOR scenarios + three protected-route redirect tests + two server-validation rejection tests.
- `npm test` passes with all Phase 1 unit tests + new `fight-validation.test.ts`.
- `src/lib/fight-validation.ts` is the single source of truth for `WEAPON_CATEGORIES` and `FIGHT_RESULTS`; both handler files import from it.
- `src/test/setup.integration.ts` supports two users and provides `createUserClient()` for RLS-aware tests.
- `vitest.globalSetup.ts` spawns `astro dev` once per test run; `process.env.TEST_BASE_URL` is available in all integration tests.

**Verify:** `supabase start` → `npm run test:integration` (all tests pass) and `npm test` (unit tests pass, no Supabase running).

### Key Discoveries

- Service-role client bypasses RLS; IDOR tests require an anon-key client signed in as a real user. `SUPABASE_ANON_KEY` does not exist in the test env yet.
- RLS SELECT denials return an **empty result set** (not an error). IDOR SELECT test must assert `data.length === 0`, not `error !== null`.
- HTTP tests require a running Astro process. `astro dev` is the right command for this adapter (`astro preview` does not produce a standard HTTP server for Cloudflare adapter output). The dev server reads `SUPABASE_URL` and `SUPABASE_KEY` from its process environment — globalSetup maps `SUPABASE_ANON_KEY → SUPABASE_KEY` when spawning.
- Sign-in cookies: POST to `/auth/signin` with FormData, capture `Set-Cookie` response headers, replay in subsequent requests. No internal `@supabase/ssr` cookie format knowledge needed.
- `WEAPON_CATEGORIES` and `FIGHT_RESULTS` are duplicated in two handler files. Extracting to `src/lib/fight-validation.ts` (mirroring `src/lib/gear-categories.ts`) eliminates the duplication and enables a unit test.

## What We're NOT Doing

- **Not testing gear_sets/gear_items IDOR separately** — the RLS pattern is identical across tables; fights covers the enforcement proof for Phase 3. Phase 3 cookbook will note this.
- **Not testing the auth sign-in/sign-out flow itself** — §7 exclusion; we test our authorization and validation, not the Supabase auth library.
- **Not testing gear/gear-sets enum validation via HTTP** — those tables have no enum fields with the same duplication problem.
- **Not using `astro preview`** — Cloudflare adapter output requires wrangler/Miniflare; `astro dev` is the correct local dev server for this adapter.
- **Not configuring CI** — Phase 4 scope.
- **Not writing e2e Playwright tests** — Phase 4 scope.
- **Not testing RLS handler-level `.eq("user_id", user.id)` redundancy** — RLS is the primary layer; the handler filter is a secondary safety net. Testing RLS at the DB layer gives full signal.

## Implementation Approach

Six sequential phases. Phases 1–2 extend the existing Supabase-client integration infrastructure and deliver Risk #3. Phase 3 extracts validation constants (prerequisite for Risk #5's unit test). Phase 4 bootstraps the HTTP test infrastructure (prerequisite for Risks #4 + #5). Phase 5 delivers the HTTP-level tests for Risks #4 and #5. Phase 6 fills the §6.3 cookbook.

## Critical Implementation Details

- **`SUPABASE_ANON_KEY` → `SUPABASE_KEY` mapping.** The Astro app's env schema names the anon key `SUPABASE_KEY`. Our test env file names it `SUPABASE_ANON_KEY`. The globalSetup must pass `SUPABASE_KEY: process.env.SUPABASE_ANON_KEY` when spawning `astro dev`; do not pass the service-role key.

- **`astro dev` ready signal.** The Astro dev server prints "ready in" to stdout when it finishes starting. Wait for this substring before letting tests proceed. Allow at least 60 seconds; the first cold start with dependency bundling takes longer than subsequent runs.

- **`process.env.TEST_BASE_URL` propagation.** `globalSetup` runs in the main Vitest process. Setting `process.env.TEST_BASE_URL` there propagates to all worker processes (Vitest forks workers after globalSetup completes). Test files can read it directly from `process.env`.

- **Two-user `beforeAll` ordering.** `setup.integration.ts` is registered as a `setupFiles` entry. Its `beforeAll` (which creates both users) fires before any test file's own `beforeAll`. By the time the HTTP test's `beforeAll` signs in, `ctx.userAEmail` is already populated.

- **RLS SELECT oracle.** When an RLS SELECT policy denies access, Supabase returns an empty array `[]`, not an error. Use `.select('*').eq('id', id)` (not `.single()`) and assert `data.length === 0`. Using `.single()` would return `PGRST116` (not found) which is ambiguous — the row might genuinely not exist.

---

## Phase 1: Extend integration test setup

### Overview

Add `SUPABASE_ANON_KEY` to the test environment, extend `setup.integration.ts` with a second test user and the `createUserClient()` helper, and export email/password identifiers for both users so HTTP tests can sign in.

### Changes Required

#### 1. `.env.test.local.example` — document the new variable

**File**: `.env.test.local.example`

**Intent**: Tell future contributors that `SUPABASE_ANON_KEY` is now required alongside the existing two variables.

**Contract**: Add `SUPABASE_ANON_KEY=<your-anon-key-from-supabase-status>` as a third line. The anon key is the "anon key" value from `supabase status`.

#### 2. Extend `setup.integration.ts` — second user, email storage, anon client helper

**File**: `src/test/setup.integration.ts`

**Intent**: Phase 2 tests need `ctx.userBId` and `ctx.userBEmail`; Phase 5 HTTP tests need `ctx.userAEmail` to sign in via the Astro auth endpoint. `createUserClient()` returns an anon Supabase client that presents a real user JWT so RLS policies apply to it.

**Contract**: Extend `ctx` with `userAEmail: string`, `userBId: string`, `userBEmail: string` (keep `userId: string` for Phase 2 backward compatibility; `userId === userAId`). In `beforeAll`, generate and store both emails before passing to `admin.createUser`. In `afterAll`, also delete `ctx.userBId`. Export:

- `USER_PASSWORD` constant (`"test-password-integration"`) — used by tests that call `createUserClient`.
- `createUserClient(email: string, password: string): Promise<SupabaseClient>` — creates an anon base client from `process.env.SUPABASE_URL` + `process.env.SUPABASE_ANON_KEY`, calls `signInWithPassword`, then returns a second anon client with `global.headers.Authorization: Bearer <access_token>`. This client respects RLS because Supabase resolves `auth.uid()` from the JWT.

Non-obvious note: `createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: 'Bearer ...' } } })` is the correct pattern for a JWT-scoped anon client in a Node.js test. The `autoRefreshToken: false` prevents background token refresh; `persistSession: false` prevents the session being stored in any global store.

### Success Criteria

#### Automated Verification

- `npm run test:integration` passes (all 5 Phase 2 scenarios still green)
- `npm test` passes (unit tests unaffected)

#### Manual Verification

- `ctx.userAEmail` and `ctx.userBEmail` are distinct non-empty strings before test execution (add a temporary `console.log` to verify, then remove)
- `createUserClient(ctx.userAEmail, USER_PASSWORD)` can be called in a scratch test and connects without error

---

## Phase 2: Risk #3 — IDOR two-user probe

### Overview

Create `src/lib/idor.integration.test.ts` with three scenarios proving that User B's anon-JWT client cannot read, modify, or delete User A's fight rows. Tests use the service-role `db` to create the target row and verify it is unchanged after each denied operation.

### Changes Required

#### 1. IDOR integration test

**File**: `src/lib/idor.integration.test.ts`

**Intent**: Assert that RLS SELECT, UPDATE, and DELETE policies on `fights` deny cross-user access when accessed via a real user JWT (not the service-role key).

**Contract**: One `describe` block. In `beforeAll`:
- Insert a fight owned by `ctx.userId` via service-role `db` (all required fields; `opponent_name: "IDOR-Target"`). Store the returned `id` as `fightId`.
- Create `userBClient` by calling `await createUserClient(ctx.userBEmail, USER_PASSWORD)`.

Three tests, each using `userBClient` to attempt an operation on `fightId`:

**Scenario F — SELECT denied (RLS makes row invisible)**:
Call `userBClient.from('fights').select('*').eq('id', fightId)`. Assert `data` has length 0. Do not use `.single()` — the RLS SELECT policy returns an empty result set, not an error.

**Scenario G — UPDATE denied (RLS USING clause blocks mutation)**:
Call `userBClient.from('fights').update({ opponent_name: 'mutated' }).eq('id', fightId)`. Then query the fight via the service-role `db` and assert `fight.opponent_name === 'IDOR-Target'` (the original value is unchanged). This proves the update was silently denied, not that Supabase returned an error row.

**Scenario H — DELETE denied (RLS prevents deletion)**:
Call `userBClient.from('fights').delete().eq('id', fightId)`. Then query the fight via service-role `db` with `.maybeSingle()` and assert `data !== null` (the row still exists). This is the conclusive oracle: the fight survives.

No per-test cleanup needed — `setup.integration.ts`'s `afterAll` deletes userA (and cascades all of their fights).

### Success Criteria

#### Automated Verification

- `npm run test:integration` passes with all 8 scenarios (5 from Phase 2 + 3 IDOR scenarios F–H)
- `npm test` passes unchanged
- `npx astro check` passes
- `npm run lint` passes

#### Manual Verification

- After the test run, open Supabase Studio (`http://127.0.0.1:54323`); confirm the `fights` table is empty (cascade teardown cleared everything including the IDOR target row)
- Spot-check Scenario G: temporarily change `opponent_name` in the fight insert to something unique and confirm the update test still passes (the change didn't land)

---

## Phase 3: Extract fight validation constants

### Overview

Move `WEAPON_CATEGORIES` and `FIGHT_RESULTS` out of the two fight handler files into a shared module `src/lib/fight-validation.ts`, mirroring the existing `src/lib/gear-categories.ts` pattern. Add a unit test for the constants that runs under `npm test` (no Supabase required).

### Changes Required

#### 1. Shared validation module

**File**: `src/lib/fight-validation.ts`

**Intent**: Single source of truth for fight enum values, eliminating the duplication between the create and update handlers.

**Contract**: Export `WEAPON_CATEGORIES` as a `const` array and `WeaponCategory` as its inferred type. Export `FIGHT_RESULTS` as a `const` array and `FightResult` as its inferred type. The values must match what was in the handlers before extraction — `["longsword", "sabre", "rapier", "other"]` and `["win", "loss", "draw"]` — these come from the PRD's list of supported weapon categories and fight outcomes (FR-012).

#### 2. Update fight create handler

**File**: `src/pages/api/fights/index.ts`

**Intent**: Remove the local `WEAPON_CATEGORIES` and `FIGHT_RESULTS` declarations; import from the shared module.

**Contract**: Add `import { WEAPON_CATEGORIES, FIGHT_RESULTS } from "@/lib/fight-validation"`. Remove the two `const` declarations at the top of the file. The `.includes()` validation calls remain unchanged; only the source of the constants changes.

#### 3. Update fight update handler

**File**: `src/pages/api/fights/[id].ts`

**Intent**: Same change as the create handler.

**Contract**: Same as above — import from `@/lib/fight-validation`, remove local const declarations.

#### 4. Unit test for the constants

**File**: `src/lib/fight-validation.test.ts`

**Intent**: Prove the exported constants contain exactly the right values — no more, no fewer. Oracle comes from the PRD (FR-012 / the product's domain rules for weapon categories and fight outcomes), not from reading the handler or calling the validation function.

**Contract**: Two `it` blocks using `expect(...).toStrictEqual(...)` against literal arrays. Expected values are literals derived from product requirements (`["longsword", "sabre", "rapier", "other"]` and `["win", "loss", "draw"]`). This test runs under `npm test` (the unit Vitest config, no Supabase).

### Success Criteria

#### Automated Verification

- `npm test` passes (including new `fight-validation.test.ts`)
- `npm run test:integration` passes (no regressions from handler import changes)
- `npx astro check` passes
- `npm run lint` passes

#### Manual Verification

- Neither `src/pages/api/fights/index.ts` nor `[id].ts` contains a local `const WEAPON_CATEGORIES` or `const FIGHT_RESULTS` declaration (both import from `@/lib/fight-validation`)

---

## Phase 4: Astro dev server global setup

### Overview

Wire a Vitest `globalSetup` file that starts `astro dev` once per test run with the correct environment variables, waits for the ready signal, and tears it down cleanly. This is the prerequisite for Phase 5's HTTP tests.

### Changes Required

#### 1. Global setup file

**File**: `vitest.globalSetup.ts`

**Intent**: Spawn the Astro dev server as a child process before any test runs; make its base URL available to test files via `process.env.TEST_BASE_URL`; kill the process after all tests finish.

**Contract**: Export `setup(): Promise<void>` and `teardown(): Promise<void>`.

In `setup`:
- Spawn `npx astro dev --port 4322` (or equivalent: `node_modules/.bin/astro dev --port 4322`) with `stdio: ['ignore', 'pipe', 'pipe']`.
- Pass `env: { ...process.env, SUPABASE_KEY: process.env.SUPABASE_ANON_KEY! }` — this maps the test env's `SUPABASE_ANON_KEY` to the Astro app's expected `SUPABASE_KEY`. `SUPABASE_URL` is already in `process.env` with the same name, so it propagates automatically.
- Wait for the string `"ready"` to appear in the child process's stdout, with a 60-second timeout. Reject the promise if the timeout fires or the process exits before ready.
- Set `process.env.TEST_BASE_URL = 'http://localhost:4322'`.

In `teardown`:
- Call `server.kill('SIGTERM')` (or `server.kill()` on Windows).

Store the `ChildProcess` reference in a module-level variable so `teardown` can access it.

#### 2. Register global setup in integration config

**File**: `vitest.integration.config.ts`

**Intent**: Tell Vitest to run `vitest.globalSetup.ts` once before the full integration test suite.

**Contract**: Add `globalSetup: ['vitest.globalSetup.ts']` inside the `test` config object, alongside the existing `environment`, `include`, and `setupFiles`.

### Success Criteria

#### Automated Verification

- `npm run test:integration` still passes all 8 existing tests (no regressions from adding globalSetup)
- `process.env.TEST_BASE_URL` evaluates to `'http://localhost:4322'` inside a test (add a temporary assertion, then remove)
- `fetch(process.env.TEST_BASE_URL + '/')` returns a response with any status code (server is reachable)

#### Manual Verification

- Test runner output shows the dev server starting (stdout from the child process, or at minimum the test suite does not hang)
- After `npm run test:integration` exits, no orphaned `astro` or `node` processes remain on port 4322

---

## Phase 5: Risks #4 + #5 — HTTP route protection and server validation

### Overview

Add `src/lib/http-auth.integration.test.ts` with five HTTP scenarios: three proving that unauthenticated requests to protected routes are redirected to `/auth/signin` (Risk #4), and two proving that the server rejects invalid fight enum values even when bypassing the UI form (Risk #5).

### Changes Required

#### 1. HTTP integration test file

**File**: `src/lib/http-auth.integration.test.ts`

**Intent**: Test that the Astro middleware and API handlers enforce authentication (redirect unauthenticated requests) and that the server-side enum validation rejects bad values regardless of the client.

**Contract**: Uses `process.env.TEST_BASE_URL` (set by globalSetup). All `fetch` calls use `redirect: 'manual'` to capture the 302 without following it. Assertions check `response.status === 302` and inspect `response.headers.get('location')`.

**Risk #4 block** (three tests, no auth cookie):
- `GET /fights` → `response.status === 302`, `location === '/auth/signin'`
- `GET /gear-sets` → same
- `POST /api/fights` (empty FormData body, no Cookie header) → `response.status === 302`, `location === '/auth/signin'`

The middleware matcher covers all five prefixes; two representative page routes + one API route are sufficient to prove the pattern.

**Risk #5 block** (two tests, valid auth + invalid enum):

Before the Risk #5 tests, a `beforeAll` must obtain a valid session cookie. Steps:
1. Read `ctx.userAEmail` (populated by `setup.integration.ts`'s `beforeAll`).
2. POST to `${BASE_URL}/auth/signin` with `FormData` containing the sign-in fields — **check `src/pages/api/auth/signin.ts` for the exact field names** before implementation; they are typically `email` and `password`.
3. Use `redirect: 'manual'`; the sign-in handler sets session cookies on the 302 response.
4. Capture `response.headers.getSetCookie()` (returns `string[]`). Join as `cookies.map(c => c.split(';')[0]).join('; ')` to get the `Cookie` header value for subsequent requests.

Risk #5 tests (both POST to `${BASE_URL}/api/fights` with the captured `Cookie` header):
- Valid fields + `weapon_category: 'axe'` (not in `WEAPON_CATEGORIES`) → `response.status === 302`, `response.headers.get('location')` contains `error=Invalid%20weapon%20category`.
- Valid fields + `result: 'tie'` (not in `FIGHT_RESULTS`) → `response.status === 302`, location contains `error=Invalid%20result`.

"Valid fields" means `opponent_name`, `result` (valid when testing weapon_category), `weapon_category` (valid when testing result), and `date` in `YYYY-MM-DD` format — sufficient to pass all other validations and isolate the one under test.

### Success Criteria

#### Automated Verification

- `npm run test:integration` passes with all 13 scenarios (8 prior + 3 Risk #4 + 2 Risk #5)
- `npm test` passes unchanged (unit tests unaffected)
- `npx astro check` passes
- `npm run lint` passes

#### Manual Verification

- Sign-in POST response contains non-empty `Set-Cookie` headers (session cookie confirmed captured)
- Risk #5 spot-check: temporarily remove the `WEAPON_CATEGORIES.includes()` guard from `src/pages/api/fights/index.ts`, run `npm run test:integration` — the Risk #5 weapon_category test should fail (confirms the test is catching the real guard, not a side effect)
- Restore the guard before committing

---

## Phase 6: Update §6.3 cookbook

### Overview

Replace the §6.3 "TBD — see §3 Phase 3" placeholder in `context/foundation/test-plan.md` with the concrete recipes established by this phase.

### Changes Required

#### 1. Fill in §6.3

**File**: `context/foundation/test-plan.md`

**Intent**: Give future contributors a self-contained recipe for the two test patterns introduced in Phase 3: the IDOR two-user probe and the HTTP auth/validation test.

**Contract**: §6.3 must document:
- **IDOR (Supabase client level)**: prerequisite (`SUPABASE_ANON_KEY` in `.env.test.local`), `createUserClient(email, password)` helper from `src/test/setup.integration`, how to create a target row via service-role `db`, and the RLS SELECT oracle (`data.length === 0`, not an error).
- **HTTP auth + validation**: prerequisite (`supabase start` + `astro dev` via `npm run test:integration`'s globalSetup), `process.env.TEST_BASE_URL`, `redirect: 'manual'` pattern, the sign-in cookie capture flow (POST to `/auth/signin`, `getSetCookie()`, join), and the Location-header oracle for validation rejections.
- **Reference test**: `src/lib/idor.integration.test.ts` (IDOR) and `src/lib/http-auth.integration.test.ts` (HTTP).
- Do not alter §1–§5 or any §3 status cells.

### Success Criteria

#### Automated Verification

- `test-plan.md §6.3` no longer contains "TBD — see §3 Phase 3"

#### Manual Verification

- A reader unfamiliar with the project can follow §6.3 to add a new IDOR test (for a different table) or a new protected-route test without further questions

---

## Testing Strategy

### Unit Tests

- `src/lib/fight-validation.test.ts`: two tests asserting `WEAPON_CATEGORIES` and `FIGHT_RESULTS` against literal PRD-derived values. Run via `npm test` (no Supabase, no server).

### Integration Tests

Thirteen scenarios total after Phase 5:

**Existing (Phase 2):**
- A: fight create — all fields persist with correct values
- B: NOT NULL violation → `error !== null`
- C: FK violation on bad `gear_set_id` → `error !== null`
- D: fight with `gear_set_id = null` saves
- E: gear_set delete → fight survives, `gear_set_id = null`

**Phase 2 (IDOR):**
- F: SELECT — UserB cannot read UserA's fight (RLS invisible)
- G: UPDATE — UserB cannot mutate UserA's fight (original value unchanged)
- H: DELETE — UserB cannot delete UserA's fight (row survives)

**Phase 3 (HTTP — Risk #4):**
- I: GET /fights without auth → 302 /auth/signin
- J: GET /gear-sets without auth → 302 /auth/signin
- K: POST /api/fights without auth → 302 /auth/signin

**Phase 4 (HTTP — Risk #5):**
- L: POST /api/fights with valid auth + invalid weapon_category → 302 with validation error
- M: POST /api/fights with valid auth + invalid result → 302 with validation error

### Manual Testing Steps

1. `supabase start` → note URL + service-role key + anon key from `supabase status`.
2. Populate `.env.test.local` with all three values.
3. `npm run test:integration` — all 13 scenarios pass.
4. `npm test` — unit tests pass (no Supabase running).
5. Verify Supabase Studio (`http://127.0.0.1:54323`) shows empty `fights` + `gear_sets` + `gear_items` tables (cascade teardown confirmed).

## Performance Considerations

The Astro dev server starts once in globalSetup and is reused for all HTTP tests. Cold start (first run) may take 20–40 seconds due to dependency bundling. Subsequent runs reuse Vite's cache and start in ~3–5 seconds. The globalSetup timeout is 60 seconds to accommodate cold starts.

## Migration Notes

No schema changes. No new migrations. All Phase 2 migrations remain unchanged.

## References

- Research: `context/changes/testing-authorization-data-isolation/research.md`
- Quality contract: `context/foundation/test-plan.md` (Risks #3/#4/#5, §3 Phase 3)
- Phase 2 plan (pattern reference): `context/changes/testing-fight-write-path/plan.md`
- Existing integration setup: `src/test/setup.integration.ts`
- Existing integration tests: `src/lib/fights.integration.test.ts`
- Middleware: `src/middleware.ts`
- Shared validation pattern: `src/lib/gear-categories.ts`
- Fights RLS migrations: `supabase/migrations/20260605000003_fights.sql:14-27`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Extend integration test setup

#### Automated

- [x] 1.1 `npm run test:integration` passes (all 5 Phase 2 scenarios still green) — b53600e
- [x] 1.2 `npm test` passes (unit tests unaffected) — b53600e

#### Manual

- [x] 1.3 `SUPABASE_ANON_KEY` documented in `.env.test.local.example` — b53600e
- [x] 1.4 `ctx.userAEmail` and `ctx.userBEmail` are distinct non-empty strings before test execution — b53600e
- [x] 1.5 `createUserClient(ctx.userAEmail, USER_PASSWORD)` connects without error in a scratch test — b53600e

### Phase 2: Risk #3 — IDOR two-user probe

#### Automated

- [x] 2.1 `npm run test:integration` passes (all 8 scenarios: A–E + F–H) — cd386d8
- [x] 2.2 `npm test` passes unchanged — cd386d8
- [x] 2.3 `npx astro check` passes — cd386d8
- [x] 2.4 `npm run lint` passes — cd386d8

#### Manual

- [x] 2.5 Supabase Studio shows empty `fights` table after full test run (cascade teardown) — cd386d8
- [x] 2.6 Spot-check Scenario G: changing the fight's `opponent_name` in the insert still results in the update test passing (mutation was denied) — cd386d8

### Phase 3: Extract fight validation constants

#### Automated

- [x] 3.1 `npm test` passes (including new `fight-validation.test.ts`) — 0efdbff
- [x] 3.2 `npm run test:integration` passes (no regressions) — 0efdbff
- [x] 3.3 `npx astro check` passes — 0efdbff
- [x] 3.4 `npm run lint` passes — 0efdbff

#### Manual

- [x] 3.5 Neither `src/pages/api/fights/index.ts` nor `[id].ts` contains a local `const WEAPON_CATEGORIES` or `const FIGHT_RESULTS` declaration — 0efdbff

### Phase 4: Astro dev server global setup

#### Automated

- [x] 4.1 `npm run test:integration` passes all 8 existing tests after globalSetup is added — 19ea64a
- [x] 4.2 `process.env.TEST_BASE_URL` is `'http://localhost:4322'` inside a test — 19ea64a
- [x] 4.3 `fetch(process.env.TEST_BASE_URL + '/')` returns a response with any status code — 19ea64a

#### Manual

- [x] 4.4 Test runner output shows the Astro dev server starting (no hanging) — 19ea64a
- [x] 4.5 No orphaned processes remain on port 4322 after `npm run test:integration` exits — 19ea64a

### Phase 5: Risks #4 + #5 — HTTP route protection and server validation

#### Automated

- [x] 5.1 Risk #4: 3 unauthenticated redirect tests pass (I, J, K) — 2da8f30
- [x] 5.2 Risk #5: 2 validation rejection tests pass (L, M) — 2da8f30
- [x] 5.3 `npm run test:integration` passes all 13 scenarios — 2da8f30
- [x] 5.4 `npm test` passes unchanged — 2da8f30
- [x] 5.5 `npx astro check` passes — 2da8f30
- [x] 5.6 `npm run lint` passes — 2da8f30

#### Manual

- [x] 5.7 Sign-in POST response contains non-empty `Set-Cookie` headers (confirm session cookie is captured) — 2da8f30
- [x] 5.8 Spot-check: removing the `WEAPON_CATEGORIES.includes()` guard from `fights/index.ts` causes test L to fail; restore guard before committing — 2da8f30

### Phase 6: Update §6.3 cookbook

#### Automated

- [x] 6.1 `test-plan.md §6.3` no longer contains "TBD — see §3 Phase 3" — 541f16b

#### Manual

- [x] 6.2 A reader unfamiliar with the project can follow §6.3 to add a new IDOR test or a new protected-route test without further questions — 541f16b
