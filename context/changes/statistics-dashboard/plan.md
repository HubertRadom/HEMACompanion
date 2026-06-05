# Statistics Dashboard Implementation Plan

## Overview

Implement the S-04 statistics dashboard — a read-only page at `/stats` that aggregates fight data and surfaces fight count, winrate, top-5 opponents, gear item usage, and gear set usage. Activates the "Stats" AppNav stub and completes the MVP tracking loop.

## Current State Analysis

- All prerequisite tables deployed with RLS: `fights`, `gear_sets`, `gear_set_compositions`, `gear_items`.
- `AppNav.astro:42` — `Stats` is a disabled `<span class="cursor-default text-white/25">Stats</span>` stub, identical to how prior nav items looked before their slices landed.
- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard", "/gear", "/gear-sets", "/fights"]`; `/stats` is not yet guarded.
- No `src/pages/stats/` directory exists.
- `WEAPON_CATEGORIES = ["longsword", "sabre", "rapier", "other"]` is defined at module scope in `src/pages/api/fights/index.ts` (and duplicated in `[id].ts`).

### Key Discoveries

- `fights` schema: `id`, `user_id`, `opponent_name`, `weapon_category`, `result`, `date`, `gear_set_id` (nullable FK → `gear_sets`), `created_at`, `updated_at`.
- `gear_set_compositions` schema: `id`, `gear_set_id`, `gear_item_id`, `created_at`.
- Gear item fight count requires a 3-hop join: fights → gear_sets → gear_set_compositions → gear_items. At PRD ceiling (~1,000 fights) TypeScript in-memory aggregation over fetched rows is well within budget.
- Multi-result error consolidation pattern: `const error = resultA?.error?.message ?? resultB?.error?.message ?? ...` — established in S-02/S-03 edit pages.
- No mutations → no `?error=` redirects ever target `/stats`; URL error param handling is not needed on this page.

## Desired End State

- Authenticated users navigate to `/stats` via a live "Stats" link in AppNav.
- `/stats` shows five stat sections: (1) Fight count — global + per weapon category, (2) Win rate — global + per weapon category, (3) Top-5 most-frequent opponents, (4) Gear item fight counts (items used in ≥ 1 fight), (5) Gear set usage counts (sets used in ≥ 1 fight).
- When the user has no fights, the page shows a single centered empty-state block with a CTA to `/fights/add`.
- All aggregation runs on the Astro server in TypeScript — no migrations, no RPC functions.

## What We're NOT Doing

- No mutations, API routes, or forms — read-only page.
- No DB schema changes — all tables exist.
- No Supabase RPC or SQL views — TypeScript in-memory aggregation only.
- No Supabase type generation — still deferred.
- No pagination — data volumes are bounded by PRD ceiling.
- Gear items/sets with zero fights are not shown.
- More than top-5 opponents are not shown.
- Chart visualizations — plain numbers only; no chart library.

## Implementation Approach

Same SSR-first pattern as all prior slices: Astro frontmatter fetches from Supabase, TypeScript aggregation computes the stats, and the Astro template renders the result. No React islands — there is no client-side interactivity. Data fetching: 3 parallel queries (fights, gear_sets, gear_items), then 1 sequential query (gear_set_compositions using gear set IDs from the parallel batch). Aggregation is pure TypeScript group-and-count over in-memory arrays.

---

## Phase 1: Nav Wiring and Route Protection

### Overview

Activate the Stats nav link and guard `/stats`. No page content yet — goal is that the route requires auth and AppNav shows "Stats" as a live, active-state link.

### Changes Required

#### 1. Middleware route protection

**File**: `src/middleware.ts`

**Intent**: Add `/stats` to the protected routes list so unauthenticated users are redirected to sign-in when they hit any `/stats/*` path.

**Contract**: Append `"/stats"` to the `PROTECTED_ROUTES` array at line 4.

#### 2. AppNav — activate Stats link

**File**: `src/components/AppNav.astro`

**Intent**: Replace the disabled "Stats" span stub with a live `<a href="/stats">` that highlights when the current path is `/stats` or any subpath.

**Contract**: Add `const isStats = pathname.startsWith('/stats')` alongside the existing `isGear`, `isGearSets`, `isFights` variables. Replace the `<span class="cursor-default text-white/25">Stats</span>` at line 42 with `<a href="/stats">` using the same conditional class pattern as the other three nav links.

