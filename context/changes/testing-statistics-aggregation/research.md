---
date: 2026-06-10T23:03:20+02:00
researcher: Claude (Opus 4.8)
git_commit: 4d630b2449d45af00fdc5a4aa823055c6d7b9be0
branch: main
repository: HEMACompanion
topic: "Statistics aggregation — where it is computed, testability, and the cheapest test layer (test-plan Phase 1, Risk #1)"
tags: [research, codebase, statistics, aggregation, testing, vitest]
status: complete
last_updated: 2026-06-10
last_updated_by: Claude (Opus 4.8)
---

# Research: Statistics aggregation — computation site, testability, cheapest test layer

**Date**: 2026-06-10T23:03:20+02:00
**Researcher**: Claude (Opus 4.8)
**Git Commit**: 4d630b2449d45af00fdc5a4aa823055c6d7b9be0
**Branch**: main
**Repository**: HEMACompanion

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` (Risk #1 — statistics
aggregation is wrong). Locate where each statistic is computed (Astro page vs
`src/lib/` helper vs SQL), determine whether the logic is an extractable pure
function or coupled to the DB/page, identify the input data shape, note existing
tests, confirm Vitest fits this Astro 6 / Vite setup, and surface the oracle-
definition decisions a useful unit test must take from product intent rather than
from the code under test.

## Summary

**All statistics are computed in one place: inline in the Astro frontmatter of
`src/pages/stats/index.astro`, lines 42–108.** There is no `src/lib/` stats
helper (`src/lib/utils.ts` is only the `cn()` classname merge), and there is **no
SQL aggregation** — the page fetches raw rows with `select("*")` / `select(...)`
and aggregates in JavaScript using `Array.filter` and `Map`.

**The aggregation math is already pure over four input arrays** (`fights`,
`gearSets`, `gearItems`, `compositions`) — it reads only those arrays and returns
plain view-model values; it does not touch Supabase, cookies, or the request. But
that pure core is **embedded in the component frontmatter, interleaved after the
data-fetch block (lines 17–40)**, so it is not callable or unit-testable as it
stands.

**Consequence for the test plan's "cheapest layer" hypothesis (unit): correct, but
gated on a refactor.** To unit-test the aggregation deterministically, Phase 1
must first **extract lines 42–108 into a pure module** (e.g. `src/lib/stats.ts`)
that takes the four arrays and returns the computed values, then have the page
import it. After extraction, plain Vitest unit tests over hand-computed fixtures
cover Risk #1 with no DB, no jsdom, and no Astro runtime. Without extraction, the
only test surface is integration/e2e through the rendered page against Supabase —
more expensive, and it would couple the test to the data-fetch boundary the risk
is not about.

**Vitest is the right runner.** The extracted module is framework-free TypeScript,
so the unit tests need nothing Astro-specific. (If component-level tests are ever
wanted, `getViteConfig` from `astro/config` lets Vitest reuse Astro's Vite config —
not needed for Phase 1.)

**No existing tests** anywhere in the repo (confirmed in discovery: no
vitest/jest/playwright config, zero `*.test.*` files).

## Detailed Findings

### Computation site — `src/pages/stats/index.astro`

Data fetch (DB-coupled, NOT the aggregation under test):
- `src/pages/stats/index.astro:17-40` — under `if (supabase && user)`, three parallel
  `select` queries (`fights`, `gear_sets`, `gear_items`) all filtered by
  `user_id`, then a conditional `gear_set_compositions` fetch scoped by the user's
  gear-set ids (`:30-39`). Errors are coalesced into a single `error` string (`:24`, `:38`).

Aggregation (the pure core to extract — Risk #1 surface):
- `:44` `totalFights = fights.length` — FR-016 global count.
- `:46-49` `fightCountByCategory` — count per `weapon_category` over the fixed list
  `["longsword","sabre","rapier","other"]` (`:9`), then `.filter(c => c.count > 0)`.
  **A fight whose `weapon_category` is not in that list is counted in `totalFights`
  but appears in no category row.**
- `:51-52` `globalWinRate` — `wins / totalFights`, `Math.round(... * 100)%`; empty →
  the string sentinel `"—"`. **Denominator is total fights, so draws and losses are
  both in the denominator** (a 1W/1L/1D record → `33%`).
- `:54-62` `winRateByCategory` — same formula per category, `.filter(c => c.total > 0)`.
- `:64-71` `topOpponents` — `Map` keyed by exact `opponent_name` string, sorted by
  count desc, `slice(0, 5)`. **Ties resolve by first-seen order** (Map preserves
  insertion order + stable sort); **opponent matching is exact string match** (no
  trim/case-fold), per PRD §Business Logic.
- `:73-94` `gearItemCounts` — the multi-step trace FR-019: build
  `gear_set_id → [gear_item_id]` from `compositions` (`:73-78`), then for each fight
  **with a non-null `gear_set_id`** add 1 to every item in that set (`:79-87`), sort
  desc, join to item names, drop items not found (`:88-94`). **Fights with no gear
  set contribute nothing.**
- `:96-108` `gearSetUsage` — FR-020 count of fights per non-null `gear_set_id`,
  sorted desc, joined to set names.

### Input data shape (`src/lib/types.ts`)

- `Fight` (`:27-37`): `result: string`, `weapon_category: string`,
  `opponent_name: string`, `gear_set_id: string | null`, plus `id`, `user_id`,
  `date`, timestamps. **`result` and `weapon_category` are plain `string`, not union
  types** — no compile-time guarantee of allowed values.
- `GearSet` (`:12-18`): `{ id, name, ... }`. `GearItem` (`:1-10`):
  `{ id, name, category, brand|null, model|null, ... }`.
- `GearSetComposition` (`:20-25`): `{ gear_set_id, gear_item_id, ... }` — the join
  rows for the FR-019 trace.

The page narrows the fetched shapes to the minimum the aggregation needs (`:12-14`),
so an extracted function should accept narrow input types (e.g. just the fields it
reads), making fixtures small.

### Schema constraints relevant to the oracle (`supabase/migrations/20260605000003_fights.sql`)

- `:7` `result text not null` and `:6` `weapon_category text not null` — **no CHECK
  constraint / enum at the DB level.** The database accepts any non-null string, so
  aggregation must be correct for unexpected values (e.g. a `result` other than
  `"win"` counts as a non-win; a `weapon_category` outside the fixed four is
  category-invisible but still in totals/winrate).
- `:9` `gear_set_id uuid references gear_sets(id) on delete set null` — confirms the
  optional association and explains how a fight loses its gear link (set to NULL on
  set deletion). **Primarily a Phase 2/#6 concern**, but it is also the reason the
  aggregation must treat `gear_set_id === null` as "no gear contribution" (handled at
  `:81`, `:98`).

### Existing tests

None. No `vitest.config.*` / `jest.config.*` / `playwright.config.*`, zero
`*.test.*` / `*.spec.*` files, no `__tests__/` directories. `package.json` has no
`test` script; only `lint`, `format`, `build`. Husky + lint-staged run eslint on
commit. Phase 1 bootstraps the runner from zero.

## Oracle-definition decisions (take from product intent, NOT from the code)

These are the points where "assert what the function returns now" would bake in a
possibly-wrong behavior. The plan must fix each oracle from PRD intent before
writing fixtures:

1. **Winrate denominator.** Code uses `wins / totalFights` (draws + losses both in
   the denominator). PRD FR-017 / US-01 say only "win rate" — they do not define the
   formula. Decide explicitly: is a draw a non-win in the denominator (current code)
   or excluded (`wins / (wins + losses)`)? The fixture for a W/L/D mix must encode the
   decided formula, not echo `33%`.
2. **Rounding.** Code uses `Math.round(rate * 100)` (round-half-up, integer percent).
   Pin this so `1/3 → 33`, `2/3 → 67`, `0.5 cases` are intentional, not incidental.
3. **Empty / no-data sentinel.** Winrate with zero qualifying fights renders the
   string `"—"`, not `0%` or `null`. Tests must assert the sentinel for empty and
   per-category-empty cases.
4. **Opponent tie-breaking and matching.** Exact string match; ties keep first-seen
   order; list capped at top 5. Decide whether that tie/cap behavior is the intended
   contract (it is the testable one) and whether opponent names should be matched
   verbatim (current) — relevant because the same person typed two ways counts twice.
5. **Non-standard category / result values.** A fight with `weapon_category` outside
   the fixed four, or `result` outside win/loss/draw, is silently category-invisible
   but still counted in totals. Decide whether the oracle treats this as correct
   (current) or as a case the product should never produce.
6. **Gear trace with shared items.** If one gear item belongs to several sets, each
   fight counts once per set membership; a fixture with overlapping sets pins the
   intended counting (current code: per-set membership, so an item in two used sets
   accrues from both).

## Architecture Insights

- Single aggregation site, no duplication — extracting it centralizes the logic and
  removes computation from the view, which is the standard testable-seam refactor.
- Aggregation is pure over its inputs; the only impurity (Supabase fetch) sits above
  it and is out of scope for Risk #1. The clean boundary at line 42 (`// Aggregations`)
  is effectively the extraction line.
