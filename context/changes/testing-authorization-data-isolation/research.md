---
date: 2026-06-14T12:00:00+02:00
researcher: HubertRadom
git_commit: 16d854733d09f9ffbe54f269de7a2c5d4aa28a3a
branch: main
repository: HEMACompanion
topic: "Authorization & data isolation — integration test grounding (Phase 3, Risks #3, #4, #5)"
tags: [research, authorization, rls, middleware, integration-tests, idor, validation]
status: complete
last_updated: 2026-06-14
last_updated_by: HubertRadom
---

# Research: Authorization & Data Isolation — Grounding for Phase 3

**Date**: 2026-06-14
**Researcher**: HubertRadom
**Git Commit**: `16d854733d09f9ffbe54f269de7a2c5d4aa28a3a`
**Branch**: main
**Repository**: HEMACompanion

---

## Research Question

Ground rollout Phase 3 of `context/foundation/test-plan.md`. Verify and correct the risk response guidance for Risks #3 (IDOR), #4 (protected route exposed), and #5 (server trusts the client). For each risk: locate the real enforcement mechanism in the code, determine the cheapest test layer that gives real signal, and surface what the plan phase must know before ordering sub-phases.

---

## Summary

**Risk #3 (IDOR):** Authorization is two-layered — RLS policies (`auth.uid() = user_id`) at the database level plus `.eq("user_id", user.id)` filters in every mutating handler. The Phase 2 service-role client **bypasses RLS entirely**, so the existing integration tests do not touch this risk at all. To test IDOR, Phase 3 must create two real users, sign each in via an anon Supabase client to get JWTs, and probe User A's rows using User B's JWT. This approach requires `SUPABASE_ANON_KEY` (currently absent from the test env) but does **not** require a running Astro server. Cheapest real-signal layer: Supabase anon-client integration test (same infra as Phase 2, extended with a second user and a new env var).

**Risk #4 (Protected routes):** Protection is enforced at two independent points — the Astro middleware (`src/middleware.ts`) and every API handler individually (both call `supabase.auth.getUser()` and redirect to `/auth/signin`). Testing the middleware's 302 behavior requires HTTP requests to a running Astro server. Testing the handler-level auth check also requires HTTP. There is no path to a useful DB-layer test for this risk. Cheapest real-signal layer: `astro build` + `astro preview` child-process in global Vitest setup, then `fetch()` calls with `redirect: 'manual'`. This is new infrastructure not present in Phase 2.

**Risk #5 (Server validates independently):** Handler-level enum validation for `weapon_category` and `result` is present and correct, but the constants (`WEAPON_CATEGORIES`, `FIGHT_RESULTS`) are **inlined separately in two handler files** (`fights/index.ts` and `fights/[id].ts`) rather than shared from a module. Testing this validation also requires HTTP requests (the handlers are Astro API routes; there is no extractable pure function to unit-test without a refactor). The cheapest path that gives real signal is identical to Risk #4 — HTTP requests against a running Astro preview server. The refactor to extract constants to a shared module is minimal and would unlock unit-testable validation; the plan must decide whether to include it.

**Critical cross-cutting discovery:** Risks #4 and #5 both require an HTTP layer, which means Phase 3 must bootstrap server-based integration testing infrastructure (Astro preview + global setup) before those risks can be addressed. Risk #3 can be handled purely at the Supabase client layer (no server) once `SUPABASE_ANON_KEY` is added.

---

## Detailed Findings

### 1. Middleware — Route Protection (Risk #4)

**File**: `src/middleware.ts` (25 lines total)

The middleware runs on every request. It:

1. Creates an SSR Supabase client from cookies (`createServerClient` from `@supabase/ssr` via `src/lib/supabase.ts`).
2. Calls `supabase.auth.getUser()` and stores the result in `context.locals.user`.
3. Checks whether the URL pathname starts with any protected route.
4. If unauthenticated on a protected route → `context.redirect("/auth/signin")` (302).

**Exact matcher array** (`src/middleware.ts:4`):
```typescript
const PROTECTED_ROUTES = ["/dashboard", "/gear", "/gear-sets", "/fights", "/stats"];
```

**Exact redirect** (`src/middleware.ts:20`):
```typescript
return context.redirect("/auth/signin");
```

**Exact guard condition** (`src/middleware.ts:18-21`):
```typescript
if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }
}
```

