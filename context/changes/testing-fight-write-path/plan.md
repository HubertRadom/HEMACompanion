# Fight Write-Path Integration Tests — Implementation Plan

## Overview

Rollout Phase 2 of `context/foundation/test-plan.md` ("Fight write-path integrity"), defending **Risks #2 and #6**. Bootstrap an integration test harness against a real local Supabase instance and add DB-layer oracle tests proving: (a) a successful fight save persists all fields in the database with correct values; (b) a DB-rejected write returns a non-null Supabase error (not silent success); (c) a fight with no gear set saves with `gear_set_id = null`; (d) deleting a gear set leaves referencing fights intact with `gear_set_id = null`. Tests use the service-role Supabase client directly — no running Astro server needed — because all fight handlers return HTTP 302 redirects and HTTP status cannot distinguish success from error.

## Current State Analysis

- Unit tests run via `npm test` (Vitest, node env, `src/**/*.test.ts`). No integration config, no DB harness, no `.env.test.local`.
- Fight create handler: `src/pages/api/fights/index.ts` — single `.insert()` call, `if (error)` → 302 to form page with `?error=`, else 302 to `/fights`. HTTP 302 on all paths; HTTP status cannot signal DB failure.
- `fights.gear_set_id`: nullable, `references public.gear_sets(id) on delete set null` — confirmed in `supabase/migrations/20260605000003_fights.sql:8`.
- `fights.user_id`: NOT NULL FK → `auth.users(id) on delete cascade` — integration tests must create a real `auth.users` entry (FK constraint applies even with the service-role client).
- No CHECK constraints on `result` or `weapon_category` at the DB level.
- Local Supabase CLI is already in `devDependencies`. `supabase start` applies all migrations and exposes a deterministic local service-role key.

(Full grounding: `context/changes/testing-fight-write-path/research.md`.)

## Desired End State

- `npm run test:integration` runs Vitest with `vitest.integration.config.ts` and all integration tests pass against a locally running Supabase instance.
- `src/lib/fights.integration.test.ts` contains five passing tests covering Risks #2 and #6 with DB-state oracles.
- `npm test` (unit tests) is unaffected and continues to pass without a running Supabase.
- `test-plan.md §6.2` documents the integration test pattern for future phases.

**Verify:** `supabase start` → `npm run test:integration` (all 5 tests pass); `npm test` still passes without Supabase running.

### Key Discoveries