### Success Criteria

#### Automated Verification

- TypeScript check passes: `npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification

- Navigating to `/stats` while unauthenticated redirects to `/auth/signin`
- "Stats" link in AppNav is live (not grayed out) and highlights when on `/stats`

**Implementation Note**: Pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Statistics Page

### Overview

Build `src/pages/stats/index.astro`. Fetch all relevant data in the frontmatter, aggregate in TypeScript, and render the five stat sections. Completes the S-04 outcome and the MVP north star.

### Changes Required

#### 1. Statistics page

**File**: `src/pages/stats/index.astro`

**Intent**: Fetch the authenticated user's fights, gear sets, gear items, and compositions; aggregate them into five stat groups; render them as readable sections using the existing visual conventions. Show a friendly empty state when the user has no fights.

**Contract**:

**Frontmatter data fetching:**
- Null-supabase and user checks (same pattern as all prior pages — if supabase/user missing, fall through to empty-state rendering rather than crashing).
- Three parallel queries via `Promise.all`: (a) `fights` `.select('*').eq('user_id', user.id)`, (b) `gear_sets` `.select('id, name').eq('user_id', user.id)`, (c) `gear_items` `.select('id, name').eq('user_id', user.id)`.
- One sequential query after gear sets resolve: `gear_set_compositions` `.select('gear_set_id, gear_item_id').in('gear_set_id', gearSetIds)` — skip (treat as empty) if `gearSetIds.length === 0`.
- Consolidated error: `const error = fightsResult?.error?.message ?? setsResult?.error?.message ?? itemsResult?.error?.message ?? compositionsResult?.error?.message ?? null`.

**TypeScript aggregations (computed before the template):**

a. `totalFights = fights.length`

b. `fightCountByCategory` — group fights by `weapon_category`; use the canonical WEAPON_CATEGORIES order (`longsword`, `sabre`, `rapier`, `other`) for display ordering.

c. `wins = fights.filter(f => f.result === 'win').length`; `globalWinRate` — `"${Math.round(wins / totalFights * 100)}%"` or `"—"` when `totalFights === 0`.

d. `winRateByCategory` — per-category wins / per-category count; same `"X%"` or `"—"` logic per category.

e. `topOpponents: { name: string; count: number }[]` — group fights by `opponent_name`, count, sort descending, take first 5.

f. `gearItemCounts: { id: string; name: string; count: number }[]`:
- Build `Map<gearSetId, gearItemId[]>` from compositions.
- For each fight with a non-null `gear_set_id`, add 1 to each gear item in that set.
- Filter to count ≥ 1; join with gear item names; sort descending.

g. `gearSetUsage: { id: string; name: string; count: number }[]` — group fights by `gear_set_id` (skip null), count, filter ≥ 1, join with gear set names, sort descending.

**Template structure** (wrapped in `<AppLayout title="Statistics">`):
- Page header: "My Statistics" with the same gradient heading style as other pages.
- Empty state (`totalFights === 0`): centered block (`rounded-2xl border border-white/10 bg-white/5 p-12 text-center`) with a short message and `<a href="/fights/add">Log your first fight</a>` button — matches the empty state on `/fights`.
- When data exists: five sections stacked vertically, each a card (`rounded-xl border border-white/10 bg-white/5 px-5 py-4`):
  1. **Fight Summary** — total fight count + table/rows of per-category counts.
  2. **Win Rate** — global win rate + per-category rows.
  3. **Top Opponents** — up to 5 rows: opponent name (left) + fight count (right).
  4. **Gear Items** — rows of gear item name + fight count; omit section entirely if `gearItemCounts.length === 0`.
  5. **Gear Sets** — rows of gear set name + usage count; omit section entirely if `gearSetUsage.length === 0`.
- Error banner (if `error`) before the sections: same `border-red-500/30 bg-red-900/30` pattern.

### Success Criteria

#### Automated Verification

- TypeScript check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- `/stats` with no fights logged: single empty-state block with "Log your first fight" CTA
- After logging one win (longsword vs. opponent A): total = 1, global winrate = 100%, longsword count = 1, longsword winrate = 100%, opponent A appears in top-5
- After logging one loss (sabre vs. opponent A): total = 2, global winrate = 50%, opponent A count = 2, sabre count = 1, sabre winrate = 0%
- With 6+ distinct opponents: top-opponents list shows exactly 5 entries ranked by fight count
- Logging a fight with a gear set: gear set appears in Gear Sets with count 1; each gear item in the set appears in Gear Items with count 1
- Logging a second fight with the same gear set: gear set count = 2, each gear item count = 2
- Logging a fight without a gear set: fight reflected in fight summary and winrate; gear stats sections unchanged
- Deleting a gear set previously associated with fights: fight summary and winrate counts are unchanged (fights still exist); gear set no longer appears in Gear Sets section; gear items from that set no longer counted (hidden because count = 0)
- Navigating to `/stats` while unauthenticated redirects to `/auth/signin`
- "Stats" link in AppNav is active/highlighted when on `/stats`

**Implementation Note**: This completes the S-04 outcome and the MVP north star. Only after all manual checks pass is this change complete.

---

## Testing Strategy

### Unit Tests

No test framework configured — skip.

### Integration Tests

None at this stage.

### Manual Testing Steps

1. Log in. Navigate to `/stats` via AppNav. Confirm "Stats" is active and highlighted. With no fights, confirm the empty-state block renders with CTA.
2. Log one fight (win, longsword, vs. opponent A, with a gear set). Navigate to `/stats`. Confirm: total = 1, global winrate = 100%, longsword count = 1, longsword winrate = 100%, opponent A in top-5, gear set in Gear Sets, gear items in Gear Items.
3. Log one fight (loss, sabre, vs. opponent A). Confirm: total = 2, global winrate = 50%, opponent A count = 2, sabre count = 1, sabre winrate = 0%.
4. Log fights against 5 additional distinct opponents. Confirm: top-opponents list has exactly 5 entries, ranked correctly.
5. Log a fight without a gear set. Confirm: fight counted in summary and winrate; Gear Sets and Gear Items sections unchanged.
6. Delete a gear set that was used in logged fights. Navigate to `/stats`. Confirm: total fight count unchanged; gear set no longer in Gear Sets section; its gear items no longer counted (hidden).
7. Navigate to `/stats` while unauthenticated — confirm redirect to `/auth/signin`.

## Performance Considerations

All queries include `.eq("user_id", user.id)` — the RLS-indexed `user_id` column scopes fetches to the authenticated user. Three parallel queries + one sequential composition fetch (only if gear sets exist). At PRD ceiling (~1,000 fights), this is well within the 1-second NFR for statistics rendering. No caching or DB-level aggregation is required.

## References

- Roadmap slice: `context/foundation/roadmap.md` — S-04
- PRD requirements: `context/foundation/prd.md` — FR-016 through FR-020
- Prior page pattern: `src/pages/fights/index.astro`
- Nav stub: `src/components/AppNav.astro:42`
- Middleware pattern: `src/middleware.ts:4`
- Weapon categories constant: `src/pages/api/fights/index.ts:4`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Nav Wiring and Route Protection

#### Automated

- [x] 1.1 TypeScript check passes: `npx astro check`
- [x] 1.2 Lint passes: `npm run lint`

#### Manual

- [x] 1.3 /stats redirects to sign-in when unauthenticated
- [x] 1.4 Stats link in AppNav is live and highlights when on /stats

### Phase 2: Statistics Page

#### Automated

- [ ] 2.1 TypeScript check passes: `npx astro check`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Build succeeds: `npm run build`

#### Manual

- [ ] 2.4 /stats with no fights shows empty state with CTA to /fights/add
- [ ] 2.5 One win logged: total = 1, winrate = 100%, opponent appears in top-5
- [ ] 2.6 Mix of wins and losses: global winrate reflects correct percentage
- [ ] 2.7 6+ distinct opponents: top-5 list shows exactly 5 entries ranked by fight count
- [ ] 2.8 Fight with gear set: gear set and gear items appear in gear stats sections with correct counts
- [ ] 2.9 Fight without gear set: fight counted in summary; gear stats unaffected
- [ ] 2.10 Delete gear set: fight count unchanged; gear set and its items no longer shown in gear stats
- [ ] 2.11 /stats redirects to sign-in when unauthenticated