The `.startsWith()` match means `/gear-sets/123` and `/fights/new` are both protected. Routes not in the array (e.g. `/auth/signin`, `/`, any other unrecognized path) are public.

**No secondary checks**: the middleware only checks existence of a user (`!context.locals.user`). No role checks, no permission checks.

**Astro pages do not re-check auth.** Pages read `Astro.locals.user` set by middleware and conditionally skip Supabase queries if `!user`, but they do not call `auth.getUser()` themselves. The middleware is the sole gatekeeper for page routes.

**API handlers re-check auth independently.** Every handler in `src/pages/api/` creates its own Supabase client and calls `supabase.auth.getUser()` (e.g. `src/pages/api/fights/index.ts:14-15`). This means even if the middleware were bypassed at the Astro routing level, the handler would still redirect unauthenticated requests to `/auth/signin`.

**Implication for Risk #4 testing**: the most valuable behavior to test is "an unauthenticated request to a protected route is blocked and redirected." This requires making real HTTP requests. There is no DB-layer proxy for this.

---

### 2. Supabase Client Factory (shared by middleware + all handlers)

**File**: `src/lib/supabase.ts`

```typescript
export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(requestHeaders.get("Cookie") ?? "")
          .map(({ name, value }) => ({ name, value: value ?? "" }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookies.set(name, value, options));
      },
    },
  });
}
```

This creates an **anon client** (uses `SUPABASE_KEY`, which is the anon key, loaded from `astro:env/server`). The client identifies the caller via the session cookie — Supabase's `auth.getUser()` reads the JWT from the `sb-*-auth-token` cookie and validates it with the auth server. This is the standard `@supabase/ssr` pattern.

**Packages** (`package.json`):
- `"@supabase/ssr": "^0.10.3"`
- `"@supabase/supabase-js": "^2.99.1"`

**Key implication**: RLS policies are enforced when the anon client is used (because `auth.uid()` is derived from the JWT). The service-role client used in Phase 2 (`setup.integration.ts`) **bypasses RLS** — it acts as a super-user at the DB level. This means every Phase 2 test ran with RLS turned off, which is correct for testing persistence but wrong for testing ownership.

---

### 3. RLS Policies — Full Inventory (Risk #3)

All four user-data tables have RLS enabled and full-CRUD ownership policies.

**`fights` table** (`supabase/migrations/20260605000003_fights.sql:14-27`):
```sql
alter table public.fights enable row level security;

create policy "fights_select" on public.fights
  for select using (auth.uid() = user_id);

create policy "fights_insert" on public.fights
  for insert with check (auth.uid() = user_id);

create policy "fights_update" on public.fights
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "fights_delete" on public.fights
  for delete using (auth.uid() = user_id);
```

**`gear_sets` table** (`supabase/migrations/20260605000002_gear_sets.sql:10-23`):
Same pattern: RLS enabled, SELECT/INSERT/UPDATE/DELETE all check `auth.uid() = user_id`.

**`gear_items` table** (`supabase/migrations/20260605000000_gear_items.sql:12-25`):
Same pattern.

**`gear_set_compositions` table** (`supabase/migrations/20260605000002_gear_sets.sql:38-65`):
RLS enabled. SELECT/INSERT/DELETE check ownership **indirectly** via EXISTS subquery on `gear_sets`:
```sql
create policy "gear_set_compositions_select" on public.gear_set_compositions
  for select using (
    exists (
      select 1 from public.gear_sets
      where gear_sets.id = gear_set_compositions.gear_set_id
      and gear_sets.user_id = auth.uid()
    )
  );
```
No UPDATE policy on this table (compositions are replaced via delete+insert, not updated in place).

**No SECURITY DEFINER functions.** The only function is `public.set_updated_at()` (a trigger, not DEFINER), which runs with caller permissions and cannot bypass RLS.

**No CHECK constraints** on `fights.result` or `fights.weapon_category`. Enum validation is application-only.

**Implication for Risk #3 testing**: RLS is the primary enforcement mechanism. A two-user probe using anon JWT clients will test the real protection layer. Testing with the service-role client would be meaningless for IDOR — it bypasses RLS by design.

---

### 4. Handler Ownership Checks (Secondary Layer for Risk #3)

All mutating handlers also apply `.eq("user_id", user.id)` filters **in addition to** RLS:

