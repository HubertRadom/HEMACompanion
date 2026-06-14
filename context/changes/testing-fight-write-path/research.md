---
date: 2026-06-14T00:00:00+02:00
researcher: Claude (Sonnet 4.6)
git_commit: 13adac32442d5981f93dcbc1f897c9d6f686dccf
branch: main
repository: HEMACompanion
topic: "Fight write-path integrity — grounding Risks #2 and #6 (Phase 2 of test rollout)"
tags: [research, codebase, fights, write-path, integration-tests, supabase, gear-sets]
status: complete
last_updated: 2026-06-14
last_updated_by: Claude (Sonnet 4.6)
---

# Research: Fight write-path integrity — Risks #2 and #6

**Date**: 2026-06-14T00:00:00+02:00
**Researcher**: Claude (Sonnet 4.6)
**Git Commit**: 13adac32442d5981f93dcbc1f897c9d6f686dccf
**Branch**: main
**Repository**: HEMACompanion

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md`.

Risks to verify:
- **Risk #2** — Silent fight-save failure: a write returns "success" to the UI but the fight never persisted, or persisted partially.
- **Risk #6** — No-gear fight cannot save / FK mishandled: the optional gear-set association is wired as required, or deleting a gear set orphans or breaks the fights that reference it.

Grounding targets: the write entry point, how DB rejection is translated to a caller-visible error, the gear_set_id FK nullability and ON DELETE rule, the cheapest useful test layer, and what integration test infrastructure Phase 2 must bootstrap.

## Summary

### Architecture finding that reframes the test approach

All fight API handlers are **Astro form handlers that return HTTP 302 redirects**, never JSON. There is no HTTP 200 on success, and no HTTP 4xx/5xx on error. Every response — success or failure — is a redirect. This makes the test plan's "not a 200" phrasing for Risk #2's oracle obsolete.

**Correct oracle statement:** "After a successful save, the fight row exists in the DB with all expected fields. A DB-rejected write redirects to the form page with `?error=` in the URL — not to `/fights`." The redirect destination URL, not the HTTP status code, is the HTTP-level signal.

### Cheapest test layer verdict

**Direct Supabase integration tests using Vitest (node environment) + local Supabase CLI.** No running Astro server needed. This:
- Tests actual DB constraints (NOT NULL, FK enforcement, SET NULL) — the real Risk #2/#6 surface
- Verifies persisted row field values (the anti-pattern-proof oracle)
- Runs within the existing Vitest config without adding HTTP testing infrastructure
- Is cheaper than HTTP handler testing while giving equivalent signal for these two risks

The handlers do not need HTTP-level integration tests for Risk #2/#6 because: (a) all handlers already check `if (error)` — no silent swallow path exists in the code; (b) the DB-layer tests directly verify what happens when Supabase rejects a write; (c) the handler's input validation logic (enum checks, date format) is a separate unit-testable concern that belongs to Risk #5, not Risk #2.

### Risk #6 confirmed, oracle fully grounded

`gear_set_id` is **nullable** and `ON DELETE SET NULL` — confirmed in migration. A fight with no gear set inserts cleanly (no NOT NULL violation). Deleting a gear set leaves all referencing fights intact with `gear_set_id = null`. Both cases are directly testable at the DB layer.

---

## Detailed Findings

### Write entry points

Three handler files own all fight mutations:

| File | Method | Operation |
|------|--------|-----------|
| `src/pages/api/fights/index.ts` | POST | Create fight (`.insert()`) |
| `src/pages/api/fights/[id].ts` | POST | Update fight (`.update().select().maybeSingle()`) |
| `src/pages/api/fights/[id]/delete.ts` | POST | Delete fight (`.delete()`) |

All three accept `formData()` (HTML form POST), not JSON request bodies.

#### Create handler: `src/pages/api/fights/index.ts`

**Validation sequence (lines 20–52):**
1. `opponent_name`: required, trimmed.
2. `weapon_category`: must be in `["longsword","sabre","rapier","other"]` (lines 30–32).
3. `result`: must be in `["win","loss","draw"]` (lines 33–35).
4. `date`: required, must match `YYYY-MM-DD` regex (lines 36–41).
5. `gear_set_id`: optional. If provided, queries `gear_sets` with `.eq("id", gearSetId).eq("user_id", user.id).maybeSingle()` to verify ownership (lines 42–52). A non-existent or other-user gear set is caught here, before the insert.

**Insert (lines 54–61):**
```
await supabase.from("fights").insert({
  user_id: user.id,
  opponent_name,
  weapon_category,
  result,
  date,
  gear_set_id: gearSetId ?? null,
})
```
No `.select()` after insert — only `{ error }` is destructured.

**Response (lines 63–67):**
- `if (error)` → 302 redirect to `/fights/add?error=<encoded message>` (line 64).
- Success → 302 redirect to `/fights` (line 67). No body, no row data returned to caller.

#### Update handler: `src/pages/api/fights/[id].ts`

Same validation as create (lines 20–55), plus the fight id from URL params.

**Update (lines 57–70):**
```
await supabase.from("fights")
  .update({ opponent_name, weapon_category, result, date,
             gear_set_id: gearSetId ?? null,
             updated_at: new Date().toISOString() })
  .eq("id", id)
  .eq("user_id", user.id)
  .select("id").maybeSingle()
