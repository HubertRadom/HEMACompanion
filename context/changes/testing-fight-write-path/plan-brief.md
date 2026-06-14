# Fight Write-Path Integration Tests — Plan Brief

> Full plan: `context/changes/testing-fight-write-path/plan.md`
> Research: `context/changes/testing-fight-write-path/research.md`

## What & Why

Rollout Phase 2 of the test plan: add integration tests that prove fight saves actually persist rows in the database with all correct fields, and that the optional gear-set FK behaves as the migration specifies. Risks #2 and #6 cannot be proven by the existing unit-only infrastructure — the DB constraints (NOT NULL, FK, ON DELETE SET NULL) are the real failure surface, and all fight handlers return HTTP 302 redirects, making HTTP status useless as a test oracle.

## Starting Point

Vitest is configured for pure unit tests only (node env, `npm test`, no DB harness). The local Supabase CLI is already in devDependencies. No integration test config, no `.env.test.local`, and no `src/test/` directory exist yet.

## Desired End State

`npm run test:integration` runs five DB-layer integration tests against a local Supabase instance, all passing. `npm test` (unit) continues to run without Supabase. §6.2 of the test-plan cookbook documents the integration test pattern for Phase 3 and beyond.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Test oracle | DB row state (separate `.select()` after insert) | HTTP status is useless (all paths return 302); the insert's own return is not independent enough to be an oracle | Research |
| Supabase client | Service-role key for all operations | Phase 2 is about DB constraints and persistence; RLS / two-user isolation testing is Phase 3 scope | Plan |
| Test run | Separate `npm run test:integration` | Keeps `npm test` fast and DB-free; integration tests have an explicit `supabase start` prerequisite | Plan |
| Failure path | Include explicit DB rejection tests (NOT NULL + FK) | Risk #2's oracle requires proving `error !== null` on constraint violation, not just that happy-path inserts succeed | Plan |
| Scope | Fight CREATE + gear_set DELETE behaviors only | Fight UPDATE and DELETE are lower-risk single operations with no identified risk in Phase 2; coverage beyond Risks #2/#6 deferred | Plan |
| Auth user | Real `auth.users` entry via `auth.admin.createUser()` | `fights.user_id` references `auth.users` with NOT NULL FK — service-role client bypasses RLS but not PostgreSQL FK constraints | Research |

## Scope

**In scope:** integration test infra (config, env, setup file, npm script), fight CREATE all-fields oracle, NOT NULL violation probe, FK violation probe, no-gear fight save, gear_set DELETE → fight SET NULL, §6.2 cookbook update

**Out of scope:** fight UPDATE, fight DELETE, HTTP handler / anon-client testing, RLS / two-user isolation (Phase 3), CI wiring (Phase 4), handler input validation / enum enforcement (Risk #5)

## Architecture / Approach

A separate `vitest.integration.config.ts` picks up `*.integration.test.ts` files and loads `.env.test.local` (gitignored). `src/test/setup.integration.ts` exports a service-role Supabase client and a `ctx` object whose `userId` is populated by `beforeAll` via `auth.admin.createUser()`. Tests insert rows and then run a separate `.select()` to assert field values — never trusting the insert's own return. `afterAll` calls `auth.admin.deleteUser()` which cascades all fights and gear_sets for the test user, eliminating per-test cleanup.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Bootstrap infra | `vitest.integration.config.ts`, `.env.test.local`, `src/test/setup.integration.ts`, `npm run test:integration` | `@supabase/supabase-js` may need an explicit devDependency entry |
| 2. Risk #2 tests | 3 scenarios: all-fields oracle + 2 DB rejection probes | Assertion must use a separate `.select()` — not the insert return |
| 3. Risk #6 tests | 2 scenarios: no-gear save + SET NULL deletion | Scenario E must delete the gear_set before querying the fight |
| 4. Cookbook §6.2 | Integration test recipe documented in test-plan | None |

**Prerequisites:** `supabase start` must be running before `npm run test:integration`. `.env.test.local` must be populated from `supabase status` output.
**Estimated effort:** ~1 session across 4 phases

## Open Risks & Assumptions

- `@supabase/supabase-js` is currently a transitive dep of `@supabase/ssr` — may need an explicit `devDependencies` entry if resolution breaks.
- `.env.test.local` must already be gitignored by the Vite-generated `.gitignore` (`*.local` pattern) — verify before the file is created.
- Local Supabase service-role key is deterministic across all local instances — safe to document in `.env.test.local.example`.

## Success Criteria (Summary)

- `npm run test:integration` exits green with all 5 tests passing (requires `supabase start`)
- `npm test` exits green with all unit tests passing (no Supabase needed)
- §6.2 cookbook is filled in and a reader can follow it to add a new integration test