- **Fight UPDATE** (`src/pages/api/fights/[id].ts:67-68`): `.update({...}).eq("id", id).eq("user_id", user.id)`
- **Fight DELETE** (`src/pages/api/fights/[id]/delete.ts:20`): `.delete().eq("id", id).eq("user_id", user.id)`
- **Gear-set gear ownership check** (`src/pages/api/fights/index.ts:46-47`): before inserting a fight, verifies the referenced `gear_set_id` belongs to the current user
- **Gear UPDATE/DELETE**: same `.eq("user_id", user.id)` pattern
- **Gear-set UPDATE/DELETE**: same pattern

These filters run on the anon client, so they are **redundant with RLS** — either layer alone would block cross-user access. The handlers do not need explicit ownership checks if RLS is correctly configured, but having both adds defense in depth.

**For INSERT operations**: the handlers do not add an explicit `user_id` check on the payload — they trust `user.id` from `auth.getUser()` and pass it directly to the insert. RLS enforces `auth.uid() = user_id` on the insert's WITH CHECK clause, preventing a crafted payload from inserting with a different `user_id`.

**Implication**: RLS would be sufficient; the handler-level `.eq("user_id", user.id)` is a second safety net. The test plan must verify both layers work, but the **cheapest test** focuses on the RLS layer (anon JWT client) since that is what the application relies on in production.

---

### 5. Server-Side Validation (Risk #5)

**Fights handlers** (`src/pages/api/fights/index.ts:4-5` and `src/pages/api/fights/[id].ts:4-5`):
```typescript
const WEAPON_CATEGORIES = ["longsword", "sabre", "rapier", "other"] as const;
const FIGHT_RESULTS = ["win", "loss", "draw"] as const;
```

**Validation logic** (`src/pages/api/fights/index.ts:27-41`):
```typescript
if (!opponent_name) {
  return context.redirect(`...?error=${encodeURIComponent("Opponent name is required")}`);
}
if (!WEAPON_CATEGORIES.includes(weapon_category as (typeof WEAPON_CATEGORIES)[number])) {
  return context.redirect(`...?error=${encodeURIComponent("Invalid weapon category")}`);
}
if (!FIGHT_RESULTS.includes(result as (typeof FIGHT_RESULTS)[number])) {
  return context.redirect(`...?error=${encodeURIComponent("Invalid result")}`);
}
if (!date) {
  return context.redirect(`...?error=${encodeURIComponent("Date is required")}`);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  return context.redirect(`...?error=${encodeURIComponent("Invalid date format")}`);
}
```

Identical constants and logic exist in `src/pages/api/fights/[id].ts` (the update handler) — the constants are **duplicated**, not shared. This is a duplication risk: a future change to valid weapon categories must be made in two places.

**Gear handlers** (`src/pages/api/gear/index.ts:3-4`, `[id].ts:3-4`):
```typescript
import { GEAR_CATEGORIES } from "@/lib/gear-categories";
```
Gear uses a shared module (`src/lib/gear-categories.ts`). Fights does not — the validation is entirely handler-local.

**No DB CHECK constraints** on `fights.result` or `fights.weapon_category` (confirmed by migration scan). If a request bypasses the handler (e.g. a raw Supabase insert with the service-role key), any string is accepted for these columns.

**The validation redirect pattern**: bad enum → `context.redirect("[form-url]?error=Invalid weapon category")` (302). The fight create handler redirects to the fight creation form; the update handler redirects to the edit form. The redirect URL contains `?error=` in the query string, which the page then renders (see lessons.md — this is the phishing-vector pattern, but it is out of scope for Phase 3).

**Implication for Risk #5 testing**: there is no pure function to test — the validation lives inside Astro API route handlers. Testing it requires HTTP POST requests that are processed by the handler and return 302 redirects. This means a running Astro server is required for Risk #5 tests.

**Optional refactor**: extracting `WEAPON_CATEGORIES` and `FIGHT_RESULTS` from the two handler files into `src/lib/fight-validation.ts` (mirroring the `gear-categories.ts` pattern) would:
1. Eliminate the duplication
2. Make the validation constants testable as a unit test (cheapest layer for the "constants are correct" property)
3. Not require a running server for the unit test

The plan must decide whether to include this refactor. The signal for the "handler calls the validation" property still requires HTTP.

---

