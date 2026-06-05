# Statistics Dashboard — Plan Brief

> Full plan: `context/changes/statistics-dashboard/plan.md`

## What & Why

S-04 is the MVP north star: a read-only statistics page at `/stats` that turns a practitioner's fight log into visible patterns — fight count, winrate, top opponents, and gear usage. It completes the primary success criterion ("register → add gear → create set → log fight → view stats") and closes the tracking loop the product depends on.

## Starting Point

All prerequisite tables are deployed with RLS (`fights`, `gear_sets`, `gear_set_compositions`, `gear_items`). AppNav has a disabled "Stats" stub at line 42; `/stats` is not yet in middleware protection. No stats page exists.

## Desired End State

An authenticated user navigates to `/stats` via a live nav link and sees five stat sections: global + per-weapon-category fight count and win rate, top-5 most-frequent opponents, gear item fight counts, and gear set usage counts. Users with no fights see a friendly empty state with a CTA to log their first fight.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Aggregation location | TypeScript in-memory on Astro server | Follows the pattern used by every other page; at ≤1,000 fights no DB-level aggregation is needed. | Plan |
| Opponent list cap | Top 5 | Keeps the page compact; the meaningful signal is who you fight most, not a full ranked directory. | Plan |
| Zero-use gear display | Omit (only show ≥ 1 fights) | A stats page showing all zeros for unused gear reads as broken and dilutes the pattern signal. | Plan |
| Empty state | Single block with CTA | Matches the `/fights` empty-state pattern; avoids a page full of zeros for new users. | Plan |
| Interactivity | None (pure SSR, no React island) | Stats page has no client-side interactivity; React islands are not needed. | Plan |

## Scope

**In scope:**
- AppNav Stats link activation
- `/stats` middleware protection
- `src/pages/stats/index.astro` — aggregation + rendering
- Five stat sections: fight count, winrate, top-5 opponents, gear items (used), gear sets (used)

**Out of scope:**
- No new DB migrations
- No Supabase RPC functions or SQL views
- No chart visualizations
- No Supabase type generation (still deferred)
- Gear items/sets with zero fights not shown

## Architecture / Approach

One new Astro page. Frontmatter runs 3 parallel Supabase queries (fights, gear_sets, gear_items) then 1 sequential query (gear_set_compositions keyed on gear set IDs). TypeScript group-and-count aggregations produce 7 derived values. Template renders 5 stat card sections, or a single empty-state block when no fights exist. No new components needed — styling follows `bg-white/5 border-white/10 rounded-xl` conventions from existing pages.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Nav Wiring | `/stats` requires auth; "Stats" link is live in AppNav | None — trivial wiring |
| 2. Statistics Page | Full aggregation + rendering of all 5 stat sections | Gear item count (3-hop join) must correctly attribute fights through deleted gear sets (`gear_set_id = null` after ON DELETE SET NULL) |

**Prerequisites:** S-03 implemented (fights table and data in place) ✓  
**Estimated effort:** ~1 session across 2 phases

## Open Risks & Assumptions

- Gear item fight count correctly zeroes out when a gear set is deleted (fights get `gear_set_id = null` via ON DELETE SET NULL — those fights should not be attributed to any gear item). Manual test step 2.10 verifies this.
- At PRD ceiling (~1,000 fights), 4 queries + in-memory aggregation stays well under the 1-second NFR. No caching needed.

## Success Criteria (Summary)

- User with fights sees accurate fight count, winrate percentages, top-5 opponent list, and used gear stats on `/stats`
- User with no fights sees a friendly empty state (not a broken page with zeros)
- Deleting a gear set leaves fight counts intact while removing that set and its items from gear stats
