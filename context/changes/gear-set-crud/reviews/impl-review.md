<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Gear Set CRUD

- **Plan**: context/changes/gear-set-crud/plan.md
- **Scope**: All 3 Phases
- **Date**: 2026-06-05
- **Verdict**: NEEDS ATTENTION → resolved via triage (all warnings fixed)
- **Findings**: 0 critical  3 warnings  4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Automated Verification (re-run at review time)

| Check | Result |
|-------|--------|
| `npx astro check` | PASS — 0 errors, 0 warnings |
| `npm run lint` | PASS — exit 0 |
| `npm run build` | PASS — completed in 7.16s |

## Findings

### F1 — App-layer ownership gap before composition operations

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/gear-sets/[id].ts:31–55
- **Detail**: The `.update()` call had no row-count check. If the gear set didn't belong to the user, the update silently no-oped and the code proceeded to composition upsert/delete, giving a misleading success redirect. RLS on `gear_set_compositions` blocked actual cross-user data manipulation, but the plan requires enforcement at both DB and application layers.
- **Fix**: Chained `.select("id").maybeSingle()` onto the `.update()` call. If `data` is null, redirects to `/gear-sets/${id}/edit?error=Set+not+found` before touching compositions.
- **Decision**: FIXED via Fix A

### F2 — No ownership check on submitted gear_item_id values

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/gear-sets/index.ts:28–42, src/pages/api/gear-sets/[id].ts:39–55
- **Detail**: `itemIds` from `formData.getAll("item_ids")` flowed directly into compositions insert/upsert without verifying those UUIDs belonged to the authenticated user. The `gear_set_compositions` INSERT RLS policy only checked gear_set ownership, not gear_item ownership. A crafted POST with another user's gear_item UUID would succeed at the DB level, creating a dangling composition row (a data integrity defect and UUID existence oracle).
- **Fix**: Added pre-composition ownership check in both routes: `.from("gear_items").select("id").in("id", itemIds).eq("user_id", user.id)`. Redirects with error if returned count doesn't match `itemIds.length`.
- **Decision**: FIXED

### F3 — Orphaned gear_set row on composition insert failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/gear-sets/index.ts:28–46
- **Detail**: If the `gear_sets` insert succeeded but the compositions insert failed, the `gear_sets` row was left orphaned. The error redirect returned the user to `/gear-sets/add`, leaving an empty set accumulating in the DB and appearing as "No items" in the list.
- **Fix**: In the `if (compError)` block, added a best-effort cleanup: `.from("gear_sets").delete().eq("id", newSetId).eq("user_id", user.id)` before redirecting.
- **Decision**: FIXED via Fix A

### F4 — .select("*") in gear_items queries exposes excess columns

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/gear-sets/add.astro:10, src/pages/gear-sets/[id]/edit.astro:24
- **Detail**: Both pages used `.select("*")` for gear_items, sending user_id/created_at/updated_at through the client:load hydration payload. GearSetForm only uses id/name/category. The list page nested join already used `.select("id, name, category")` correctly.
- **Fix**: Changed both to `.select("id, name, category")`.
- **Decision**: FIXED

### F5 — No LIMIT on gear_sets list query

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/gear-sets/index.astro:13–18
- **Detail**: No upper bound on the nested join query. Plan explicitly defers pagination to S-04.
- **Decision**: SKIPPED — explicitly deferred in plan; acceptable at MVP scale

### F6 — Plan drift: two separate error guards in [id].ts

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/gear-sets/[id].ts
- **Detail**: Plan described a single combined error redirect after composition operations. Implementation uses two separate guards (after upsert, after delete) — strictly safer behavior.
- **Decision**: SKIPPED — beneficial deviation; no action needed

### F7 — itemIds not explicitly validated as UUIDs before filter string

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/gear-sets/[id].ts:52
- **Detail**: `.not("gear_item_id", "in", ...)` passed joined values directly into the PostgREST filter string without UUID format validation. PostgREST parameterizes the SQL so injection is not possible; non-UUID values would trigger a DB type error (caught by `deleteError`).
- **Decision**: SKIPPED — superseded by F2 fix; the ownership check query now validates IDs against the DB implicitly