### 6. Infrastructure Available for Phase 3

**From Phase 2** (`src/test/setup.integration.ts`):
- Service-role Supabase client: `export const db` (bypasses RLS)
- Shared context: `export const ctx: { userId: string }` (single user)
- `beforeAll`: creates one real auth user via `db.auth.admin.createUser()`
- `afterAll`: deletes user via `db.auth.admin.deleteUser()`, cascades all data

**What Phase 3 needs additionally**:

1. **`SUPABASE_ANON_KEY`** in `.env.test.local` and `.env.test.local.example`. The anon key is required to create user-authenticated Supabase clients that respect RLS. It is distinct from the service-role key. `supabase status` exposes it as `anon key`. Currently absent from the test env entirely.

2. **Two-user context** for IDOR tests. The existing `ctx` holds one `userId`. Phase 3 needs `ctx.userAId` and `ctx.userBId` (or a separate second user created within the IDOR test itself). Two approaches:
   - **Extend `setup.integration.ts`**: add a `userBId` to `ctx`, create a second user in `beforeAll`, delete in `afterAll` (clean and shared across the test suite).
   - **Create second user per-test**: more isolated but adds per-test latency and cleanup complexity.
   The shared approach is recommended given the cascade-teardown model already in place.

3. **Anon JWT client factory**. Pattern for RLS-enforced testing:
   ```typescript
   // Sign in userA via anon client to get their JWT
   const anonBase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!,
     { auth: { autoRefreshToken: false, persistSession: false } })
   const { data: { session } } = await anonBase.auth.signInWithPassword({
     email: 'test+userA@integration.test',
     password: 'test-password-integration'
   })
   // Authenticated client for userA — respects RLS
   const clientA = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
     global: { headers: { Authorization: `Bearer ${session!.access_token}` } },
     auth: { autoRefreshToken: false, persistSession: false }
   })
   ```

4. **Astro preview server** for Risks #4 and #5. These risks cannot be tested at the Supabase client layer; they require HTTP requests to Astro API routes. Options:
   - **Vitest global setup** (`vitest.globalSetup.ts`): run `astro build` then spawn `astro preview --port 4322` as a child process; wait for the server to be ready; expose the base URL to tests; kill in global teardown.
   - **`vitest.integration.config.ts`** can reference a `globalSetup` file that handles this.
   - Tests then use `fetch('http://localhost:4322/api/fights', { method: 'POST', redirect: 'manual', ... })`.
   - **Alternative**: defer Risks #4/#5 to Phase 4 (e2e with Playwright). The plan should choose.

---

## Oracle Definition Decisions

These ground the expected values for Phase 3 tests. They are derived from PRD, migrations, and confirmed code — not from running the code under test.

| Risk | Test | Expected behavior (oracle source) |
|------|------|-----------------------------------|
| #3 | UserB tries to SELECT UserA's fight row by known ID via anon JWT client | Result set is empty (0 rows); no error (RLS silently filters, not 403). Source: Supabase RLS behavior — a SELECT policy violation returns empty result, not an error, because the row is invisible. |
| #3 | UserB tries to UPDATE UserA's fight via anon JWT client | `{ count: 0, error: null }` — update matched 0 rows (RLS USING clause blocked it). Source: Supabase RLS behavior for UPDATE. |
| #3 | UserB tries to DELETE UserA's fight via anon JWT client | `{ count: 0, error: null }` — 0 rows deleted. Source: Supabase RLS behavior for DELETE. |
| #4 | `fetch('GET /fights')` with no auth cookie | HTTP 302, `Location: /auth/signin`. Source: `src/middleware.ts:20`. |
| #4 | `fetch('POST /api/fights')` with no auth cookie | HTTP 302, `Location: /auth/signin`. Source: `src/pages/api/fights/index.ts:14-15`. |
| #5 | `fetch('POST /api/fights')` with `weapon_category: "axe"` (invalid) and valid auth | HTTP 302, `Location` header contains `?error=Invalid%20weapon%20category`. Source: `src/pages/api/fights/index.ts:30-32`. |
| #5 | `fetch('POST /api/fights')` with `result: "tie"` (invalid) and valid auth | HTTP 302, `Location` header contains `?error=Invalid%20result`. Source: `src/pages/api/fights/index.ts:33-34`. |

