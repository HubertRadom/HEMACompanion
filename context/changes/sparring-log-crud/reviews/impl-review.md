<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Sparring Log CRUD

- **Plan**: context/changes/sparring-log-crud/plan.md
- **Scope**: All phases (1–3)
- **Date**: 2026-06-05
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical · 3 warnings · 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — gear_set_id ownership not verified before insert/update

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/fights/index.ts:43, src/pages/api/fights/[id].ts:47
- **Detail**: When gear_set_id is non-empty, it was stored without verifying the gear set belongs to the authenticated user. A bypassed client could POST another user's gear_set_id — FK passes (row exists), fight stored with cross-user reference. S-04 statistics would trace across ownership boundaries.
- **Fix**: Added ownership check (`supabase.from("gear_sets").select("id").eq("id", gearSetId).eq("user_id", user.id).maybeSingle()`) before insert/update in both routes. Redirect with "Invalid gear set" if null.
- **Decision**: FIXED

### F2 — Date string not validated before DB write

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/fights/index.ts:36, src/pages/api/fights/[id].ts:39
- **Detail**: date checked only for non-empty, not YYYY-MM-DD format. Bypassed client can POST "not-a-date"; Postgres rejects it but returns raw DB error string verbatim in redirect URL.
- **Fix**: Added `if (!/^\d{4}-\d{2}-\d{2}$/.test(date))` guard redirecting with "Invalid date format" in both routes.
- **Decision**: FIXED

### F3 — Reflected ?error= URL param rendered as application error text

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/fights/index.astro, add.astro, [id]/edit.astro (project-wide pattern)
- **Detail**: Astro auto-escapes so no XSS, but an attacker can craft a URL with arbitrary error text displayed as application UI — phishing vector. Same pattern exists in gear-sets and gear pages from S-01/S-02.
- **Fix**: Added same-origin Referer check in all three fights pages: only render `?error=` when `referer.startsWith(Astro.url.origin)`. Lesson recorded in context/foundation/lessons.md.
- **Decision**: FIXED + LESSON RECORDED

### F4 — Redundant name="date" prop on FormField

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/fights/FightForm.tsx:117
- **Detail**: FormField defaults name to id. id="date" already produces name="date" automatically. Explicit prop was redundant and inconsistent with all other FormField calls in this file and GearSetForm.tsx.
- **Fix**: Removed the `name="date"` prop.
- **Decision**: FIXED
