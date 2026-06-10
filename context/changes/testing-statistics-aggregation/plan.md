# Statistics Aggregation — Test Bootstrap & Coverage Implementation Plan

## Overview

Rollout Phase 1 of `context/foundation/test-plan.md` ("Bootstrap runner + statistics aggregation"), defending **Risk #1** (statistics aggregation is wrong). We extract the statistics aggregation currently inlined in the stats page into a pure, framework-free module, stand up the project's first test runner (Vitest), and lock the aggregation math with oracle-driven unit tests across the full edge matrix. The extraction is strictly behavior-preserving; no user-visible output changes.

## Current State Analysis

- **All statistics are computed inline** in the Astro frontmatter of `src/pages/stats/index.astro:42-108`, interleaved after the Supabase fetch block (`:17-40`). There is no `src/lib/` stats helper (`src/lib/utils.ts:1-6` is only the `cn()` classname merge), and **no SQL aggregation** — the page fetches raw rows and aggregates in JS with `Array.filter` and `Map`.
- The aggregation math is **already pure over four input arrays** (`fights`, `gearSets`, `gearItems`, `compositions`); it reads only those arrays and returns plain view-model values. The only impurity (the Supabase fetch) sits above it at `:17-40` and is out of scope for Risk #1. Line 42 (`// Aggregations`) is effectively the extraction seam.
- **No test infrastructure exists**: no `vitest.config.*` / `jest.config.*` / `playwright.config.*`, zero `*.test.*` files, no `test` script in `package.json`. Husky + lint-staged run eslint on commit.
- The input types live in `src/lib/types.ts:27-37` (`Fight`) and `:1-25` (`GearItem`, `GearSet`, `GearSetComposition`). `Fight.result` and `Fight.weapon_category` are plain `string` (no union), and the DB has **no CHECK constraint** on them (`supabase/migrations/20260605000003_fights.sql:6-7`), so the math must stay correct for values outside the expected sets.

(Full grounding: `context/changes/testing-statistics-aggregation/research.md`.)

## Desired End State

- `src/lib/stats.ts` exists: small pure functions (one per statistic) plus a `computeStats(input)` aggregator, returning exactly the view-model shapes the page renders today.
- `src/pages/stats/index.astro` imports `computeStats` and renders from its result; the page produces byte-identical output to today for any given data.
- Vitest is installed and runnable via `npm test`; `src/lib/stats.test.ts` passes with the full 8-case edge matrix, every expected value hand-computed from product rules.
- `test-plan.md` §6.1 documents how to add a unit test in this project.

**Verify:** `npm run lint`, `npx astro check` (typecheck), `npm run build`, and `npm test` all pass; the stats page renders identical numbers before/after for a seeded account.

### Key Discoveries:

- Aggregation seam at `src/pages/stats/index.astro:42` — pure over inputs, mechanical to extract.
- Winrate denominator decision (resolved): `wins / totalFights` (draws + losses in denominator) — matches shipped `:52`, so **no behavior change**.
- Empty-state sentinel is the **string** `"—"` (`:52`, `:60`), not `0%`/null — preserved and asserted.
- Gear-item trace (FR-019) is a JS multi-step join: `gear_set_id → [gear_item_id]` then count per fight with a non-null `gear_set_id` (`:73-94`).
- Extracted module is framework-free TS → Vitest needs no jsdom/Astro test harness.

## What We're NOT Doing

