# Sparring Log CRUD — Plan Brief

> Full plan: `context/changes/sparring-log-crud/plan.md`

## What & Why

Implement the fight logging slice of HEMA Companion — the ability to log, view, edit, and delete sparring fights at `/fights`. This is S-03 on the roadmap: the last CRUD slice before the statistics dashboard (S-04), and the data source that makes stats meaningful. Without fight records, the product's core promise — "see your winrate and opponent patterns" — cannot be fulfilled.

## Starting Point

The `gear_sets` and `gear_items` tables are deployed with RLS. AppNav has a disabled "Fights" `<span>` stub. The SSR + POST → redirect + React island CRUD pattern is established across two prior slices (S-01, S-02) and ready to replicate. No `fights` table exists yet.

## Desired End State

An authenticated user can navigate to `/fights` via AppNav, log a fight with five fields (opponent name, weapon category, result, date, optional gear set), and see it immediately in a date-ordered list. They can edit or delete any fight. Deleting a gear set that was used in a fight leaves the fight intact with a null gear set reference — no data loss.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| URL path | `/fights` | Matches AppNav label, PRD wording, and DB table name for naming consistency. | Plan |
| Weapon categories | longsword, sabre, rapier, other | PRD examples + catch-all for niche disciplines; fixed list for MVP. | Plan |
| Category enforcement | App-layer only (no DB CHECK) | Consistent with `GEAR_CATEGORIES` pattern in S-01; new categories won't need a migration. | Plan |
| List order | Newest first (date desc) | Log UX convention — most recent fight is most relevant; matches gear-sets list direction. | Plan |
| Date default | Today pre-filled | Covers the common case (log right after a session) with zero friction. | Plan |
| Gear set field | Dropdown, "No gear set" default | Always visible, always optional; disabled-with-hint if user has no gear sets yet. | Plan |
| gear_set_id FK | `ON DELETE SET NULL` | Deleting a gear set must not destroy fight history — PRD guardrail against silent data loss. | S-02 handoff note |
| List columns | Date + Opponent + Result + Category + Actions | Gear set name excluded to keep rows compact; gear set is optional so often absent. | Plan |

## Scope

**In scope:**
- `fights` table migration (completing F-01 schema)
- Three API routes: create, update, delete at `/api/fights/`
- `FightForm` React component (five fields)
- Three pages: `/fights` (list), `/fights/add`, `/fights/[id]/edit`
- AppNav "Fights" link activation and middleware route protection
- `Fight` type in `src/lib/types.ts`

**Out of scope:**
- Notes/comments field on fights (not in PRD)
- Pagination (MVP scale)
- Custom weapon categories
- Fight detail page (edit page serves this role)
- Supabase type generation (deferred to S-04)

## Architecture / Approach

Same SSR-first pattern as S-01 and S-02: Astro page frontmatters fetch data via `createClient()`, mutations go through POST API routes, `FightForm.tsx` handles client-side validation only (no controlled form POST). The `fights` table has a single nullable FK to `gear_sets` — no join table — making the API routes simpler than S-02. The `FightForm` is the most field-rich form in the project so far (five fields) but reuses the same `FormField` / `SubmitButton` / `ServerError` primitives.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. DB Schema, Types, Navigation | `fights` table + RLS + trigger deployed; `Fight` type added; AppNav + middleware updated | Incorrect nullable FK (`SET NULL` vs `CASCADE`) silently breaks the data-loss guardrail |
| 2. API Routes | Create, update, delete handlers at `/api/fights/` | `gear_set_id` empty string must be coerced to `null` before insert/update |
| 3. UI Pages | `FightForm` + list/add/edit pages; full CRUD flow working | "No gear sets" empty state in the dropdown must not block form submission |

**Prerequisites:** `gear_sets` table deployed (S-02 complete — confirmed). Supabase project linked locally for `npx supabase db push`.
**Estimated effort:** ~2 sessions across 3 phases (simpler than S-02 — no join table).

## Open Risks & Assumptions

- The `gear_set_id` nullable FK is the only structural difference from prior tables. If `ON DELETE SET NULL` is accidentally written as `ON DELETE CASCADE`, fight records disappear when gear sets are deleted — the primary guardrail failure mode. Verify in Supabase dashboard after migration (Phase 1 manual check 1.6).
- `WEAPON_CATEGORIES` and `FIGHT_RESULTS` constants are duplicated between create and update API routes (no shared constants file established in the project). Acceptable for two files; flag for S-04 if a third consumer appears.

## Success Criteria (Summary)

- A fight can be logged, viewed, edited, and deleted without data loss
- Deleting a gear set leaves associated fights intact with `gear_set_id = null`
- All operations are inaccessible to unauthenticated users and reject cross-user access attempts