**RLS SELECT behavior note**: when an RLS SELECT policy blocks a row, Supabase returns an empty result (no error), not a 403. The test for IDOR on SELECT must therefore assert `data === null` or `data.length === 0`, not `error !== null`. This is the **must-challenge assumption** from the risk map: "logged-in ⇒ authorized for this specific row" — the counter-proof is that the row simply vanishes from the result set.

---

## Risk Response Guidance — Corrections and Confirmations

### Risk #3 — IDOR

**Original guidance**: "Test with two distinct users; avoid testing with a single user or trusting RLS without a second-user probe."

**Confirmed**: correct. The mechanism to verify: RLS SELECT policy returns empty results, not an error. UPDATE/DELETE policies result in 0 rows affected.

**Correction to context needed**: the test plan said "whether ownership is enforced by RLS, handler code, or both." **Answer: both.** RLS is the primary layer; `.eq("user_id", user.id)` in handlers is a secondary redundant filter. Phase 3 tests should target RLS (anon JWT client) because that is the layer that protects Supabase API access even outside the Astro handler.

**Correction to test layer**: the plan said "integration (two distinct users)." Confirmed, but add: **no running server needed** for the RLS probe; the anon JWT client approach tests RLS directly. A server is only needed if testing the handler-level `.eq()` redundancy (low value, not recommended for Phase 3).

**New requirement**: `SUPABASE_ANON_KEY` must be added to `.env.test.local` and `.env.test.local.example`.

### Risk #4 — Protected routes

**Original guidance**: "Avoid testing only the login page, not the protected data surface."

**Confirmed**: correct. The middleware protects all five prefixes; the handlers also check auth independently.

**New finding**: testing this risk requires an HTTP layer. The cheapest option is a Vitest global setup that spawns `astro preview`. An alternative is to defer this to Phase 4 (e2e) if the infrastructure cost is too high for Phase 3.

**Correction to test layer**: "integration (middleware)" is correct in spirit, but "middleware" here means HTTP requests, not DB-layer operations. Rename the framing to "HTTP integration (fetch against Astro preview)" to avoid ambiguity.

### Risk #5 — Server trusts the client

**Original guidance**: "The server rejects a bad result enum / weapon category / missing field even when the client is bypassed; avoid driving validation only through the UI form."

**Confirmed**: the validation is present and correct. `WEAPON_CATEGORIES.includes()` and `FIGHT_RESULTS.includes()` are called before the Supabase insert.

**New finding**: the constants are duplicated in two handler files (create and update). The cheapest test with real signal is HTTP POST with an invalid enum to both endpoints (create and update), asserting the redirect URL contains `?error=Invalid%20weapon%20category`. This requires the same Astro preview server as Risk #4.

**Optional path**: extract constants to `src/lib/fight-validation.ts` → unit-test the validation module. This is cheaper to run but does not prove the handler calls the validation. Recommend: do the unit test on the extracted module AND add one HTTP integration test to prove the handler wires it up.

---

## Architecture Insights

1. **Two-tier authorization is the production model.** RLS (DB layer) + handler filters (app layer) together. Testing only the handler layer (service-role bypasses RLS) would miss the actual production enforcement mechanism.

2. **The service-role client is a test artefact, not a production path.** Production always uses the anon/SSR client. Phase 2 tests proved DB schema behavior using service-role; Phase 3 must prove authorization behavior using the same client type as production (anon, JWT-identified).

3. **All API responses are HTTP 302 redirects.** No JSON APIs exist. This means HTTP-level tests must use `redirect: 'manual'` to capture the redirect without following it, and assertions are on `response.status === 302` and `response.headers.get('location')`.

4. **Session is cookie-based.** Testing handlers via HTTP requires a valid session cookie in the `Cookie` header. The simplest way to get one: sign in via the anon client, extract the `set-cookie` header from the sign-in response, and include it in subsequent requests.

5. **The `?error=` URL param is Astro auto-escaped** (no XSS), but is a social-engineering vector (see `context/foundation/lessons.md`). Out of scope for Phase 3, but the tests will encounter these redirect URLs and should not over-specify their exact format (just assert the `?error=` param is present and non-empty with the expected keyword).

---

## Historical Context