```
Chains `.select("id").maybeSingle()` after the update and checks **both** `if (updateError)` (line 72) **and** `if (!updatedFight)` (line 75: "Fight not found" redirect). Fully covered against silent no-op updates.

**Response (lines 72–79):**
- DB error → 302 to `/fights/${id}/edit?error=<encoded>`.
- `updatedFight === null` (no matching row, or RLS filtered) → 302 to `/fights/${id}/edit?error=Fight+not+found`.
- Success → 302 to `/fights`.

#### Delete handler: `src/pages/api/fights/[id]/delete.ts`

**Delete (line 20):**
```
await supabase.from("fights").delete().eq("id", id).eq("user_id", user.id)
```
Checks `if (error)` (line 22). No `.returning()` / `.select()` — does not verify a row was actually deleted (same pattern as gear-item update; gap exists but is not in scope for Risk #2/#6).

**Response (lines 22–26):**
- DB error → 302 to `/fights?error=<encoded>`.
- Success → 302 to `/fights`.

---

### DB Schema

#### fights table — `supabase/migrations/20260605000003_fights.sql`

```sql
create table public.fights (
  id           uuid        not null default gen_random_uuid() primary key,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  opponent_name text       not null,
  weapon_category text     not null,
  result       text        not null,
  date         date        not null,
  gear_set_id  uuid        references public.gear_sets(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
```

Key constraints for the test plan:

| Column | Nullable | Constraint | ON DELETE |
|--------|----------|------------|-----------|
| `user_id` | NOT NULL | FK → auth.users | CASCADE |
| `opponent_name` | NOT NULL | — | — |
| `weapon_category` | NOT NULL | — (no CHECK enum) | — |
| `result` | NOT NULL | — (no CHECK enum) | — |
| `date` | NOT NULL | — | — |
| `gear_set_id` | **NULLABLE** | FK → gear_sets | **SET NULL** |

**No CHECK constraints** on `result` or `weapon_category` — the DB accepts any non-null string. Enum enforcement lives only in the handler.

**RLS** (lines 16–27): SELECT / INSERT / UPDATE / DELETE all gated on `auth.uid() = user_id`. RLS is always active — the client is anon SSR.

**Trigger** (lines 29–31): `handle_updated_at` (BEFORE UPDATE) calls `public.set_updated_at()` — updates `updated_at` automatically on any UPDATE.

#### gear_sets table — `supabase/migrations/20260605000002_gear_sets.sql`

```sql
create table public.gear_sets (
  id         uuid        not null default gen_random_uuid() primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  name       text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

RLS: all 4 ops gated on `auth.uid() = user_id`.

#### gear_set_compositions table — same file as gear_sets (lines 30–36)

```sql
create table public.gear_set_compositions (
  id           uuid not null default gen_random_uuid() primary key,
  gear_set_id  uuid not null references public.gear_sets(id) on delete cascade,
  gear_item_id uuid not null references public.gear_items(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (gear_set_id, gear_item_id)
);
```

`gear_set_id` here is **NOT NULL, ON DELETE CASCADE** (compositions are deleted when their parent set is deleted). The cascade behavior for compositions is a separate concern from the fights→gear_sets relationship (which is SET NULL). Both are correctly modelled.

---

### Error translation: the redirect architecture

**The project-wide pattern across all 9 mutation API routes:**
1. Null-client guard → redirect to `/auth/signin?error=Supabase+is+not+configured`
2. `getUser()` auth guard → redirect to `/auth/signin`
3. Supabase operation
4. `if (error) { return redirect(<origin-page>?error=<encoded>) }`
5. Success → `return redirect(<list-page>)`

**No route returns HTTP 200 for mutations.** No route swallows a Supabase error and redirects to the success URL. The `if (error)` check fires before the success redirect on every handler.

**Consequence for Risk #2's oracle:**  The test plan states "a DB-rejected write surfaces an error, not a 200." In this codebase, the correct statement is: "a DB-rejected write from Supabase (i.e. `error !== null`) causes the handler to redirect to the form page with `?error=` in the URL — not to `/fights`." The oracle at the Supabase level is `error !== null` from the `.insert()` call; the oracle at the HTTP level is the redirect destination URL containing `?error=`.

---

### Supabase client type and RLS implications

`src/lib/supabase.ts` creates a **server-side SSR client using the anon key** (`SUPABASE_KEY`) via `createServerClient` from `@supabase/ssr`. There is no service-role bypass anywhere in the application.

**Integration test implication:** Tests that call Supabase operations as a user must either:
- Authenticate a real test user (via `supabase.auth.admin.createUser()` with the service-role client) and obtain a JWT to initialize an anon client
- OR use the **service-role key directly** to seed and read data, bypassing RLS, while using the anon client (with a seeded session) for the operations under test

The service-role key is the correct tool for test setup and teardown (insert fixture rows, delete them after the test). The anon client authenticated as the test user is the correct tool for the operations under test (the actual insert/update calls), because RLS must be active for the test to prove ownership checks work.

---

### Integration test infrastructure: current state and what Phase 2 must add

**Current state (from Phase 1):**
- Vitest `4.1.8` in node environment, `@/` → `./src/` alias
- `npm test` / `npm run test:watch` scripts
- One test file: `src/lib/stats.test.ts` (unit, no DB)
- No `.env.test`, no `vitest.setup.ts`, no test DB harness, no Supabase mock

**What Phase 2 must add:**

| Need | Recommended approach |
|------|---------------------|
| Real DB for integration tests | `supabase start` (local Supabase CLI — already in devDependencies) applies migrations; `supabase db reset` restores clean state |
| Service-role key for seeding | `SUPABASE_SERVICE_ROLE_KEY` in `.env.test.local` (gitignored); local Supabase CLI exposes it via `supabase status` |
| Test user creation / teardown | `supabase.auth.admin.createUser()` / `.deleteUser()` via service-role client in `vitest.setup.ts` |
| Isolation per test | `afterEach` deletes rows inserted during the test (by id) via service-role client; or use a fresh test user per `describe` block |
| Integration test file location | `src/lib/fights.integration.test.ts` — matches Phase 1 naming convention; distinguished from unit tests by `.integration.test.ts` suffix |
| Vitest config change | Add `exclude` or second `include` pattern for integration tests if they should run separately from `npm test` (unit); or keep them in the same run and accept the added time |

**The local Supabase CLI** (`supabase` already in devDependencies per `supabase/` folder and agent 3 findings) is the correct tool — it applies the project's actual migrations, meaning FK constraints, triggers, and RLS policies are identical to production. This is the key property that makes the tests non-lying (no mock can correctly simulate `ON DELETE SET NULL` or NOT NULL constraint violations).

---

### Partial-write risk assessment

**Fight create** (`src/pages/api/fights/index.ts`): **Single `.insert()` call.** Atomically safe. Either the row is inserted or the error is returned. No partial-write risk.

**Fight update** (`src/pages/api/fights/[id].ts`): **Single `.update()` call.** Atomically safe. The `updated_at` is set explicitly in the same call.

**Fight delete** (`src/pages/api/fights/[id]/delete.ts`): **Single `.delete()` call.** Atomically safe.

**Not in scope for Risk #2/#6** but noted for completeness: the gear-set *create* path has a partial-write risk (two sequential writes: gear_sets insert then gear_set_compositions insert, with a compensating manual delete if the second fails). This is a separate concern belonging to a future phase or a standalone hardening change, not Phase 2.

---

### Handler validation gap: a finding beyond the risks in scope

The update fight handler (`[id].ts`) sets `updated_at: new Date().toISOString()` explicitly (line 65). However, the DB trigger `handle_updated_at` (BEFORE UPDATE, `public.set_updated_at()`) would also set `updated_at` automatically. The explicit `updated_at` in the handler likely overrides the trigger — but both converge on the same value. No functional impact; just redundancy.

The gear-item update handler does NOT chain `.select().maybeSingle()` after its `.update()`, meaning a 0-row-matched update (wrong owner, RLS silently filtered) returns the success redirect. This is a gap in the gear-item update path but is **not in scope for Phase 2** (gear items are not fights).

---

## Oracle-Definition Decisions

### Risk #2 — Fight-save persistence

1. **All fields must be persisted.** After a successful create with `{ opponent_name: "Alice", weapon_category: "longsword", result: "win", date: "2026-06-14", gear_set_id: <uuid> }`, a service-role query of the fights table must return exactly one row with all five fields matching. **Do not assert only that the row exists** — assert the field values. The oracle is the submitted values, not whatever the DB returns.

2. **No-gear fight must also persist all fields.** When `gear_set_id` is omitted, the row must have `gear_set_id = null` — not an error, not a missing row.

3. **DB-rejected write must surface as `error !== null`.** When Supabase returns a non-null error from `.insert()` (e.g., FK violation from a non-existent `gear_set_id` bypassed at the handler level, or a NOT NULL constraint violation), the error object must be non-null. **The oracle for this case at the DB layer is the `error` property of the Supabase response, not an HTTP status code.** At the HTTP handler layer, the oracle is the redirect destination URL containing `?error=`.

4. **`result` and `weapon_category` are NOT enforced at the DB level.** A direct insert of `result: "foobar"` succeeds at the DB. The handler's enum check is the only enforcement. Tests for enum validation belong to Risk #5, not Risk #2.

### Risk #6 — Optional gear_set_id and SET NULL deletion

1. **Nullable FK confirmed.** `gear_set_id uuid references public.gear_sets(id) on delete set null` — nullable, no NOT NULL constraint. A fight inserted with `gear_set_id: null` must succeed.

2. **SET NULL confirmed.** When a gear_set row is deleted, all referencing fights must have `gear_set_id = null` afterward, and the fight rows must still exist. Oracle: after `DELETE FROM gear_sets WHERE id = <set_id>`, query `SELECT id, gear_set_id FROM fights WHERE id = <fight_id>` → row exists, `gear_set_id = null`.

3. **Challenge the assumption "every fight has a gear set."** The create form may include a gear-set selector. The integration test must insert a fight with an explicit null gear_set_id (no gear selected) and verify it saves. If the DB raises a NOT NULL violation, the oracle prediction is wrong — but the migration confirms it won't.

4. **compositions cascade separately.** When a gear_set is deleted, its `gear_set_compositions` rows CASCADE-delete. The fights that referenced the gear_set get SET NULL on `gear_set_id`. These are independent FK behaviors; the test must verify the fight row behavior, not the compositions behavior.

---

## Architecture Insights

### Form handler pattern: every response is a redirect

The project uses traditional HTML form submission with Astro action handlers. There are no JSON API endpoints for fight CRUD. All mutation handlers:
- Accept `multipart/form-data` (HTML form POST)
- Return HTTP 302 redirect (never 200 with body)
- Signal errors via `?error=<encoded>` query param on the redirect destination

This means:
1. **HTTP status code testing is useless** — success and error both return 302.
2. **Testing at the HTTP layer** requires following redirects and parsing the destination URL or querying the DB after the redirect.
3. **DB-layer integration testing bypasses the HTTP complexity** while testing the same DB behavior (the constraints and persistence that Risk #2/#6 actually describe).

### anon SSR client + RLS = tests must authenticate

All API routes use the anon key with RLS active. Integration tests that call Supabase operations (not HTTP handlers) must authenticate as a test user — either via a real JWT obtained from `auth.admin.createUser()`, or by using the service-role key for the operations under test and bypassing RLS (simpler but slightly less representative).

Recommendation: use the **service-role key for test setup/teardown and for verifying persisted DB state**, and use the **anon client with a seeded test user's session for the operations under test** (the actual `.insert()` / `.update()` / `.delete()` that the handler performs). This mirrors the production code path while keeping setup manageable.

### No partial-write risk on the fight path

Unlike the gear-set path (two sequential writes + compensating delete), all fight mutations are **single Supabase operations**. There is no sequence to fail mid-way, no rollback to simulate. Phase 2 does not need hermetic stub tests for partial-failure branches on the fight path — that concern is specific to gear sets (outside Phase 2's scope).

---

## Response-Guidance Correction (backport candidate for test-plan §2)

The test plan's Risk Response Guidance for Risk #2 currently states:

> "What would prove protection: After a 'successful' save the row is actually present in the DB with all fields; **a DB-rejected write surfaces an error, not a 200**."

Research finding: no handler in this codebase returns HTTP 200 for mutations. The correct formulation is:

> "A DB-rejected write from Supabase (`error !== null`) causes the handler to redirect to the form page with `?error=` in the URL — **not to `/fights`**. At the DB-test layer, the oracle is `error !== null` from the Supabase client response."

This is a Source/guidance correction, not an anchor addition. It should be backported to §2 Risk Response Guidance before planning begins.

---

## Historical Context (from prior changes)

- `context/changes/sparring-log-crud/plan.md` (S-03) — specced fight create as a single `.insert()` (line 138), fight update as a single `.update()` (line 146). No partial-write risk was identified or mitigated because none exists. Confirmed: the single-operation pattern is intentional.
- `context/changes/sparring-log-crud/reviews/impl-review.md` — post-impl review surfaced:
  - F1: gear_set_id ownership not verified before fight insert/update (FIXED — handler now queries gear_sets to verify ownership before inserting).
  - F2: date not validated for YYYY-MM-DD format before DB write (FIXED).
  - F3: reflected `?error=` param — social-engineering vector (also documented in `context/foundation/lessons.md`).
- `context/changes/gear-set-crud/plan.md` (S-02) — the upsert-then-delete ordering for gear-set composition replacement was deliberate; partial-write risk was acknowledged and accepted. Confirmed: fight write does not have this complication.
- `context/changes/testing-statistics-aggregation/research.md` (Phase 1) — already noted `on delete set null` at line :119 and flagged it as a Phase 2/#6 concern. Confirmed.

---

## Recommended plan structure for /10x-plan

The following sub-phase ordering emerges from research:

1. **Bootstrap integration test infrastructure**: local Supabase setup (`supabase start`), `.env.test.local` with local URL + keys, `vitest.setup.ts` with service-role client for seed/teardown, confirm `npm test` still passes unit tests.

2. **Risk #2 — persistence oracle tests**: insert fight with all fields (full oracle), insert fight with `gear_set_id = null` (no-gear case), query back and assert all field values. Also: attempt insert that triggers a NOT NULL constraint (e.g. pass `null` for `opponent_name` directly via service-role client, bypassing handler validation) — verify `error !== null`.

3. **Risk #6 — FK behavior tests**: insert fight with gear_set, delete the gear_set, verify fight still exists with `gear_set_id = null`. Insert fight with `gear_set_id = null`, verify it succeeds and gear_set_id remains null.

4. **Update §6.2 cookbook**: document integration test location, pattern (service-role for setup, anon client for operation, service-role for verification), run command (distinguish from unit tests if needed).

---

## Open Questions

1. **Single Vitest run vs. separate integration test run.** Should `npm test` run unit + integration together, or should integration tests be separated (e.g., `npm run test:integration` with a different include pattern)? Integration tests require `supabase start` to be running; mixing them into the default run risks failing in CI without local Supabase. The plan should pick.

2. **Test user isolation strategy.** Create one shared test user per `describe` block and clean up rows via `afterEach`? Or create a fresh test user per test and delete the user after? The former is simpler; the latter is fully isolated but slower.

3. **Service-role key exposure in .env.test.local.** Local Supabase exposes a well-known service-role key (same across all projects using `supabase start`). The plan should confirm this is acceptable or use a `.env.test.local` gitignore approach.

4. **Does the create handler pass `gear_set_id: null` or omit the field when no gear set is selected?** Agent findings suggest `gear_set_id: gearSetId ?? null` is used. Needs confirmation by reading line 56–60 of `src/pages/api/fights/index.ts` during implementation.
