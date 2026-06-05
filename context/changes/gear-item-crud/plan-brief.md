# Gear Item CRUD — Plan Brief

> Full plan: `context/changes/gear-item-crud/plan.md`

## What & Why

Implement the gear item CRUD flow (add / list / edit / delete) as the first HEMA domain slice. Individual practitioners have no structured way to track their equipment — this slice delivers the gear tracking foundation and establishes the UI/API pattern every subsequent CRUD slice (S-02, S-03) reuses.

## Starting Point

The app has working auth (Supabase sign-in/sign-up, route protection middleware) and a placeholder dashboard. No domain tables exist yet — `supabase/migrations/` is absent, and the Astro layout has no persistent navigation.

## Desired End State

Authenticated users can navigate to `/gear` from a persistent app nav bar, see their gear items listed (or a friendly empty state), add items via `/gear/add`, edit via `/gear/[id]/edit`, and delete with a confirmation step. RLS enforces that no user can read or modify another user's items. The nav shell (`AppLayout` + `AppNav`) with stubbed links for Gear Sets, Fights, and Stats is in place for S-02 and S-03 to reuse.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Schema scope | gear_items table only (not all 4 tables) | Slice-based approach; gear_items has no FK deps, so it's safe to deploy alone | Plan |
| Weapon category field | Predefined HEMA list (select) | Free text breaks per-category winrate stats in S-04 via typo drift | Plan |
| Rendering strategy | SSR + full-page refresh | Matches existing auth form pattern exactly; no client state management needed | Plan |
| UI location | /gear dedicated route | Scales naturally to /gear-sets and /fights without dashboard bloat | Plan |
| Edit flow | Separate /gear/[id]/edit page | Consistent with SSR-first; each item gets a stable URL | Plan |
| Delete UX | Browser confirm() dialog | Prevents accidental hard deletes; zero extra JS required | Plan |
| Navigation | Add AppNav now with stubbed future links | Nav retro-added across three slices costs more than building it once | Plan |
| Empty state | Friendly message + "Add gear item" CTA | Guides new users to the first action | Plan |

## Scope

**In scope:** gear_items migration + RLS, AppLayout/AppNav, /gear list page, /gear/add, /gear/[id]/edit, three API routes (create/update/delete), GEAR_CATEGORIES constant, GearItem type

**Out of scope:** gear_sets / gear_set_compositions / fights tables; Supabase type generation; optimistic UI; pagination; undo/soft-delete

## Architecture / Approach

Astro SSR pages query Supabase in their frontmatter and render server-side HTML. Mutations flow through dedicated Astro API routes that read `formData`, call Supabase (RLS enforces ownership), and redirect. React islands (one shared `GearItemForm.tsx`) handle client-side field validation only — submission is a native form POST, matching the auth form pattern. A new `AppLayout.astro` composes the existing `Layout.astro` with `AppNav.astro`, leaving auth pages untouched.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Database Schema | gear_items table + RLS applied to remote Supabase | Migration must be applied manually (CLI or dashboard); no automated deploy step |
| 2. App Layout + Nav | AppLayout, AppNav, /gear protected route, dashboard link | Nav stub design must not break when future routes are added |
| 3. API Routes | Create, update, delete endpoints | RLS silently no-ops on wrong-user update — must verify with manual cross-user test |
| 4. Gear UI Pages | /gear list, /gear/add, /gear/[id]/edit, GearItemForm | GearItemForm initialValues must correctly pre-fill for edit mode |

**Prerequisites:** Supabase CLI logged in and linked to project `welwzvjoqvutnuhqnckw`; app deployed and accessible for cross-user RLS test in Phase 4
**Estimated effort:** ~1–2 sessions across 4 phases

## Open Risks & Assumptions

- The Supabase project (`welwzvjoqvutnuhqnckw`) is accessible and the CLI can push migrations. If the project is paused or CLI auth is stale, Phase 1 blocks everything.
- `GEAR_CATEGORIES` is a code-level constant — adding a new weapon type requires a code change and redeploy. Acceptable for MVP; may need a DB-backed table in a future iteration.

## Success Criteria (Summary)

- User can complete the full gear item lifecycle (add → view → edit → delete) without error
- A second user cannot access the first user's items via direct URL (RLS verified manually)
- App nav renders with Gear active and stubbed links for future sections