- All fight mutations return HTTP 302 redirects — HTTP status is not a viable oracle. The DB-state oracle (query the row after insert via a separate `.select()`) is the correct approach.
- `fights.user_id` is a NOT NULL FK to `auth.users` — service-role client bypasses RLS but not FK constraints. Integration tests must create a real auth user via `db.auth.admin.createUser()` in `beforeAll`.
- `auth.admin.deleteUser()` in `afterAll` cascades to all fights and gear_sets for that user (ON DELETE CASCADE on both tables) — this is the full teardown strategy; no per-test row cleanup needed.
- `@supabase/supabase-js` is needed for the service-role client in test code (not `@supabase/ssr`). Verify it is directly resolvable; add to `devDependencies` if it's only a transitive dep.
- `.env.test.local` is loaded automatically by Vitest (Vite's env chain for test mode). The `*.local` suffix is gitignored by Vite's default `.gitignore`.

## What We're NOT Doing

- **Not testing fight UPDATE or DELETE** — single-operation paths with no identified risk in Phase 2 scope.
- **Not testing through the HTTP handler layer** — 302-redirect architecture makes HTTP status useless; DB-layer integration gives equivalent signal at lower cost.
- **Not using anon client with JWT** — service-role client is sufficient for Phase 2 (DB constraints + persistence). RLS and ownership testing are Phase 3 (Risk #3) scope.
- **Not testing handler input validation** (enum checks, date format validation) — that is Risk #5 scope.
- **Not configuring CI** — Phase 4 scope.
- **Not testing gear-set create partial-write compensation** — that path is in the gear-set handler, not fights. Out of scope for Risks #2/#6.

## Implementation Approach

Stand up a separate Vitest integration config (`vitest.integration.config.ts`) that targets `*.integration.test.ts` files and loads test env from `.env.test.local`. A setup file (`src/test/setup.integration.ts`) exports a service-role Supabase client and manages the test user lifecycle (`beforeAll` / `afterAll`). Tests insert rows via the service-role client, assert DB state by querying back separately, and clean up via user cascade deletion. Five test scenarios span two phases (Risk #2 in Phase 2, Risk #6 in Phase 3) so each phase has an independently verifiable deliverable.

## Critical Implementation Details

- **`auth.users` FK constraint applies to service-role clients.** The service-role key bypasses RLS policies but NOT PostgreSQL foreign key constraints. A fight insert with a `user_id` that does not exist in `auth.users` will fail with an FK violation. Always create a real auth user in `beforeAll` via `db.auth.admin.createUser()` and use the returned `user.id` as `user_id` in all test inserts.

- **Oracle independence: query separately from the insert.** Do not use the `.insert(...).select()` chain's return value as the persistence oracle — that return value is produced by the same operation under test. Run a separate `.select('*').eq('id', insertedId).single()` call after the insert to prove the row is actually present in the DB with the correct field values.

---

## Phase 1: Bootstrap integration test infrastructure

### Overview

Wire the separate integration test run: Vitest config file, env file, setup file, and npm script. Unit tests (`npm test`) must pass unchanged without a running Supabase after this phase.

### Changes Required

#### 1. Integration Vitest config

**File**: `vitest.integration.config.ts`

**Intent**: Configure a separate Vitest instance for integration tests that picks up `*.integration.test.ts` files, loads the service-role key from `.env.test.local`, and applies the shared setup file.

**Contract**: `test.include = ['src/**/*.integration.test.ts']`, `test.environment = 'node'`, `test.setupFiles = ['src/test/setup.integration.ts']`. Mirror the `@/` alias from `vitest.config.ts` (`resolve.alias['@'] = ./src`). No `envDir` override needed — Vitest loads `.env.test.local` from the project root by default.

#### 2. Test environment file

**File**: `.env.test.local`

**Intent**: Hold local Supabase credentials for integration tests. Gitignored by the `*.local` pattern already in the Vite-generated `.gitignore`.

**Contract**: Two variables: `SUPABASE_URL` (e.g. `http://127.0.0.1:54321`) and `SUPABASE_SERVICE_ROLE_KEY` (value from `supabase status`). Do not commit this file. Alongside it, add `.env.test.local.example` at repo root showing the two variable names with placeholder values so new contributors know what to populate.

#### 3. Integration test setup file

**File**: `src/test/setup.integration.ts`

**Intent**: Export a shared service-role Supabase client and a mutable context object; manage the test user lifecycle so every integration test has a valid `user_id` that satisfies the `fights.user_id` FK constraint, and teardown cascades all data.

**Contract**: Non-obvious auth setup — include the core pattern:

```typescript
import { createClient } from '@supabase/supabase-js'
import { beforeAll, afterAll } from 'vitest'

export const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export const ctx: { userId: string } = { userId: '' }

beforeAll(async () => {
  const { data, error } = await db.auth.admin.createUser({
    email: `test+${Date.now()}@integration.test`,
    password: 'test-password-integration',
    email_confirm: true,
  })
  if (error) throw error
  ctx.userId = data.user.id
})

afterAll(async () => {
  if (ctx.userId) await db.auth.admin.deleteUser(ctx.userId)
  // ON DELETE CASCADE removes all fights + gear_sets for this user
})
```

`auth: { autoRefreshToken: false, persistSession: false }` is required for service-role clients in Node environments. `email_confirm: true` skips email confirmation. The `ctx` object is mutated by `beforeAll` before any test runs — `ctx.userId` is valid for the full test suite execution.

#### 4. npm script

**File**: `package.json`

**Intent**: Expose `npm run test:integration` for the integration test run. Leave existing `test` and `test:watch` scripts unchanged.

**Contract**: Add `"test:integration": "vitest run --config vitest.integration.config.ts"` to `scripts`. No other changes.

#### 5. Verify `@supabase/supabase-js` import

**File**: `package.json` (devDependencies, if needed)

**Intent**: `src/test/setup.integration.ts` imports `createClient` from `@supabase/supabase-js`. Confirm it resolves (likely a transitive dep of `@supabase/ssr`). If the import fails, add it explicitly.

**Contract**: If already resolvable, no change. If not: `npm install --save-dev @supabase/supabase-js` at the same major version used by `@supabase/ssr`.

### Success Criteria

#### Automated Verification

- `npm test` passes (unit tests, no Supabase running): `npm test`
- `npm run test:integration` exits cleanly with setup file loaded (requires `supabase start`): `npm run test:integration`

#### Manual Verification

- `supabase start` completes and `supabase status` shows a local URL and service-role key.
- `.env.test.local` is populated with those values.
- `npm run test:integration` output confirms Vitest loaded `src/test/setup.integration.ts` and the `beforeAll` / `afterAll` hooks ran without error.

---

## Phase 2: Risk #2 — Fight create persistence oracle

### Overview

Add `src/lib/fights.integration.test.ts` with three scenarios proving Risk #2: the fight create operation persists all fields with correct values, and DB-rejected writes surface a non-null error.

### Changes Required

#### 1. Integration test file — Risk #2 scenarios

**File**: `src/lib/fights.integration.test.ts`

**Intent**: Assert that a Supabase `.insert()` into `fights` either (a) persists all fields with the exact submitted values — proven by a separate `.select()` query, not by the insert's own return — or (b) returns `error !== null` when the DB enforces a constraint violation.

**Contract**: Three scenarios, all using `db` and `ctx` from `@/test/setup.integration`:

**Scenario A — all-fields persistence oracle:**
Seed a gear_set for `ctx.userId` (`db.from('gear_sets').insert({ user_id: ctx.userId, name: 'Test Set' }).select().single()`). Insert a fight with known literal values: `user_id: ctx.userId`, `opponent_name: "Alice"`, `weapon_category: "longsword"`, `result: "win"`, `date: "2026-06-14"`, `gear_set_id: <seeded gear_set.id>`. After insert, run a separate `db.from('fights').select('*').eq('id', fight.id).single()`. Assert each field equals the submitted literal. Assert `created_at` and `updated_at` are non-null strings. Expected values are the literals from the test setup — never derived by calling application code or snapshotting the insert return.

**Scenario B — NOT NULL violation returns `error !== null`:**
Attempt to insert a fight with `opponent_name: null` (all other required fields provided with valid values). Assert that the Supabase call returns `{ error: <non-null> }`. Assert only that `error !== null` — do not pin a specific PostgreSQL error code.

**Scenario C — FK violation on `gear_set_id` returns `error !== null`:**
Attempt to insert a fight with `gear_set_id: crypto.randomUUID()` (a UUID not present in `gear_sets`), all other fields valid. Assert `error !== null`. This proves the FK constraint fires at the DB level even when the application-level ownership check is bypassed.

### Success Criteria

#### Automated Verification

- `npm run test:integration` passes with all 3 Phase 2 scenarios green.
- `npm test` (unit) still passes unchanged.
- Typecheck passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification

- Spot-check Scenario A: open Supabase Studio (`http://127.0.0.1:54323`) during a test run paused with `test:watch`, confirm the fight row exists with `opponent_name = "Alice"` and `weapon_category = "longsword"`.
- Spot-check Scenario B: temporarily modify the insert call to omit the `if (error)` guard in application code, confirm Scenario B still passes (constraints are enforced by PostgreSQL, not the guard).

---

## Phase 3: Risk #6 — No-gear save + SET NULL on gear_set delete

### Overview

Add two tests to `src/lib/fights.integration.test.ts` proving the optional `gear_set_id` FK behaves correctly: a fight with `gear_set_id = null` saves without error; and deleting a gear_set sets `gear_set_id = null` on referencing fights without deleting those fights.

### Changes Required

#### 1. Risk #6 test scenarios

**File**: `src/lib/fights.integration.test.ts`

**Intent**: Assert the two nullable-FK behaviors confirmed in the migration but not yet proven by a running test.

**Contract**: Two additional scenarios appended to the existing file:

**Scenario D — no-gear fight saves with `gear_set_id = null`:**
Insert a fight with `gear_set_id: null` (all other required fields valid). Run a separate select query. Assert the row exists and `gear_set_id === null`. This directly challenges the "every fight must have a gear set" assumption and proves no NOT NULL violation fires.

**Scenario E — SET NULL fires on gear_set delete:**
Insert a gear_set for `ctx.userId`. Insert a fight referencing that gear_set (`gear_set_id: <new gear_set.id>`). Delete the gear_set (`db.from('gear_sets').delete().eq('id', gearSetId)`). Query the fight. Assert the fight row still exists AND its `gear_set_id === null`. This proves the `on delete set null` migration clause is active and does not cascade-delete the fight.

### Success Criteria

#### Automated Verification

- `npm run test:integration` passes with all 5 scenarios (A–E) green.
- `npm test` (unit) still passes unchanged.
- Typecheck passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification

- Spot-check Scenario E: after a full `npm run test:integration` run, confirm in Supabase Studio that the `fights` and `gear_sets` tables are empty (cascade teardown via `afterAll` cleared all test data).

---

## Phase 4: Update §6.2 cookbook

### Overview

Record the integration test pattern established by this phase so future contributors and `/10x-plan` can reuse it for Phase 3 (authorization) and beyond.

### Changes Required

#### 1. Fill in cookbook §6.2

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.2 placeholder ("TBD — see §3 Phase 2") with the concrete recipe this phase established.

**Contract**: §6.2 must name: the runner and separate config (`npm run test:integration`, `vitest.integration.config.ts`); the prerequisite (`supabase start`); test file location (`src/lib/*.integration.test.ts`); the setup file pattern (service-role client, `ctx.userId` via `auth.admin.createUser()` in `beforeAll`, cascade teardown in `afterAll`); the oracle rule (run a separate `.select()` after the operation — never trust the operation's own return value or an HTTP redirect URL); and the anti-pattern to avoid (asserting the redirect destination URL or HTTP status instead of querying the persisted DB row). Do not alter §1–§5 or the §3 status cell.

### Success Criteria

#### Automated Verification

- `test-plan.md §6.2` no longer contains "TBD — see §3 Phase 2".

#### Manual Verification

- A reader unfamiliar with the project can follow §6.2 to add a new integration test (for a new table or operation) without further questions.

---

## Testing Strategy

### Unit Tests

None added in this phase. Phase 1 unit tests (`npm test`) must still pass after all infrastructure changes.

### Integration Tests

Five scenarios in `src/lib/fights.integration.test.ts`, all run via `npm run test:integration`:
- **A**: fight create — all fields persisted with correct values (separate select oracle)
- **B**: NOT NULL violation → `error !== null`
- **C**: FK violation on non-existent `gear_set_id` → `error !== null`
- **D**: fight create with `gear_set_id = null` → row saved, `gear_set_id = null`
- **E**: gear_set delete → fight survives, `gear_set_id = null`

### Manual Testing Steps

1. `supabase start` — note the local URL and service-role key from `supabase status`.
2. Populate `.env.test.local` with those values.
3. `npm run test:integration` — all 5 tests should pass.
4. `npm test` — all unit tests should still pass (no Supabase required).
5. Verify Supabase Studio (`http://127.0.0.1:54323`) shows empty `fights` and `gear_sets` tables after the test run (cascade teardown confirmed).

## Performance Considerations

Integration tests run against a local in-memory Supabase instance. Each scenario involves at most 3 Supabase calls. Total test time should be under 5 seconds.

## Migration Notes

No schema changes. All migrations are already applied by `supabase start` / `supabase db reset`.

## References

- Research: `context/changes/testing-fight-write-path/research.md`
- Quality contract: `context/foundation/test-plan.md` (Risks #2/#6, §3 Phase 2, §6.2)
- Fights schema: `supabase/migrations/20260605000003_fights.sql`
- Gear sets schema: `supabase/migrations/20260605000002_gear_sets.sql`
- Phase 1 plan (format reference): `context/changes/testing-statistics-aggregation/plan.md`
- Phase 1 unit test reference: `src/lib/stats.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Bootstrap integration test infrastructure

#### Automated

- [x] 1.1 `npm test` passes unchanged (unit tests, no Supabase running) — c6c643e
- [x] 1.2 `npm run test:integration` runs and loads setup file (requires `supabase start`) — c6c643e

#### Manual

- [x] 1.3 `supabase start` completes; URL + service-role key available via `supabase status` — c6c643e
- [x] 1.4 `.env.test.local` populated with local credentials — c6c643e
- [x] 1.5 `npm run test:integration` output shows setup.integration.ts loaded with no hook errors — c6c643e

### Phase 2: Risk #2 — fight create persistence oracle

#### Automated

- [x] 2.1 `npm run test:integration` passes (scenarios A, B, C all green) — 5f7525d
- [x] 2.2 `npm test` (unit) still passes unchanged — 5f7525d
- [x] 2.3 Typecheck passes: `npx astro check` — 5f7525d
- [x] 2.4 Linting passes: `npm run lint` — 5f7525d

#### Manual

- [x] 2.5 Spot-check Scenario A: fight row visible in Supabase Studio with correct field values — 5f7525d
- [x] 2.6 Spot-check Scenario B/C: removing the `if (error)` guard in the handler does not make B or C pass (constraints enforced by PostgreSQL, not the guard) — 5f7525d

### Phase 3: Risk #6 — no-gear save + SET NULL

#### Automated

- [x] 3.1 `npm run test:integration` passes (all 5 scenarios A–E green) — 976b5f4
- [x] 3.2 `npm test` (unit) still passes unchanged — 976b5f4
- [x] 3.3 Typecheck passes: `npx astro check` — 976b5f4
- [x] 3.4 Linting passes: `npm run lint` — 976b5f4

#### Manual

- [x] 3.5 Supabase Studio shows empty `fights` + `gear_sets` tables after full test run (cascade teardown confirmed) — 976b5f4

### Phase 4: Update §6.2 cookbook

#### Automated

- [x] 4.1 `test-plan.md §6.2` no longer contains "TBD — see §3 Phase 2" — 1753ad0

#### Manual

- [x] 4.2 A reader can follow §6.2 to add a new integration test without further questions — 1753ad0