- All per-user scoping is at the fetch layer (`.eq("user_id", user.id)` + RLS), not
  in the aggregation — so unit fixtures need not model multi-user isolation (that is
  Phase 3 / Risk #3).

## Recommended cheapest-layer verdict

**Unit, after a small extract-pure-function refactor.** Concretely for the plan:
1. Extract `src/pages/stats/index.astro:42-108` into `src/lib/stats.ts` as pure
   functions (or one `computeStats(input)` returning the view models), accept narrow
   input types; update the page to import and call it (no behavior change).
2. Add Vitest (+ `test` script) — the extracted module is framework-free TS, so no
   jsdom / Astro test harness is required.
3. Write unit tests driven by hand-computed fixtures encoding the §"Oracle-definition
   decisions" above; cover empty, single-fight, W/L/D mix, multi-category, no-gear
   fight, shared-item gear trace, opponent ties, and >5 opponents.
4. Final sub-phase updates test-plan §6.1 (location `src/lib/`, naming, the new
   reference test, run command).

Do **not** promote to integration/e2e for Risk #1: nothing about the math needs the
DB or the rendered page. Integration belongs to Phase 2 (write-path) and Phase 3
(authorization), which do need the DB boundary.

## Historical Context (from prior changes)

- `context/changes/statistics-dashboard/` — the slice (S-04) that shipped this page;
  its plan/impl-review are the origin of the inline aggregation. The recent commits
  (`e69dc24`, `401d3bc`, `4d630b2`) are the statistics-dashboard build + defensive
  patches.
- `context/foundation/lessons.md` — open lesson on reflected `?error=` param is about
  protected pages generally; not aggregation-specific, no bearing on Phase 1.

## Open Questions

- **Winrate formula** (oracle decision #1) — needs a one-line product ruling before
  fixtures are written. Recommend confirming with the user during planning.
- Should the extracted module expose one `computeStats()` returning all view models,
  or several small functions (one per statistic)? Several small functions give
  sharper unit failures; the plan should pick. (Implementation detail for `/10x-plan`.)
- Out of scope for Phase 1 but noted: `on delete set null` behavior (Risk #6) and the
  absence of DB-level enums on `result`/`weapon_category` (Risk #5) are real and
  belong to Phases 2/3.