- **Not wiring CI** (`.github/workflows/ci.yml`). Adding the unit gate to CI belongs to rollout **Phase 4 (Quality-gates wiring)** per `test-plan.md` §3/§5. This phase adds the `npm test` script only.
- **Not changing any statistic's behavior or formula.** Winrate stays `wins / total`; the `"—"` sentinel, the fixed category list, and `count > 0` filtering are preserved verbatim.
- **Not splitting data from formatting.** Functions return the same view-model shapes (including the `"—"` string) the page uses today.
- **Not testing the Supabase fetch / RLS / per-user scoping** (`:17-40`) — that is rollout Phase 3 (Risk #3). Fixtures are plain in-memory arrays.
- **Not adding component/e2e tests** for the stats page — Risk #1 is pure math; e2e is rollout Phase 4.
- **Not refactoring the page markup** (`:111-226`) beyond swapping the computed bindings for `computeStats()` output.

## Implementation Approach

Behavior-preserving extract-and-cover. First create the pure module by lifting `:42-108` verbatim into named functions, composing them in `computeStats()`, and replacing the page's inline block with a single call — verifying identical output before any test exists. Then add Vitest as a standalone runner (no Astro coupling needed for a pure module). Then author the unit tests, deriving every expected value by hand from the product rules in the research doc, never by executing the code under test. Finally, document the pattern in the test-plan cookbook.

## Critical Implementation Details

- **Extraction fidelity gate (Phase 1 before Phase 3).** The extraction must land and be visually verified as byte-identical output *before* tests are written — otherwise the new tests would encode whatever the post-refactor code does, reintroducing the oracle problem the tests exist to prevent. Tests assert the *intended* behavior, which for unchanged statistics equals the pre-refactor behavior.
- **Oracle independence (Phase 3).** Expected values in `stats.test.ts` are literals computed by hand from the rules in `research.md` §"Oracle-definition decisions". Do not import and call `computeStats` to generate an expected value, snapshot the output, or copy the implementation's arithmetic into an assertion.

## Phase 1: Extract pure aggregation module

### Overview

Move the inline aggregation into `src/lib/stats.ts` as small pure functions plus a `computeStats()` aggregator, and rewire the stats page to consume it. No behavior change.

### Changes Required:

#### 1. New pure aggregation module

**File**: `src/lib/stats.ts`

**Intent**: House every statistic as a small, independently testable pure function, then compose them in one `computeStats(input)` the page can call with a single import. Lift the logic from `src/pages/stats/index.astro:42-108` verbatim — same arithmetic, same sentinels, same sort/slice/filter behavior.

**Contract**: Export one function per statistic plus an aggregator. Functions are pure (no I/O), accept narrow input types drawn from `src/lib/types.ts`, and return the exact view-model shapes the page renders today:
- `totalFights(fights): number`
- `fightCountByCategory(fights): { category: string; count: number }[]` (fixed category order `["longsword","sabre","rapier","other"]`, filtered to `count > 0`)
- `globalWinRate(fights): string` (`"—"` when no fights; else `` `${Math.round(wins/total*100)}%` ``)
- `winRateByCategory(fights): { category: string; total: number; rate: string }[]` (filtered to `total > 0`)
- `topOpponents(fights): { name: string; count: number }[]` (exact-name match, count desc, stable first-seen tie-break, top 5)
- `gearItemCounts(fights, gearItems, compositions): { id: string; name: string; count: number }[]`
- `gearSetUsage(fights, gearSets): { id: string; name: string; count: number }[]`
- `computeStats(input: { fights; gearSets; gearItems; compositions }): { ... }` returning all of the above keyed for the page.
Define the weapon-category constant once in this module and export it; the page imports it instead of redeclaring `:9`.

#### 2. Rewire the stats page to consume the module

**File**: `src/pages/stats/index.astro`

**Intent**: Replace the inline aggregation block (`:42-108`) with a single `computeStats({ fights, gearSets, gearItems, compositions })` call and destructure its result into the names the markup already binds (`totalFights`, `fightCountByCategory`, `globalWinRate`, `winRateByCategory`, `topOpponents`, `gearItemCounts`, `gearSetUsage`). Leave the fetch block (`:17-40`) and the markup (`:111-226`) untouched except for the binding source.

**Contract**: The frontmatter keeps the same local variable names so the template (`:119-224`) needs no edits. Import `computeStats` (and the category constant) from `@/lib/stats`. Remove the now-duplicated `WEAPON_CATEGORIES` declaration at `:9`.

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Stats page renders identical numbers to pre-refactor for a seeded account with a W/L/D mix across multiple categories and at least one gear set used in multiple fights.
- Empty account still shows the "No fights logged yet" empty state and `"—"` winrate.

**Implementation Note**: After this phase and all automated verification passes, pause for human confirmation that the stats page output is unchanged before writing any tests (the extraction-fidelity gate).

---

## Phase 2: Bootstrap Vitest

### Overview

Add Vitest as the project's first test runner. The module under test is framework-free TS, so no jsdom or Astro test integration is required.

### Changes Required:

#### 1. Add Vitest dependency and config

**File**: `package.json`, `vitest.config.ts`

**Intent**: Install Vitest and add a `test` script so unit tests run locally (and are available to the rollout Phase 4 CI gate). Configure a minimal `node`-environment Vitest setup that picks up `src/**/*.test.ts`.

**Contract**: Add `vitest` to `devDependencies`; add `"test": "vitest run"` and `"test:watch": "vitest"` to `scripts`. `vitest.config.ts` sets `test.environment = "node"` and an include glob for `src/**/*.test.ts`. Verify the `@/` path alias resolves in tests (mirror the `tsconfig`/Astro alias; use `getViteConfig` from `astro/config` only if the bare `@/` import fails to resolve under Vitest).

#### 2. Smoke test to prove the harness runs

**File**: `src/lib/stats.test.ts` (initial smoke assertion, expanded in Phase 3)

**Intent**: A single trivial assertion (e.g. `totalFights([]) === 0`) so `npm test` exits green and proves the runner, config, and alias resolution work before the real matrix is authored.

**Contract**: One `describe`/`test` importing from `@/lib/stats`; asserts the empty-input base case.

### Success Criteria:

#### Automated Verification:

- `npm test` runs Vitest and the smoke test passes.
- Typecheck still passes: `npx astro check`
- Linting passes on the new files: `npm run lint`

#### Manual Verification:

- `npm test` output shows Vitest discovered and ran the test file (not "no test files found").

---

## Phase 3: Oracle-driven unit tests (full edge matrix)

### Overview

Author the unit tests that lock Risk #1: the full 8-case matrix, every expected value hand-computed from product rules.

### Changes Required:

#### 1. Full unit-test matrix

**File**: `src/lib/stats.test.ts`

**Intent**: Replace the smoke test with comprehensive coverage of every statistic across the edge matrix, asserting against hand-computed literals so a regression (or a future "fix" that breaks the contract) fails loudly. Build small inline fixture factories for `Fight` / `GearSet` / `GearItem` / `GearSetComposition` so each test's data is readable and the oracle is obvious by inspection.

**Contract**: Cover all eight cases from `research.md`, with literal expected values:
- **Empty input** — `totalFights = 0`, `globalWinRate = "—"`, all lists `[]`.
- **Single fight** — counts and a `100%`/`0%` winrate per result.
- **W/L/D mix** — pins the denominator decision: with 1W/1L/1D, `globalWinRate = "33%"` (`wins/total`, `Math.round`). Include a case proving `2/3 → "67%"`.
- **Multi-category** — per-category counts and rates independent; fixed category order; `count>0`/`total>0` filtering drops empty categories.
- **Out-of-set category/result value** — a fight with `weapon_category: "messer"` or `result: "no-contest"` is counted in `totalFights` and the global winrate denominator but appears in no category row (asserts the no-CHECK-constraint behavior).
- **No-gear fight** — a fight with `gear_set_id: null` contributes to fight/winrate stats but nothing to `gearItemCounts` / `gearSetUsage`.
- **Shared-item gear trace** — a gear item belonging to two used sets accrues a count from each (per-set membership); pins FR-019 multi-step join.
- **Opponent ties + >5 cap** — equal-count opponents keep first-seen order; more than five distinct opponents truncate to top 5; exact-string match (same name typed two ways counts separately).

No expected value is produced by calling `computeStats`/the functions under test, snapshotting, or copying the implementation arithmetic.

### Success Criteria:

#### Automated Verification:

- All unit tests pass: `npm test`
- Typecheck passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Spot-check: temporarily flipping the winrate denominator in `stats.ts` (e.g. to `wins/(wins+losses)`) makes the W/L/D-mix test fail — confirming the oracle is independent of the implementation. Revert after checking.

---

## Phase 4: Update test-plan §6.1 cookbook

### Overview

Record the unit-test pattern this phase delivered so future contributors (and `/10x-tdd`) can reuse it.

### Changes Required:

#### 1. Fill in cookbook §6.1

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.1 placeholder ("TBD — see §3 Phase 1") with the concrete recipe this phase established: where unit tests live, the naming convention, the reference test, and the run command. Note the oracle-independence rule as the project's standing convention for aggregation tests.

**Contract**: §6.1 names: location (`src/lib/`, test colocated as `*.test.ts`), naming (`<module>.test.ts`), reference test (`src/lib/stats.test.ts`), run command (`npm test`), and a one-line oracle rule. Do not alter §1–§5 or the §3 status cell (the orchestrator owns that).

### Success Criteria:

#### Automated Verification:

- `test-plan.md` §6.1 no longer contains the string "TBD — see §3 Phase 1".

#### Manual Verification:

- A reader unfamiliar with the project can follow §6.1 to add a new unit test without further questions.

---

## Testing Strategy

### Unit Tests:

- All seven statistic functions + `computeStats`, across the 8-case edge matrix (Phase 3).
- Key edge cases: empty input, W/L/D denominator, out-of-set values, no-gear fights, shared-item gear trace, opponent ties and top-5 cap.

### Integration Tests:

- None in this phase. The Supabase fetch boundary and per-user isolation are rollout Phases 2 and 3.

### Manual Testing Steps:

1. Before Phase 3, seed an account with a known W/L/D mix across ≥2 categories and a gear set used in ≥2 fights; record the rendered numbers.
2. After Phase 1 extraction, reload the stats page and confirm the numbers are identical.
3. Confirm the empty-account state still renders the empty card and `"—"` winrate.

## Performance Considerations

None. Aggregation is in-memory over a single user's data (PRD ceiling ~1,000 fights); extraction is a pure refactor with no added cost. The page keeps one round of Supabase queries.

## Migration Notes

No data or schema migration. Pure code refactor + new dev tooling and tests.

## References

- Related research: `context/changes/testing-statistics-aggregation/research.md`
- Quality contract: `context/foundation/test-plan.md` (Risk #1, §3 Phase 1, §6.1)
- Aggregation source: `src/pages/stats/index.astro:42-108`
- Input types: `src/lib/types.ts:1-37`
- Schema (no CHECK constraint): `supabase/migrations/20260605000003_fights.sql:6-9`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Extract pure aggregation module

#### Automated

- [x] 1.1 Typecheck passes: `npx astro check` — f0233e6
- [x] 1.2 Linting passes: `npm run lint` — f0233e6
- [x] 1.3 Build succeeds: `npm run build` — f0233e6

#### Manual

- [x] 1.4 Stats page renders identical numbers to pre-refactor for a seeded W/L/D + multi-category + shared-gear account — f0233e6
- [x] 1.5 Empty account still shows the empty state and `"—"` winrate — f0233e6

### Phase 2: Bootstrap Vitest

#### Automated

- [x] 2.1 `npm test` runs Vitest and the smoke test passes — f4722dc
- [x] 2.2 Typecheck still passes: `npx astro check` — f4722dc
- [x] 2.3 Linting passes on new files: `npm run lint` — f4722dc

#### Manual

- [x] 2.4 `npm test` output shows Vitest discovered and ran the test file — f4722dc

### Phase 3: Oracle-driven unit tests (full edge matrix)

#### Automated

- [x] 3.1 All unit tests pass: `npm test` — e96f100
- [x] 3.2 Typecheck passes: `npx astro check` — e96f100
- [x] 3.3 Linting passes: `npm run lint` — e96f100

#### Manual

- [x] 3.4 Spot-check: flipping the winrate denominator makes the W/L/D-mix test fail (oracle is implementation-independent), then revert — e96f100

### Phase 4: Update test-plan §6.1 cookbook

#### Automated

- [x] 4.1 `test-plan.md` §6.1 no longer contains "TBD — see §3 Phase 1" — 3521404

#### Manual

- [x] 4.2 A reader can follow §6.1 to add a new unit test without further questions — 3521404