- `context/changes/testing-statistics-aggregation/` (Phase 1): bootstrapped Vitest unit infra. No integration test pattern.
- `context/changes/testing-fight-write-path/` (Phase 2): established the Vitest integration config, service-role client setup, and cascade teardown pattern. Phase 3 inherits this infra and extends it.
- `context/foundation/lessons.md`: `?error=` URL param phishing vector — relevant to understanding error redirect behavior but not to the test assertions.

---

## Open Questions for the Plan Phase

1. **Risks #4 and #5 infrastructure cost**: Should Phase 3 bootstrap a running Astro preview server (new global setup infra) for HTTP-level tests, or defer Risks #4/#5 to Phase 4 (e2e with Playwright) and keep Phase 3 purely at the Supabase client layer?

   **Recommendation**: Bootstrap the preview server in Phase 3 for Risks #4/#5. The infrastructure is modest (shell out to `astro build && astro preview`, kill on teardown) and keeps Phase 3 self-contained. Deferring pushes risk into Phase 4 which already has scope (full e2e critical path).

2. **Fight validation refactor**: Should Phase 3 extract `WEAPON_CATEGORIES` and `FIGHT_RESULTS` from the two handler files into `src/lib/fight-validation.ts`? The refactor is ~10 lines and eliminates duplication. The plan should order this as Phase 3's first sub-phase (before writing tests that reference those constants) so that the unit test and the HTTP integration test both reference the same source of truth.

   **Recommendation**: yes, include the extraction. It mirrors the existing `gear-categories.ts` pattern, removes duplication, and makes the validation unit-testable.

3. **Two-user setup placement**: Should `userB` be created in the shared `setup.integration.ts` (available to the full suite) or only in the authorization test file (local to Phase 3)? Given that `afterAll` in `setup.integration.ts` deletes `userA` and relies on cascade, adding `userB` to the same `beforeAll/afterAll` is the cleanest approach.

   **Recommendation**: extend `setup.integration.ts` with `ctx.userBId` — parallel to `ctx.userId` (which represents userA).

4. **RLS SELECT probe oracle**: when UserB's RLS SELECT policy blocks UserA's row, Supabase returns `{ data: null, error: { code: 'PGRST116' } }` (row not found via `.single()`) or `{ data: [], error: null }` (empty array via `.select()`). The test must use `.maybeSingle()` to avoid treating "not found" as an error, or use `.select()` and assert empty array. The plan should standardize on one form.

   **Recommendation**: use `.select('*').eq('id', fightId)` (not `.single()`) and assert `data.length === 0`. This avoids the `PGRST116` ambiguity and mirrors the "invisible row" mental model of RLS SELECT policies.

---

## Code References

- `src/middleware.ts` — full middleware, route protection, redirect logic
- `src/lib/supabase.ts` — `createClient()` factory; uses `createServerClient` from `@supabase/ssr`
- `src/pages/api/fights/index.ts` — fight create handler: auth check, enum validation, ownership (gear_set)
- `src/pages/api/fights/[id].ts` — fight update handler: auth check, enum validation, `.eq("user_id", user.id)`
- `src/pages/api/fights/[id]/delete.ts` — fight delete handler: auth check, `.eq("user_id", user.id)`
- `src/pages/api/gear/index.ts`, `[id].ts`, `[id]/delete.ts` — gear item handlers (same auth pattern)
- `src/pages/api/gear-sets/index.ts`, `[id].ts`, `[id]/delete.ts` — gear set handlers (same auth pattern)
- `src/lib/gear-categories.ts` — shared `GEAR_CATEGORIES` module (reference for fight-validation refactor)
- `supabase/migrations/20260605000003_fights.sql:14-27` — RLS enable + full CRUD policies on `fights`
- `supabase/migrations/20260605000002_gear_sets.sql:10-23` — RLS enable + full CRUD policies on `gear_sets`
- `supabase/migrations/20260605000002_gear_sets.sql:38-65` — RLS on `gear_set_compositions` (indirect ownership)
- `supabase/migrations/20260605000000_gear_items.sql:12-25` — RLS enable + full CRUD policies on `gear_items`
- `src/test/setup.integration.ts` — Phase 2 integration setup (service-role client, single user, cascade teardown)
- `src/lib/fights.integration.test.ts` — Phase 2 integration tests (reference for Phase 3 test structure)
- `vitest.integration.config.ts` — integration Vitest config (will need `globalSetup` added for server)
- `.env.test.local.example` — must add `SUPABASE_ANON_KEY` placeholder
