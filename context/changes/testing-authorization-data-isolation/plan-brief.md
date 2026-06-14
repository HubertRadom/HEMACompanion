# Authorization & Data Isolation Integration Tests — Plan Brief

> Full plan: `context/changes/testing-authorization-data-isolation/plan.md`
> Research: `context/changes/testing-authorization-data-isolation/research.md`

## What & Why

Add integration tests for Phase 3 of the test plan, covering three authorization risks: cross-user data access (IDOR), unprotected routes serving data to unauthenticated users, and server-side validation that can be bypassed by skipping the UI form. Phase 2 proved that Supabase RLS and DB constraints work, but its service-role client bypasses RLS entirely — Phase 3 tests the actual production enforcement path.

## Starting Point

Phase 2 delivered a Vitest integration harness with one service-role Supabase client, one test user with cascade teardown, and five passing fight persistence tests. There is no anon-JWT client, no second user, no running Astro server, and no HTTP test infrastructure.

## Desired End State

`npm run test:integration` passes 13 scenarios (5 Phase 2 + 3 IDOR + 3 protected-route redirects + 2 validation rejections). `npm test` passes unit tests including a new `fight-validation.test.ts`. `WEAPON_CATEGORIES` and `FIGHT_RESULTS` live in one shared module. §6.3 cookbook documents both new test patterns.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Phase 3 scope | Include Risks #3, #4, #5 in one phase | Keeps authorization coverage self-contained; Phase 4 stays focused on CI gates + e2e | Plan |
| IDOR test layer | Supabase anon-JWT client (no running server) | Service-role bypasses RLS — only a JWT-scoped anon client tests the actual production enforcement mechanism | Research |
| HTTP server for Risks #4/#5 | `astro dev --port 4322` via Vitest globalSetup | `@astrojs/cloudflare` adapter means `astro preview` doesn't produce a standard HTTP server; `astro dev` uses Miniflare and serves standard HTTP | Research |
| Sign-in flow for auth cookie | POST to `/auth/signin`, capture `Set-Cookie` | No knowledge of `@supabase/ssr`'s internal cookie format needed; more realistic than manual cookie construction | Plan |
| Validation constants extraction | Extract to `src/lib/fight-validation.ts` | Constants duplicated in two handler files; extraction mirrors `gear-categories.ts` pattern and enables a unit test | Plan |
| RLS SELECT oracle | `data.length === 0` (not `error !== null`) | RLS SELECT denials return an empty result set, not a PostgreSQL error — asserting on error would pass even if RLS is broken | Research |

## Scope

**In scope:**
- `SUPABASE_ANON_KEY` env var + two-user setup in `setup.integration.ts`
- `createUserClient()` helper for signed-in anon JWT clients
- Three IDOR scenarios (SELECT, UPDATE, DELETE) against `fights`
- Shared `src/lib/fight-validation.ts` + unit test for constants
- `vitest.globalSetup.ts` spawning `astro dev`
- Three protected-route redirect tests (HTTP, no auth)
- Two server-validation rejection tests (HTTP, valid auth + bad enum)
- §6.3 cookbook with IDOR and HTTP recipes

**Out of scope:**
- IDOR tests for `gear_sets` / `gear_items` (same RLS pattern — fights proves it)
- Auth flow testing (sign-in/sign-out — §7 exclusion)
- Gear/gear-sets server validation (no enum fields)
- CI pipeline configuration (Phase 4)
- Playwright e2e tests (Phase 4)

## Architecture / Approach

Two test layers. **Supabase client layer** (Phases 1–2): create two users via admin API, sign each in via an anon client to get JWTs, use JWT-scoped clients to attempt cross-user operations on a fight row — RLS enforces the denial. **HTTP layer** (Phases 4–5): spawn `astro dev` once in Vitest `globalSetup`; test files `fetch()` against `process.env.TEST_BASE_URL` with `redirect: 'manual'`; unauthenticated requests assert `302 /auth/signin`; authenticated requests with bad enums assert the `?error=` query param in the Location header.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Extend test setup | `SUPABASE_ANON_KEY`, second user, `createUserClient()` helper | Anon-key client not yet in `.env.test.local` — must add manually |
| 2. Risk #3 — IDOR probe | Three cross-user denial scenarios at Supabase client layer | RLS SELECT returns empty array (not error) — wrong oracle fails silently |
| 3. Extract validation constants | `src/lib/fight-validation.ts` + unit test | Handler import change might introduce a type mismatch |
| 4. Astro dev server setup | `vitest.globalSetup.ts`, `TEST_BASE_URL` in env | `astro dev` cold-start can take 40+ s; 60 s timeout required |
| 5. HTTP tests (Risks #4 + #5) | 5 HTTP scenarios (3 auth redirect + 2 validation) | Sign-in field names in `/auth/signin` handler must be verified before use |
| 6. §6.3 cookbook | IDOR pattern + HTTP pattern documented | — |

**Prerequisites:** `supabase start` running locally; `SUPABASE_ANON_KEY` added to `.env.test.local`.
**Estimated effort:** ~3 sessions across 6 phases.

## Open Risks & Assumptions

- `astro dev` with `@astrojs/cloudflare` adapter uses Miniflare for CF Workers emulation — should serve standard HTTP, but if Miniflare introduces unexpected behavior, the HTTP test setup may need adjustment.
- The `/auth/signin` handler's exact FormData field names are assumed to be `email` and `password` — **must verify against `src/pages/api/auth/signin.ts` before implementing Phase 5**.
- `response.headers.getSetCookie()` requires Node.js 18+. Verify Node version in the dev environment.

## Success Criteria (Summary)

- `npm run test:integration` passes 13 scenarios: 5 Phase 2 + 3 IDOR + 3 route protection + 2 validation rejection.
- `npm test` passes with `fight-validation.test.ts` included (constants verified against PRD).
- `test-plan.md §6.3` documents both the IDOR pattern and the HTTP auth pattern so a new contributor can add tests without further questions.
