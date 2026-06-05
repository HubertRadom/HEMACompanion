<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Gear Item CRUD

- **Plan**: context/changes/gear-item-crud/plan.md
- **Scope**: All Phases (1–4 of 4)
- **Date**: 2026-06-05
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical | 6 warnings | 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Automated Verification

| Check | Result |
|-------|--------|
| `npx astro check` | PASS (0 errors, 0 warnings, 4 hints) |
| `npm run lint` | PASS after adding `"endOfLine": "auto"` to .prettierrc.json |
| `npm run build` | PASS per progress marks (not re-run in review) |

## Findings

### F1 — Page-level queries relied on RLS alone; no explicit user scoping

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/pages/gear/index.astro, src/pages/gear/[id]/edit.astro
- **Detail**: Both Astro page frontmatters queried gear_items without explicit user scoping. API routes call getUser() explicitly; pages did not. Safe with RLS active, fragile if RLS disabled.
- **Fix Applied**: Use `Astro.locals.user` (set by middleware) and chain `.eq("user_id", user.id)` on all page-level queries. Also consolidated DB error into `error` variable (F3).
- **Decision**: FIXED (Fix A)

### F2 — UPDATE/DELETE API routes filtered only by id; no app-layer user_id check

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/gear/[id].ts:44, src/pages/api/gear/[id]/delete.ts:20
- **Detail**: Mutation routes retrieved the user via getUser() but never used user.id in the query predicate. RLS prevented cross-user access; application layer did not.
- **Fix Applied**: Added `.eq("user_id", user.id)` alongside `.eq("id", id)` in both routes.
- **Decision**: FIXED

### F3 — DB query errors silently swallowed in page frontmatters

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/gear/index.astro, src/pages/gear/[id]/edit.astro
- **Detail**: Neither page checked result.error after querying. DB failures silently rendered as empty list or not-found UI.
- **Fix Applied**: Consolidated via `const error = result?.error?.message ?? Astro.url.searchParams.get("error")` — DB errors now surface in the existing error banner. Applied in both pages as part of F1 fix.
- **Decision**: FIXED

### F4 — Lint failed with 1029 CRLF errors across all project files

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: .prettierrc.json
- **Detail**: Prettier 3.x defaults to LF; git core.autocrlf=true on Windows checks out CRLF. No .gitattributes or endOfLine config existed.
- **Fix Applied**: Added `"endOfLine": "auto"` to .prettierrc.json. Lint now passes.
- **Decision**: FIXED (Fix A)

### F5 — Not-found handling in edit.astro renders inline UI instead of redirecting

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/gear/[id]/edit.astro:34-44
- **Detail**: Plan specified redirect to /gear?error=Item+not+found. Implementation renders inline fallback UI. UX equivalent; URL stays at /gear/:id/edit. Also: return statements in Astro frontmatter trigger a @typescript-eslint/no-misused-promises lint crash.
- **Decision**: SKIPPED — inline UI accepted as equivalent UX

### F6 — No updated_at trigger; application layer must maintain the field manually

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260605000000_gear_items.sql
- **Detail**: updated_at had no automatic trigger. Any future UPDATE path omitting the field leaves it silently stale.
- **Fix Applied**: Created `supabase/migrations/20260605000001_gear_items_updated_at_trigger.sql` enabling moddatetime extension and attaching a before-update trigger to gear_items. Requires `npx supabase db push` to apply.
- **Decision**: FIXED (Fix A)

### F7 — Null-supabase branches in gear API routes omitted error param

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/gear/index.ts:9, src/pages/api/gear/[id].ts:9, src/pages/api/gear/[id]/delete.ts:9
- **Detail**: Canonical signin.ts redirects to /auth/signin?error=Supabase+is+not+configured. Gear routes redirected without error param.
- **Fix Applied**: Added `?error=Supabase+is+not+configured` to all three null-supabase redirects.
- **Decision**: FIXED

### F8 — Success criteria 3.3 not yet manually verified

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/gear-item-crud/plan.md (Progress 3.3)
- **Detail**: "Error redirect flows surface error messages on form pages" — only unchecked manual criterion.
- **Decision**: SKIPPED — user will verify manually

### F9 — Unbounded SELECT on gear list page

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/gear/index.astro
- **Detail**: No .limit() on the gear list query. Plan explicitly noted "No pagination at MVP scale".
- **Decision**: SKIPPED — acceptable per plan scope

### F10 — UPDATE RLS policy has extra WITH CHECK clause

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: supabase/migrations/20260605000000_gear_items.sql:22
- **Detail**: Plan specified USING only for UPDATE. Implementation also adds WITH CHECK — stricter, prevents user_id reassignment. Standard Postgres practice.
- **Decision**: SKIPPED — additive and safe
